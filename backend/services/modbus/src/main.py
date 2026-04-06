import os
import time
import json
import struct
import threading
import requests
import paho.mqtt.client as paho_mqtt

from pymodbus.server.sync import StartTcpServer
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusSlaveContext, ModbusServerContext

# Config
MQTT_BROKER_URL = os.getenv("MQTT_BROKER_URL", "mqtt://localhost:1883")
MQTT_HOST = MQTT_BROKER_URL.replace("mqtt://", "").split(":")[0]
MQTT_PORT = int(MQTT_BROKER_URL.split(":")[-1]) if ":" in MQTT_BROKER_URL.replace("mqtt://", "") else 1883
MQTT_TOPICS = os.getenv("MQTT_TOPICS", "rig/live/tier1,rig/live/tier2").split(",")
MQTT_CONFIG_TOPIC = os.getenv("MQTT_TOPIC_CONFIG", "rig/config/update")

MODBUS_PORT = int(os.getenv("MODBUS_PORT", "5020"))

# State
is_service_enabled = True

# PyModbus Datastore (Holding Registers block 0 to 100)
store = ModbusSlaveContext(
    hr=ModbusSequentialDataBlock(0, [0]*100)
)
context = ModbusServerContext(slaves=store, single=True)

# Address Map
address_map = {
    'Depth': 0, 'BitDepth': 2, 'HookLoad': 4, 'WOB': 6, 'RPM': 8, 'Torque': 10, 'SPP': 12
}

def fetch_initial_config():
    global is_service_enabled
    try:
        # Resolves via docker dns
        res = requests.get('http://bore-app-api:3000/api/config', timeout=5)
        if res.status_code == 200:
            data = res.json().get('data', [])
            conf = next((c for c in data if c['service_name'] == 'modbus'), None)
            if conf:
                is_service_enabled = conf.get('is_enabled', True)
                if not is_service_enabled:
                    clear_registers()
    except Exception as e:
        print(f"[Config] Could not fetch initial config: {e}")

def write_float32(address, value):
    """Writes a 32-bit float to 2 continuous 16-bit registers (Big Endian standard)."""
    if value is None:
        return
    try:
        # Pack float to 4 bytes, then unpack to two 16-bit ints
        packed = struct.pack('>f', float(value))
        r1, r2 = struct.unpack('>HH', packed)
        store.setValues(3, address, [r1, r2]) # Type 3 = Holding Registers
    except ValueError:
        pass # Ignore bad conversions

def clear_registers():
    store.setValues(3, 0, [0]*100)

def on_mqtt_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[MQTT] Connected to {MQTT_HOST}:{MQTT_PORT}")
        for t in MQTT_TOPICS:
            client.subscribe(t)
        client.subscribe(MQTT_CONFIG_TOPIC)
    else:
        print(f"[MQTT] Fail: {reason_code}")

def on_mqtt_message(client, userdata, msg):
    global is_service_enabled
    try:
        payload = json.loads(msg.payload.decode())
        topic = msg.topic
        
        if topic == MQTT_CONFIG_TOPIC:
            if payload.get("service_name") == "modbus":
                print(f"[CONFIG] Updated: {payload}")
                is_service_enabled = payload.get("is_enabled", True)
                if not is_service_enabled:
                    clear_registers()
                    
        elif is_service_enabled and topic in MQTT_TOPICS:
            # Look for specific rig tags directly or wrapped inside payload['data']
            # Based on tiered ingestion format: payload is typically {"timestamp": ..., "tier": ..., "data": {"Tag": 1.0}}
            data = payload.get("data", payload) 
            
            for key, addr in address_map.items():
                if key in data:
                    write_float32(addr, data[key])
                    
    except Exception as e:
        print(f"[MQTT] Error handling msg: {e}")

def mqtt_thread():
    client = paho_mqtt.Client(paho_mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_mqtt_connect
    client.on_message = on_mqtt_message
    
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, 60)
            client.loop_forever()
        except Exception as e:
            print(f"[MQTT] Reconnecting... {e}")
            time.sleep(5)

if __name__ == "__main__":
    fetch_initial_config()
    
    # Start MQTT loop in daemon thread
    t = threading.Thread(target=mqtt_thread, daemon=True)
    t.start()
    
    # Start Modbus server
    print(f"[Modbus] TCP Server starting on port {MODBUS_PORT}...")
    StartTcpServer(context=context, address=("0.0.0.0", MODBUS_PORT))
