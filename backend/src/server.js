const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Client } = require('pg');
const mqtt = require('mqtt');

// Configuration
const PORT = process.env.PORT || 3000;
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'rig/live/data';
const PGUSER = process.env.PG_USER || 'postgres';
const PGPASSWORD = process.env.PG_PASSWORD || 'postgres';
const PGHOST = process.env.PG_HOST || 'localhost';
const PGPORT = process.env.PG_PORT || '5432';
const PGDATABASE = process.env.PG_DATABASE || 'boredb';

// App Setup
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for local development
    }
});

// Database Setup
const dbClient = new Client({
    user: PGUSER,
    password: PGPASSWORD,
    host: PGHOST,
    port: PGPORT,
    database: PGDATABASE,
});

dbClient.connect()
    .then(async () => {
        console.log('[DB] Connected to TimescaleDB for history and config queries.');
        // Initialize Config Table
        const configTableQuery = `
            CREATE TABLE IF NOT EXISTS transmission_config (
                id SERIAL PRIMARY KEY,
                service_name VARCHAR(50) UNIQUE NOT NULL,
                is_enabled BOOLEAN DEFAULT true,
                settings JSONB DEFAULT '{}'
            );
        `;
        await dbClient.query(configTableQuery);
        
        // Seed default config if empty
        const countRes = await dbClient.query('SELECT COUNT(*) FROM transmission_config');
        if (countRes.rows[0].count === '0') {
            await dbClient.query(`INSERT INTO transmission_config (service_name, is_enabled, settings) VALUES ('witsml', true, '{"wellName":"Boredom-Rig-1", "wellId":"W-1", "wellboreName":"Main-Bore"}')`);
            await dbClient.query(`INSERT INTO transmission_config (service_name, is_enabled, settings) VALUES ('modbus', true, '{"port":5020}')`);
        }
    })
    .catch(err => console.error('[DB] Connection error:', err));

// MQTT Setup for live data streaming
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
    console.log(`[MQTT] Connected to broker at ${MQTT_BROKER_URL}`);
    mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (!err) {
            console.log(`[MQTT] Listening to topic: ${MQTT_TOPIC} and streaming to clients.`);
        }
    });
});

mqttClient.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        // Broadcast the live rig payload to all connected WebSocket clients
        io.emit('live_data', data);
    } catch (err) {
        console.error('[MQTT] Error parsing message to stream:', err);
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
    });
});

// REST API for Historical Data
app.get('/api/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 1000;
        const minutes = parseInt(req.query.minutes, 10) || 60; // default last 60 minutes
        
        const query = `
            SELECT * FROM drilling_data
            WHERE time >= NOW() - INTERVAL '${minutes} minutes'
            ORDER BY time ASC
            LIMIT $1
        `;
        const result = await dbClient.query(query, [limit]);
        
        res.status(200).json({
            success: true,
            count: result.rowCount,
            data: result.rows
        });
    } catch (err) {
        console.error('[API] Error querying history:', err);
        res.status(500).json({ success: false, error: 'Database query failed' });
    }
});

// REST API for Configuration
app.get('/api/config', async (req, res) => {
    try {
        const result = await dbClient.query('SELECT * FROM transmission_config ORDER BY service_name DESC');
        res.json({ success: true, data: result.rows });
    } catch(err) {
        console.error('[API] Error querying config:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { service_name, is_enabled, settings } = req.body;
        const query = `
            UPDATE transmission_config
            SET is_enabled = $1, settings = $2
            WHERE service_name = $3
            RETURNING *;
        `;
        const result = await dbClient.query(query, [is_enabled, settings, service_name]);
        
        if (result.rowCount > 0) {
            // Broadcast the update to microservices via MQTT
            const updatePayload = {
                service_name,
                is_enabled,
                settings
            };
            mqttClient.publish('rig/config/update', JSON.stringify(updatePayload), { qos: 1 });
            
            res.json({ success: true, data: result.rows[0] });
        } else {
            res.status(404).json({ success: false, error: "Service not found" });
        }
    } catch(err) {
        console.error('[API] Error updating config:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start Server
server.listen(PORT, () => {
    console.log(`[API] Server listening on port ${PORT}`);
});
