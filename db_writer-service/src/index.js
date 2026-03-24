const mqtt = require('mqtt');
const { Client } = require('pg');

// Environment configurations
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'rig/live/data';
const PGUSER = process.env.PG_USER || 'postgres';
const PGPASSWORD = process.env.PG_PASSWORD || 'postgres';
const PGHOST = process.env.PG_HOST || 'localhost';
const PGPORT = process.env.PG_PORT || '5432';
const PGDATABASE = process.env.PG_DATABASE || 'boredb';

const dbClient = new Client({
    user: PGUSER,
    password: PGPASSWORD,
    host: PGHOST,
    port: PGPORT,
    database: PGDATABASE,
});

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

async function initDB() {
    console.log(`[DB] Connecting to TimescaleDB at ${PGHOST}:${PGPORT}...`);
    try {
        await dbClient.connect();
        console.log('[DB] Connected successfully to PostgreSQL/TimescaleDB.');

        // 1. Create the table if it doesn't exist
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS drilling_data (
                time TIMESTAMPTZ NOT NULL,
                depth REAL,
                bit_depth REAL,
                hook_load REAL,
                wob REAL,
                rpm REAL,
                torque REAL,
                spp REAL
            );
        `;
        await dbClient.query(createTableQuery);

        // 2. Turn it into a hypertable
        // By default, create_hypertable will fail if it's already a hypertable, so conditionally create it
        const createHypertableQuery = `
            SELECT create_hypertable('drilling_data', 'time', if_not_exists => TRUE);
        `;
        await dbClient.query(createHypertableQuery);
        console.log('[DB] drilling_data table initialized as a hypertable.');

    } catch (err) {
        console.error('[DB] Error during initialization:', err);
        process.exit(1); // Exit so Docker can restart the container
    }
}

async function startService() {
    await initDB();

    mqttClient.on('connect', () => {
        console.log(`[MQTT] Connected to broker at ${MQTT_BROKER_URL}`);
        mqttClient.subscribe(MQTT_TOPIC, (err) => {
            if (!err) {
                console.log(`[MQTT] Subscribed to topic: ${MQTT_TOPIC}`);
            } else {
                console.error(`[MQTT] Subscription error:`, err);
            }
        });
    });

    mqttClient.on('message', async (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            // Map the JSON structure to db fields
            const timestamp = data.timestamp || new Date().toISOString(); 
            const depth = data.Depth || null;
            const bitDepth = data.BitDepth || null;
            const hookLoad = data.HookLoad || null;
            const wob = data.WOB || null;
            const rpm = data.RPM || null;
            const torque = data.Torque || null;
            const spp = data.SPP || null;

            const insertQuery = `
                INSERT INTO drilling_data (time, depth, bit_depth, hook_load, wob, rpm, torque, spp)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            await dbClient.query(insertQuery, [timestamp, depth, bitDepth, hookLoad, wob, rpm, torque, spp]);
        } catch (err) {
            console.error(`[DB] Error inserting message:`, err, 'Message:', message.toString());
        }
    });

    mqttClient.on('error', (err) => {
        console.error(`[MQTT] Connection error:`, err);
    });
}

startService();
