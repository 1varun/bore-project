import os
import json
import asyncio
from datetime import datetime
from fastapi import FastAPI, Response
import paho.mqtt.client as paho_mqtt
import requests

# Config
PORT = int(os.getenv("PORT", 8080))
MQTT_BROKER_URL = os.getenv("MQTT_BROKER_URL", "mqtt://localhost:1883")
MQTT_HOST = MQTT_BROKER_URL.replace("mqtt://", "").split(":")[0]
MQTT_PORT = int(MQTT_BROKER_URL.split(":")[-1]) if ":" in MQTT_BROKER_URL.replace("mqtt://", "") else 1883
MQTT_TOPICS = os.getenv("MQTT_TOPICS", "rig/live/tier1,rig/live/tier2").split(",")
MQTT_CONFIG_TOPIC = os.getenv("MQTT_TOPIC_CONFIG", "rig/config/update")

# State
is_service_enabled = True
witsml_config = {
    "wellName": "Boredom-Rig-1",
    "wellId": "W-1",
    "wellboreName": "Main-Bore"
}

latest_data = {
    "Depth": 0, "BitDepth": 0, "HookLoad": 0, "WOB": 0, "RPM": 0, "Torque": 0, "SPP": 0,
    "timestamp": datetime.utcnow().isoformat()
}

app = FastAPI(title="WITSML Gateway")

def fetch_initial_config():
    global is_service_enabled, witsml_config
    try:
        res = requests.get('http://bore-app-api:3000/api/config', timeout=5)
        if res.status_code == 200:
            data = res.json().get('data', [])
            conf = next((c for c in data if c['service_name'] == 'witsml'), None)
            if conf:
                is_service_enabled = conf.get('is_enabled', True)
                witsml_config.update(conf.get('settings', {}))
    except Exception as e:
        print(f"[Config] Could not fetch initial config: {e}")

def on_mqtt_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[MQTT] Connected to broker at {MQTT_HOST}:{MQTT_PORT}")
        for t in MQTT_TOPICS:
            client.subscribe(t)
        client.subscribe(MQTT_CONFIG_TOPIC)
    else:
        print(f"[MQTT] Fail: {reason_code}")

def on_mqtt_message(client, userdata, msg):
    global is_service_enabled, witsml_config, latest_data
    try:
        payload = json.loads(msg.payload.decode())
        topic = msg.topic
        
        if topic == MQTT_CONFIG_TOPIC:
            if payload.get("service_name") == "witsml":
                print(f"[CONFIG] Updated: {payload}")
                is_service_enabled = payload.get("is_enabled", True)
                witsml_config.update(payload.get("settings", {}))
                
        elif is_service_enabled and topic in MQTT_TOPICS:
            # Based on tiered ingestion format: {"timestamp": ..., "tier": ..., "data": {"Tag": 1.0}}
            data = payload.get("data", payload) 
            # Merge matching keys
            for key in latest_data.keys():
                if key in data:
                    latest_data[key] = data[key]
            latest_data["timestamp"] = payload.get("timestamp", datetime.utcnow().isoformat())
            
    except Exception as e:
        print(f"[MQTT] Error handling msg: {e}")

async def start_mqtt():
    """Starts the Paho MQTT client in the background."""
    client = paho_mqtt.Client(paho_mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_mqtt_connect
    client.on_message = on_mqtt_message
    
    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_start() 
        print("[MQTT] Background thread started.")
    except Exception as e:
        print(f"[MQTT] Exception connecting: {e}")

@app.on_event("startup")
async def startup_event():
    fetch_initial_config()
    asyncio.create_task(start_mqtt())

@app.get("/witsml/logs")
async def witsml_logs():
    if not is_service_enabled:
        return Response(content="<error>Service Temporarily Disabled by Administrator</error>", media_type="application/xml", status_code=503)

    # Simple XML Generation matching the exact string format expected by consumers
    xml_data = f'''<?xml version="1.0" encoding="UTF-8"?>
<logs xmlns="http://www.witsml.org/schemas/1series" version="1.4.1.1">
  <log uidWell="{witsml_config.get('wellId')}" uidWellbore="WB-1" uid="LOG-Livedata">
    <nameWell>{witsml_config.get('wellName')}</nameWell>
    <nameWellbore>{witsml_config.get('wellboreName')}</nameWellbore>
    <name>Live Rig Surface Data</name>
    <serviceCompany>ONGC</serviceCompany>
    <creationDate>{latest_data['timestamp']}</creationDate>
    <logData>
      <mnemonicList>DEPTH,HOOKLOAD,WOB,RPM,TORQUE,SPP</mnemonicList>
      <unitList>ft,klbs,klbs,rpm,ft-lbs,psi</unitList>
      <data>{latest_data.get('Depth',0)},{latest_data.get('HookLoad',0)},{latest_data.get('WOB',0)},{latest_data.get('RPM',0)},{latest_data.get('Torque',0)},{latest_data.get('SPP',0)}</data>
    </logData>
  </log>
</logs>'''

    return Response(content=xml_data, media_type="application/xml")
