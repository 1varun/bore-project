require('dotenv').config();
const mqtt = require('mqtt');
const nodes7 = require('nodes7'); // Used for Siemens S7 PLC communication

// Configuration
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'rig/live/data';
const PLC_IP = process.env.PLC_IP_ADDRESS || '192.168.0.1';
const PLC_RACK = parseInt(process.env.PLC_RACK || '0', 10);
const PLC_SLOT = parseInt(process.env.PLC_SLOT || '1', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '1000', 10);
const SIMULATE_PLC = process.env.SIMULATE_PLC === 'true';

// MQTT Client
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
    console.log(`[MQTT] Connected to broker at ${MQTT_BROKER_URL}`);
});

mqttClient.on('error', (err) => {
    console.error(`[MQTT] Connection error:`, err);
});

// PLC Connection setup
const s7Conn = new nodes7;
let plcConnected = false;

const plcConfig = {
    port: 102,
    host: PLC_IP,
    rack: PLC_RACK,
    slot: PLC_SLOT
};

// Variable translations (Example addresses in Data Block 1)
const variables = {
    Depth: 'DB1,REAL0',
    BitDepth: 'DB1,REAL4',
    HookLoad: 'DB1,REAL8',
    WOB: 'DB1,REAL12',
    RPM: 'DB1,REAL16',
    Torque: 'DB1,REAL20',
    SPP: 'DB1,REAL24' // Standpipe Pressure
};

function startPolling() {
    setInterval(() => {
        if (SIMULATE_PLC) {
            publishSimulatedData();
        } else {
            if (plcConnected) {
                readFromPLC();
            }
        }
    }, POLL_INTERVAL_MS);
}

function publishSimulatedData() {
    // Generate realistic fluctuating simulated data
    const payload = {
        timestamp: new Date().toISOString(),
        Depth: parseFloat((Math.random() * 2 + 3000).toFixed(2)),
        BitDepth: parseFloat((Math.random() * 2 + 3000).toFixed(2)),
        HookLoad: parseFloat((Math.random() * 5 + 150).toFixed(2)),
        WOB: parseFloat((Math.random() * 2 + 10).toFixed(2)),
        RPM: parseFloat((Math.random() * 5 + 120).toFixed(2)),
        Torque: parseFloat((Math.random() * 100 + 4000).toFixed(2)),
        SPP: parseFloat((Math.random() * 50 + 2000).toFixed(2))
    };

    publishToMqtt(payload);
}

function readFromPLC() {
    s7Conn.readAllItems((err, values) => {
        if (err) {
            console.error('[PLC] Error reading items:', err);
            return;
        }
        
        const payload = {
            timestamp: new Date().toISOString(),
            ...values
        };
        
        publishToMqtt(payload);
    });
}

function publishToMqtt(payload) {
    if (!mqttClient.connected) return;
    mqttClient.publish(MQTT_TOPIC, JSON.stringify(payload), { qos: 0 }, (err) => {
        if (err) {
            console.error(`[MQTT] Failed to publish message:`, err);
        } else {
            console.log(`[MQTT] Published data to ${MQTT_TOPIC} ->`, payload);
        }
    });
}

// Initialization Flow
console.log('Starting Ingestion Service...');

if (!SIMULATE_PLC) {
    console.log(`[PLC] Attempting connection to ${PLC_IP}...`);
    s7Conn.initiateConnection(plcConfig, (err) => {
        if (typeof(err) !== "undefined") {
            console.error('[PLC] Failed to connect:', err);
            console.log('[PLC] Falling back to SIMULATION mode...');
            plcConnected = false;
        } else {
            console.log('[PLC] Connected successfully to S7-1500!');
            plcConnected = true;
            s7Conn.setTranslationCB((tag) => variables[tag]);
            s7Conn.addItems(Object.keys(variables));
        }
        startPolling();
    });
} else {
    console.log('[SYS] SIMULATE_PLC is true. Running in simulation mode.');
    startPolling();
}
