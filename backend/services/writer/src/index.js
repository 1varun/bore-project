const mqtt = require('mqtt');
const { Pool } = require('pg');

// ── Config ────────────────────────────────────────────────────────────────────
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_TOPICS     = ['rig/live/tier1', 'rig/live/tier2'];
const DB_RETRY_DELAY  = parseInt(process.env.DB_RETRY_DELAY  || '5000', 10); // ms
const LOG_EVERY_N     = parseInt(process.env.LOG_EVERY_N     || '100',  10); // log 1-in-N batches

// ── DB Pool — auto-reconnects on connection loss ──────────────────────────────
const pool = new Pool({
    user:     process.env.PG_USER     || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    host:     process.env.PG_HOST     || 'localhost',
    port:     process.env.PG_PORT     || '5432',
    database: process.env.PG_DATABASE || 'boredb',
    max:      5,          // max pool size
    idleTimeoutMillis:    30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

// ── DB init with retry ────────────────────────────────────────────────────────
async function initDB() {
    while (true) {
        try {
            console.log('[DB] Connecting to TimescaleDB...');
            const client = await pool.connect();

            // 1. Metadata table (DEFAULT 2 = low-freq, consistent with data_ingestion)
            await client.query(`
                CREATE TABLE IF NOT EXISTS opc_tags (
                    tag_name   TEXT PRIMARY KEY,
                    node_path  TEXT NOT NULL,
                    category   TEXT,
                    equipment  TEXT,
                    type       TEXT,
                    description TEXT,
                    unit       TEXT,
                    is_active  BOOLEAN DEFAULT TRUE,
                    logging_tier INTEGER DEFAULT 2
                );
            `);

            // 2. EAV Historical Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS tag_data (
                    time     TIMESTAMPTZ NOT NULL,
                    tag_name TEXT NOT NULL,
                    value    DOUBLE PRECISION
                );
            `);
            await client.query(`SELECT create_hypertable('tag_data', 'time', if_not_exists => TRUE);`);
            await client.query(`CREATE INDEX IF NOT EXISTS tag_data_tag_name_idx ON tag_data (tag_name, time DESC);`);

            // 3. Current Value Snapshot
            await client.query(`
                CREATE TABLE IF NOT EXISTS tag_current (
                    tag_name TEXT PRIMARY KEY,
                    time     TIMESTAMPTZ NOT NULL,
                    value    DOUBLE PRECISION
                );
            `);

            // 4. Legacy Wide Table (kept for schema compatibility)
            await client.query(`
                CREATE TABLE IF NOT EXISTS drilling_data (
                    time      TIMESTAMPTZ NOT NULL,
                    depth     REAL,
                    bit_depth REAL,
                    hook_load REAL,
                    wob       REAL,
                    rpm       REAL,
                    torque    REAL,
                    spp       REAL
                );
            `);
            await client.query(`SELECT create_hypertable('drilling_data', 'time', if_not_exists => TRUE);`);

            client.release();
            console.log('[DB] Tables initialized successfully.');
            return; // success — exit retry loop

        } catch (err) {
            console.error(`[DB] Init failed: ${err.message}. Retrying in ${DB_RETRY_DELAY / 1000}s...`);
            await new Promise(r => setTimeout(r, DB_RETRY_DELAY));
        }
    }
}

// ── Message handler ───────────────────────────────────────────────────────────
let msgCount = 0;

async function handleMessage(topic, message) {
    let payload;
    try {
        payload = JSON.parse(message.toString());
    } catch {
        console.error(`[MQTT] Invalid JSON on ${topic}`);
        return;
    }

    const { timestamp, tier, data } = payload;
    if (!data || Object.keys(data).length === 0) return;

    const entries   = Object.entries(data);
    const tagNames  = entries.map(([k]) => k);
    const tagValues = entries.map(([, v]) => {
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 1.0 : 0.0;
        if (typeof v === 'string') {
            const parsed = parseFloat(v);
            return isNaN(parsed) ? null : parsed;
        }
        return null; // Fallback for unsupported objects/arrays
    });

    try {
        // 1. Bulk upsert into tag_current (snapshot — always latest value)
        await pool.query(`
            INSERT INTO tag_current (tag_name, time, value)
            SELECT unnest($1::text[]), $2, unnest($3::double precision[])
            ON CONFLICT (tag_name) DO UPDATE SET
                time  = EXCLUDED.time,
                value = EXCLUDED.value
            WHERE EXCLUDED.time > tag_current.time
        `, [tagNames, timestamp, tagValues]);

        // 2. Bulk insert into tag_data (history)
        await pool.query(`
            INSERT INTO tag_data (time, tag_name, value)
            SELECT $1, unnest($2::text[]), unnest($3::double precision[])
        `, [timestamp, tagNames, tagValues]);

        // Throttled logging — 1 log line per LOG_EVERY_N batches
        msgCount++;
        if (msgCount % LOG_EVERY_N === 0) {
            console.log(`[DB] Batches processed: ${msgCount} | Last: ${entries.length} tags from ${topic} (Tier ${tier})`);
        }

    } catch (err) {
        console.error(`[DB] Write error on ${topic}: ${err.message}`);
        // Message is lost — but pool will auto-reconnect for next message
        // Future improvement: add a local queue/retry buffer here
    }
}

// ── MQTT setup ────────────────────────────────────────────────────────────────
function startMQTT() {
    const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
        reconnectPeriod: 3000, // auto-reconnect every 3s if disconnected
        connectTimeout:  10000,
    });

    mqttClient.on('connect', () => {
        console.log(`[MQTT] Connected to broker at ${MQTT_BROKER_URL}`);
        MQTT_TOPICS.forEach(topic => {
            mqttClient.subscribe(topic, (err) => {
                if (err) console.error(`[MQTT] Subscribe error on ${topic}:`, err.message);
                else     console.log(`[MQTT] Subscribed to: ${topic}`);
            });
        });
    });

    mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting to broker...'));
    mqttClient.on('offline',   () => console.warn('[MQTT] Broker offline. Waiting for reconnect...'));
    mqttClient.on('error',     (err) => console.error('[MQTT] Error:', err.message));

    // Non-async wrapper — ensures MQTT listener never throws unhandled promise rejection
    mqttClient.on('message', (topic, message) => {
        handleMessage(topic, message).catch(err =>
            console.error(`[DB] Unhandled error in handleMessage: ${err.message}`)
        );
    });

    return mqttClient;
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function setupGracefulShutdown(mqttClient) {
    const shutdown = async (signal) => {
        console.log(`\n[SERVICE] ${signal} received — shutting down gracefully...`);
        mqttClient.end(true, {}, async () => {
            console.log('[MQTT] Client closed.');
            await pool.end();
            console.log('[DB] Pool closed. Goodbye.');
            process.exit(0);
        });
        // Force exit if graceful shutdown takes too long
        setTimeout(() => { console.error('[SERVICE] Forced exit.'); process.exit(1); }, 8000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function startService() {
    await initDB();
    const mqttClient = startMQTT();
    setupGracefulShutdown(mqttClient);
}

startService();
