const express = require('express');
const mqtt = require('mqtt');
const { create } = require('xmlbuilder2');

// Config
const PORT = process.env.PORT || 8080;
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mqtt:1883';
const MQTT_TOPIC_DATA = process.env.MQTT_TOPIC_DATA || 'rig/live/data';
const MQTT_TOPIC_CONFIG = process.env.MQTT_TOPIC_CONFIG || 'rig/config/update';

// State
let isServiceEnabled = true;
let witsmlConfig = {
    wellName: "Boredom-Rig-1",
    wellId: "W-1",
    wellboreName: "Main-Bore"
};

let latestData = {
    Depth: 0, BitDepth: 0, HookLoad: 0, WOB: 0, RPM: 0, Torque: 0, SPP: 0,
    timestamp: new Date().toISOString()
};

// Initial config polling
fetch('http://boreproject_backend:3000/api/config')
    .then(r => r.json())
    .then(json => {
        const conf = json.data?.find(c => c.service_name === 'witsml');
        if (conf) {
            isServiceEnabled = conf.is_enabled;
            witsmlConfig = { ...witsmlConfig, ...conf.settings };
        }
    })
    .catch(err => console.error('[Config] Could not fetch initial config:', err));

// MQTT setup
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
            latestData = { ...latestData, ...payload };
        } else if (topic === MQTT_TOPIC_CONFIG) {
            if (payload.service_name === 'witsml') {
                console.log('[CONFIG] WITSML Config updated:', payload);
                isServiceEnabled = payload.is_enabled;
                witsmlConfig = { ...witsmlConfig, ...payload.settings };
            }
        }
    } catch (err) {
        console.error('[MQTT] Parsing error:', err);
    }
});

// Express App
const app = express();

app.get('/witsml/logs', (req, res) => {
    if (!isServiceEnabled) {
        res.set('Content-Type', 'application/xml');
        return res.status(503).send('<error>Service Temporarily Disabled by Administrator</error>');
    }

    try {
        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('logs', { xmlns: 'http://www.witsml.org/schemas/1series', version: '1.4.1.1' })
                .ele('log', { uidWell: witsmlConfig.wellId, uidWellbore: "WB-1", uid: "LOG-Livedata" })
                    .ele('nameWell').txt(witsmlConfig.wellName).up()
                    .ele('nameWellbore').txt(witsmlConfig.wellboreName).up()
                    .ele('name').txt("Live Rig Surface Data").up()
                    .ele('serviceCompany').txt("ONGC").up()
                    .ele('creationDate').txt(latestData.timestamp).up()
                    .ele('logData')
                        .ele('mnemonicList').txt("DEPTH,HOOKLOAD,WOB,RPM,TORQUE,SPP").up()
                        .ele('unitList').txt("ft,klbs,klbs,rpm,ft-lbs,psi").up()
                        .ele('data').txt(`${latestData.Depth},${latestData.HookLoad},${latestData.WOB},${latestData.RPM},${latestData.Torque},${latestData.SPP}`).up()
                    .up()
                .up()
            .up();

        res.set('Content-Type', 'application/xml');
        res.status(200).send(doc.end({ prettyPrint: true }));
    } catch(err) {
        console.error('[WITSML] Error generating XML:', err);
        res.status(500).send('<error>Internal Server Error</error>');
    }
});

app.listen(PORT, () => {
    console.log(`[WITSML] Gateway listening on http://0.0.0.0:${PORT}`);
});
