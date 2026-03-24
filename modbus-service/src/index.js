const mqtt = require('mqtt');
const ModbusRTU = require('modbus-serial');

// Config
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mqtt:1883';
const MQTT_TOPIC_DATA = process.env.MQTT_TOPIC_DATA || 'rig/live/data';
const MQTT_TOPIC_CONFIG = process.env.MQTT_TOPIC_CONFIG || 'rig/config/update';
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT || '5020', 10);

let isServiceEnabled = true;

// Initial config polling
fetch('http://boreproject_backend:3000/api/config')
    .then(r => r.json())
    .then(json => {
        const conf = json.data?.find(c => c.service_name === 'modbus');
        if (conf) {
            isServiceEnabled = conf.is_enabled;
            if (!isServiceEnabled) clearRegisters();
        }
    })
    .catch(err => console.error('[Config] Could not fetch initial config:', err));


const holdingRegisters = new Array(100).fill(0);

const vector = {
    getHoldingRegister: function(addr, unitID, callback) {
        callback(null, holdingRegisters[addr]);
    },
    setHoldingRegister: function(addr, value, unitID, callback) {
        if(isServiceEnabled) holdingRegisters[addr] = value;
        callback(null);
    }
};

const serverTCP = new ModbusRTU.ServerTCP(vector, { host: '0.0.0.0', port: MODBUS_PORT, debug: true, unitID: 1 });
console.log(`[Modbus] TCP Server listening on port ${MODBUS_PORT}`);

// Helper to write a 32-bit float to two 16-bit Modbus registers
function writeFloat32ToRegisters(startAddr, value) {
    if (value === undefined || value === null) return;
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(value, 0); // Big Endian is standard for Modbus
    holdingRegisters[startAddr] = buf.readUInt16BE(0);
    holdingRegisters[startAddr + 1] = buf.readUInt16BE(2);
}

function clearRegisters() {
    for (let i = 0; i < holdingRegisters.length; i++) holdingRegisters[i] = 0;
}

// Map rig properties to register addresses
const addressMap = {
    'Depth': 0, 'BitDepth': 2, 'HookLoad': 4, 'WOB': 6, 'RPM': 8, 'Torque': 10, 'SPP': 12
};

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
    console.log(`[MQTT] Connected to broker at ${MQTT_BROKER_URL}`);
    mqttClient.subscribe(MQTT_TOPIC_DATA);
    mqttClient.subscribe(MQTT_TOPIC_CONFIG);
});

mqttClient.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        if (topic === MQTT_TOPIC_DATA && isServiceEnabled) {
            if (payload.Depth !== undefined) writeFloat32ToRegisters(addressMap['Depth'], Number(payload.Depth));
            if (payload.BitDepth !== undefined) writeFloat32ToRegisters(addressMap['BitDepth'], Number(payload.BitDepth));
            if (payload.HookLoad !== undefined) writeFloat32ToRegisters(addressMap['HookLoad'], Number(payload.HookLoad));
            if (payload.WOB !== undefined) writeFloat32ToRegisters(addressMap['WOB'], Number(payload.WOB));
            if (payload.RPM !== undefined) writeFloat32ToRegisters(addressMap['RPM'], Number(payload.RPM));
            if (payload.Torque !== undefined) writeFloat32ToRegisters(addressMap['Torque'], Number(payload.Torque));
            if (payload.SPP !== undefined) writeFloat32ToRegisters(addressMap['SPP'], Number(payload.SPP));
        } else if (topic === MQTT_TOPIC_CONFIG) {
            if (payload.service_name === 'modbus') {
                console.log('[CONFIG] Modbus Config updated:', payload);
                isServiceEnabled = payload.is_enabled;
                if (!isServiceEnabled) clearRegisters();
            }
        }
    } catch(err) {
        console.error('[MQTT] Error processing message:', err);
    }
});

serverTCP.on('socketError', function(err){
    console.error('[Modbus] Error:', err);
});
