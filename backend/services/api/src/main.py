import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncpg
import paho.mqtt.client as paho_mqtt

# Configuration
PORT = int(os.getenv("PORT", 3000))
MQTT_BROKER_URL = os.getenv("MQTT_BROKER_URL", "mqtt://localhost:1883")
MQTT_HOST = MQTT_BROKER_URL.replace("mqtt://", "").split(":")[0]
MQTT_PORT = int(MQTT_BROKER_URL.split(":")[-1]) if ":" in MQTT_BROKER_URL.replace("mqtt://", "") else 1883
MQTT_TOPICS_STR = os.getenv("MQTT_TOPICS", "rig/live/tier1,rig/live/tier2")
MQTT_TOPICS = MQTT_TOPICS_STR.split(",")

PGUSER = os.getenv("PG_USER", "postgres")
PGPASSWORD = os.getenv("PG_PASSWORD", "postgres")
PGHOST = os.getenv("PG_HOST", "localhost")
PGPORT = os.getenv("PG_PORT", "5432")
PGDATABASE = os.getenv("PG_DATABASE", "boredb")

app = FastAPI(title="Bore Project API")

# Allow all origins for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
db_pool: asyncpg.Pool = None
active_websockets: set[WebSocket] = set()

# ------------------------------------------------------------------------------
# Pydantic Models for Validation
# ------------------------------------------------------------------------------
class ConfigUpdateReq(BaseModel):
    service_name: str
    is_enabled: bool
    settings: Dict[str, Any]

# ------------------------------------------------------------------------------
# MQTT Callbacks & Background Task
# ------------------------------------------------------------------------------
def on_mqtt_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[MQTT] Connected to broker at {MQTT_HOST}:{MQTT_PORT}")
        for topic in MQTT_TOPICS:
            client.subscribe(topic)
            print(f"[MQTT] Subscribed to {topic}")
    else:
        print(f"[MQTT] Failed to connect, Code: {reason_code}")

broadcast_count = 0

def on_mqtt_message(client, userdata, msg):
    global broadcast_count
    try:
        # Paho MQTT uses a separate thread, but we need to push to asyncio active websockets
        payload = msg.payload.decode()
        data = json.loads(payload)
        
        # Throttled logging for heartbeat
        broadcast_count += 1
        if broadcast_count % 50 == 0:
            tag_count = len(data.get("data", {}))
            print(f"[WS] Broadcast Heartbeat: Tier {data.get('tier')} | Tags: {tag_count}")

        # We must use the current running asyncio loop to broadcast safely
        loop = userdata.get('loop')
        if loop and not loop.is_closed():
            asyncio.run_coroutine_threadsafe(broadcast_to_websockets(data), loop)
            
    except Exception as e:
        print(f"[MQTT] Error processing message: {e}")

async def broadcast_to_websockets(data: dict):
    if not active_websockets:
        return
        
    dead_sockets = set()
    for ws in active_websockets:
        try:
            await ws.send_json(data)
        except Exception:
            dead_sockets.add(ws)
            
    for ws in dead_sockets:
        active_websockets.discard(ws)

async def start_mqtt():
    """Starts the Paho MQTT client in the background."""
    client = paho_mqtt.Client(paho_mqtt.CallbackAPIVersion.VERSION2, userdata={'loop': asyncio.get_running_loop()})
    client.on_connect = on_mqtt_connect
    client.on_message = on_mqtt_message
    
    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_start() 
        print("[MQTT] Background thread started.")
    except Exception as e:
        print(f"[MQTT] Exception connecting to broker (will retry organically?): {e}")

# ------------------------------------------------------------------------------
# Database Lifecycle
# ------------------------------------------------------------------------------
async def init_db():
    global db_pool
    db_pool = await asyncpg.create_pool(
        user=PGUSER, password=PGPASSWORD, host=PGHOST, port=PGPORT, database=PGDATABASE,
        min_size=1, max_size=10
    )
    print("[DB] Connected to TimescaleDB pool.")
    
    async with db_pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS transmission_config (
                id SERIAL PRIMARY KEY,
                service_name VARCHAR(50) UNIQUE NOT NULL,
                is_enabled BOOLEAN DEFAULT true,
                settings JSONB DEFAULT '{}'
            );
        """)
        
        count = await conn.fetchval("SELECT COUNT(*) FROM transmission_config")
        if count == 0:
            await conn.execute("""
                INSERT INTO transmission_config (service_name, is_enabled, settings) 
                VALUES 
                ('witsml', true, '{"wellName":"Boredom-Rig-1", "wellId":"W-1", "wellboreName":"Main-Bore"}'),
                ('modbus', true, '{"port":5020}')
            """)
            print("[DB] Config seeded.")

@app.on_event("startup")
async def startup_event():
    await init_db()
    # The MQTT client connects in background
    asyncio.create_task(start_mqtt())

@app.on_event("shutdown")
async def shutdown_event():
    if db_pool:
        await db_pool.close()

# ------------------------------------------------------------------------------
# REST Routes
# ------------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}

@app.get("/api/history")
async def get_history(
    limit: int = Query(5000), 
    minutes: int = Query(60), 
    tags: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
):
    try:
        async with db_pool.acquire() as conn:
            if tags:
                tag_list = tags.split(",")
                if start_time and end_time:
                    records = await conn.fetch("""
                        SELECT time, tag_name, value FROM tag_data 
                        WHERE time >= $3::timestamptz AND time <= $4::timestamptz 
                          AND tag_name = ANY($1::text[]) 
                        ORDER BY time DESC LIMIT $2
                    """, tag_list, limit, start_time, end_time)
                else:
                    records = await conn.fetch(f"""
                        SELECT time, tag_name, value FROM tag_data 
                        WHERE time >= NOW() - INTERVAL '{minutes} minutes' 
                          AND tag_name = ANY($1::text[]) 
                        ORDER BY time DESC LIMIT $2
                    """, tag_list, limit)
            else:
                if start_time and end_time:
                    records = await conn.fetch("""
                        SELECT time, tag_name, value FROM tag_data 
                        WHERE time >= $2::timestamptz AND time <= $3::timestamptz 
                        ORDER BY time DESC LIMIT $1
                    """, limit, start_time, end_time)
                else:
                    records = await conn.fetch(f"""
                        SELECT time, tag_name, value FROM tag_data 
                        WHERE time >= NOW() - INTERVAL '{minutes} minutes' 
                        ORDER BY time DESC LIMIT $1
                    """, limit)
                
        return {"success": True, "count": len(records), "data": [dict(r) for r in records]}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/tags")
async def get_tags():
    try:
        async with db_pool.acquire() as conn:
            # Fetch unique tag names from metadata table
            records = await conn.fetch("SELECT tag_name, description, unit FROM opc_tags ORDER BY tag_name ASC")
        return {"success": True, "data": [dict(r) for r in records]}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/config")

@app.post("/api/config")
async def update_config(req: ConfigUpdateReq):
    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                UPDATE transmission_config 
                SET is_enabled = $1, settings = $2 
                WHERE service_name = $3 
                RETURNING *
            """, req.is_enabled, json.dumps(req.settings), req.service_name)
            
        if row:
            # Publish change to microservices
            client = paho_mqtt.Client(paho_mqtt.CallbackAPIVersion.VERSION2)
            try:
                client.connect(MQTT_HOST, MQTT_PORT, 60)
                client.publish("rig/config/update", json.dumps({
                    "service_name": req.service_name,
                    "is_enabled": req.is_enabled,
                    "settings": req.settings
                }), qos=1)
                client.disconnect()
            except Exception as e:
                print(f"[MQTT] Failed to publish config update: {e}")
                
            return {"success": True, "data": dict(row)}
        else:
            return {"success": False, "error": "Service not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ------------------------------------------------------------------------------
# WebSockets
# ------------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    print(f"[WS] Client connected")
    try:
        while True:
            # Keep connection open until client leaves
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        active_websockets.discard(websocket)
        print(f"[WS] Client disconnected")
