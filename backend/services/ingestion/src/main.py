import asyncio
import json
import logging
import os
import time
import pandas as pd
import numpy as np
import paho.mqtt.client as mqtt
from asyncua import Client
import asyncpg
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("data_ingestion")

# ── Config ────────────────────────────────────────────────────────────────────
OPC_URL     = os.getenv("OPC_URL",            "opc.tcp://192.168.1.212:4096")
MQTT_BROKER = os.getenv("MQTT_BROKER_URL",    "mqtt://mqtt:1883")
PG_HOST     = os.getenv("PG_HOST",            "timescaledb")
PG_PORT     = os.getenv("PG_PORT",            "5432")
PG_USER     = os.getenv("PG_USER",            "postgres")
PG_PASSWORD = os.getenv("PG_PASSWORD",        "postgres")
PG_DATABASE = os.getenv("PG_DATABASE",        "boredb")

TIER1_INTERVAL    = float(os.getenv("TIER1_INTERVAL",    "1"))    # seconds
TIER2_INTERVAL    = float(os.getenv("TIER2_INTERVAL",    "10"))   # seconds
HEARTBEAT_MINUTES = float(os.getenv("HEARTBEAT_MINUTES", "15"))
DEADBAND_PCT      = float(os.getenv("DEADBAND_PCT",      "0.01")) # 1%
DB_RETRY_DELAY    = float(os.getenv("DB_RETRY_DELAY",    "5"))    # seconds between DB retries
MQTT_RETRY_DELAY  = float(os.getenv("MQTT_RETRY_DELAY",  "5"))    # seconds between MQTT retries

# Parse MQTT broker host/port from URL
_mqtt_parts      = MQTT_BROKER.replace("mqtt://", "").split(":")
mqtt_broker_host = _mqtt_parts[0]
mqtt_broker_port = int(_mqtt_parts[1]) if len(_mqtt_parts) > 1 else 1883

# Column sets for DB insert
_TEXT_COLS = {"tag_name", "node_path", "category", "equipment", "type", "description", "unit"}
_TARGET_DB_COLS = [
    "tag_name", "node_path", "category", "equipment",
    "type", "description", "unit", "is_active", "logging_tier"
]

# ── MQTT — with retry on startup and auto-reconnect on disconnect ─────────────
def get_mqtt_client() -> mqtt.Client:
    """Connect to MQTT broker, retrying indefinitely until successful."""
    client = mqtt.Client()

    def _on_disconnect(client, userdata, rc):
        if rc != 0:
            logger.warning(f"MQTT disconnected (rc={rc}). Will auto-reconnect...")

    def _on_connect(client, userdata, flags, rc):
        if rc == 0:
            logger.info("MQTT connected.")
        else:
            logger.error(f"MQTT connect failed (rc={rc}).")

    client.on_connect    = _on_connect
    client.on_disconnect = _on_disconnect

    # Retry until MQTT broker is reachable — avoids crash if broker boots after this service
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    while True:
        try:
            client.connect(mqtt_broker_host, mqtt_broker_port, keepalive=60)
            client.loop_start()
            return client
        except Exception as e:
            logger.warning(f"MQTT broker not ready ({e}). Retrying in {MQTT_RETRY_DELAY}s...")
            time.sleep(MQTT_RETRY_DELAY)  # blocking OK here — event loop not yet running


# ── Tag state ─────────────────────────────────────────────────────────────────
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

class TagState:
    __slots__ = ("last_value", "last_log_time")
    def __init__(self):
        self.last_value    = None
        self.last_log_time = _EPOCH


# ── JSON encoder for non-standard OPC types ───────────────────────────────────
class _SafeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):           return obj.isoformat()
        if isinstance(obj, np.integer):         return int(obj)
        if isinstance(obj, np.floating):        return float(obj)
        if isinstance(obj, np.bool_):           return bool(obj)
        if isinstance(obj, (bytes, bytearray)): return obj.hex()  # OPC binary values
        return str(obj)


# ── Excel loader ──────────────────────────────────────────────────────────────
def _load_excel(path: str) -> pd.DataFrame:
    """Read Excel, deduplicate, clean and coerce types. Returns insert-ready DataFrame."""
    df = pd.read_excel(path)
    df.columns = [str(c).strip() for c in df.columns]
    logger.info(f"Excel columns: {df.columns.tolist()} | rows: {len(df)}")

    if "is_active"        not in df.columns: df["is_active"]        = True
    if "logging_frequency" not in df.columns: df["logging_frequency"] = "low"

    # Replace NaN/sentinel strings with None FIRST — before any string operations
    df = df.where(df.notna(), None)  # comprehensive NaN/NaT sweep
    df = df.replace({"nan": None, "None": None, "NaT": None, "": None})

    # Map logging_frequency → logging_tier (safe: NaN already replaced above)
    df["logging_tier"] = df["logging_frequency"].apply(
        lambda f: 1 if str(f).strip().lower() == "high" else 2
    )

    if "tag_name" not in df.columns:
        logger.error("Excel has no 'tag_name' column — cannot seed.")
        return df  # caller checks df.empty / column existence

    null_tags = df["tag_name"].isna().sum()
    if null_tags:
        logger.warning(f"Dropping {null_tags} rows with null tag_name.")
        df = df[df["tag_name"].notna()]

    # Dedup on tag_name (keep last)
    before  = len(df)
    df      = df.drop_duplicates(subset=["tag_name"], keep="last")
    dropped = before - len(df)
    if dropped:
        logger.warning(f"Dropped {dropped} duplicate tag_name rows.")

    # Warn on null node_paths so operator knows before polling starts
    if "node_path" in df.columns:
        null_paths = df["node_path"].isna().sum()
        if null_paths:
            logger.warning(f"{null_paths} rows have null node_path — they will be skipped during polling.")

    # Keep only DB target columns
    available = [c for c in _TARGET_DB_COLS if c in df.columns]
    df = df[available].copy()

    # Coerce Python types for asyncpg
    for col in df.columns:
        if col in _TEXT_COLS:
            df[col] = df[col].apply(lambda v: str(v) if v is not None else None)
        elif col == "is_active":
            df[col] = df[col].apply(lambda v: bool(v) if v is not None else True)
        elif col == "logging_tier":
            df[col] = df[col].apply(lambda v: int(v) if v is not None else 2)

    return df


# ── DB helpers ───────────────────────────────────────────────────────────────
async def _db_connect() -> asyncpg.Connection:
    """Connect to Postgres, retrying indefinitely until successful."""
    while True:
        try:
            return await asyncpg.connect(
                user=PG_USER, password=PG_PASSWORD,
                database=PG_DATABASE, host=PG_HOST, port=int(PG_PORT)
            )
        except Exception as e:
            logger.warning(f"DB not ready ({e}). Retrying in {DB_RETRY_DELAY}s...")
            await asyncio.sleep(DB_RETRY_DELAY)


async def seed_tags_from_excel() -> bool:
    """
    One-shot: seed opc_tags from Excel. Called once at startup.
    Returns True if seed succeeded or was skipped gracefully.
    """
    conn = await _db_connect()
    try:
        excel_path = next(
            (p for p in ["/app/ignitiontags.xlsx", "ignitiontags.xlsx"] if os.path.exists(p)),
            None
        )
        if not excel_path:
            logger.warning("ignitiontags.xlsx not found — skipping seed, using existing opc_tags data.")
            return True

        logger.info(f"Seeding opc_tags from {excel_path} ...")
        df = _load_excel(excel_path)

        if df.empty or "tag_name" not in df.columns or "node_path" not in df.columns:
            logger.error("Excel missing required columns (tag_name, node_path). Aborting seed.")
            return False

        cols  = list(df.columns)
        ph    = ", ".join(f"${i}" for i in range(1, len(cols) + 1))
        query = f"INSERT INTO opc_tags ({', '.join(cols)}) VALUES ({ph})"
        recs  = [tuple(r) for r in df.itertuples(index=False, name=None)]

        async with conn.transaction():
            await conn.execute("TRUNCATE TABLE opc_tags")
            await conn.executemany(query, recs)

        logger.info(f"Seeded {len(recs)} tags into opc_tags.")
        return True

    except Exception as e:
        logger.error(f"Excel seed failed: {e}", exc_info=True)
        return False
    finally:
        await conn.close()


async def fetch_active_tags() -> list[dict]:
    """Fetch active tags from opc_tags. Retries DB connection if needed."""
    conn = await _db_connect()
    try:
        rows = await conn.fetch(
            "SELECT tag_name, node_path, logging_tier FROM opc_tags WHERE is_active = TRUE"
        )
        tags = [
            {
                "name":   r["tag_name"],
                "nodeId": r["node_path"],
                "tier":   int(r["logging_tier"]) if r["logging_tier"] is not None else 2,
            }
            for r in rows
        ]
        logger.info(f"Loaded {len(tags)} active tags.")
        return tags
    except Exception as e:
        logger.error(f"Failed to fetch tags: {e}", exc_info=True)
        return []
    finally:
        await conn.close()


# ── Tiered OPC poller ─────────────────────────────────────────────────────────
class TieredPoller:
    CHUNK_SIZE = 250

    def __init__(self, name: str, tier: int, interval: float, opc_client, mqtt_client, nodes: list):
        self.name        = name
        self.tier        = tier
        self.interval    = interval
        self.opc_client  = opc_client
        self.mqtt_client = mqtt_client
        self.nodes       = nodes
        self.topic       = f"rig/live/tier{tier}"
        self.states      = {tag_name: TagState() for tag_name, _ in nodes}

    def _should_log(self, state: TagState, val, now: datetime) -> bool:
        if self.tier == 1:
            return True

        elapsed_min = (now - state.last_log_time).total_seconds() / 60.0
        if state.last_value is None or elapsed_min >= HEARTBEAT_MINUTES:
            return True

        try:
            v_new, v_old = float(val), float(state.last_value)
            threshold    = DEADBAND_PCT * abs(v_old) if v_old != 0 else 0.0001
            return abs(v_new - v_old) > threshold
        except (ValueError, TypeError):
            return val != state.last_value

    # Consecutive chunk failures before forcing OPC session reconnect
    MAX_CHUNK_FAILURES = 5

    async def run(self):
        loop = asyncio.get_running_loop()
        logger.info(f"[{self.name}] Tier {self.tier} | {self.interval}s interval | {len(self.nodes)} tags")
        consecutive_failures = 0

        while True:
            try:
                t0, now = loop.time(), datetime.now(timezone.utc)
                to_publish: dict = {}

                for i in range(0, len(self.nodes), self.CHUNK_SIZE):
                    chunk     = self.nodes[i : i + self.CHUNK_SIZE]
                    tag_names = [n[0] for n in chunk]
                    node_objs = [n[1] for n in chunk]

                    try:
                        values = await self.opc_client.read_values(node_objs)
                        consecutive_failures = 0  # reset on any successful chunk read
                    except Exception as e:
                        consecutive_failures += 1
                        logger.error(f"[{self.name}] Chunk read error ({consecutive_failures}/{self.MAX_CHUNK_FAILURES}): {e}")
                        if consecutive_failures >= self.MAX_CHUNK_FAILURES:
                            # Too many failures in a row — OPC session is likely dead
                            logger.critical(f"[{self.name}] OPC session appears dead. Triggering reconnect.")
                            raise RuntimeError(f"{self.name}: exceeded {self.MAX_CHUNK_FAILURES} consecutive chunk failures")
                        continue

                    for tag_name, val in zip(tag_names, values):
                        state = self.states[tag_name]
                        if self._should_log(state, val, now):
                            to_publish[tag_name] = val
                            state.last_value     = val
                            state.last_log_time  = now

                if to_publish:
                    payload = {
                        "timestamp": now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                        "tier":      self.tier,
                        "data":      to_publish,
                    }
                    info = self.mqtt_client.publish(self.topic, json.dumps(payload, cls=_SafeEncoder))
                    if info.rc != 0:
                        logger.warning(f"[{self.name}] MQTT publish failed (rc={info.rc}) — broker may be disconnected")
                    else:
                        logger.debug(f"[{self.name}] Published {len(to_publish)} tags")

                await asyncio.sleep(max(0, self.interval - (loop.time() - t0)))

            except RuntimeError:
                # Only RuntimeError (chunk failure threshold) escapes — triggers OPC reconnect
                raise
            except Exception as e:
                # All other exceptions (transient OPC hiccups) are retried internally
                logger.error(f"[{self.name}] Transient poll error (will retry): {e}", exc_info=True)
                await asyncio.sleep(self.interval)


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    logger.info("Starting Tiered OPC Ingestion Service...")
    mqtt_client = get_mqtt_client()

    # Seed once at startup — never re-seeds on retry, only re-fetches
    await seed_tags_from_excel()
    tags_meta = await fetch_active_tags()

    while True:
        if not tags_meta:
            logger.warning("No active tags — retrying fetch in 10s...")
            await asyncio.sleep(10)
            tags_meta = await fetch_active_tags()  # fetch only, no re-seed
            continue

        try:
            # Added 10s timeout to prevent perpetual "opening connection" hang
            async with Client(url=OPC_URL, timeout=10) as opc_client:
                logger.info(f"Connected to OPC UA at {OPC_URL}")
                tier_nodes: dict[int, list] = {1: [], 2: []}

                for tag in tags_meta:
                    node_id = tag.get("nodeId")

                    # Skip tags with null/empty node_path
                    if not node_id:
                        logger.warning(f"Skipping tag '{tag.get('name')}' — missing node_path.")
                        continue

                    if not (node_id.startswith("ns=") or node_id.startswith("i=")):
                        node_id = f"ns=1;s={node_id}"

                    try:
                        node = opc_client.get_node(node_id)
                        tier = tag.get("tier", 2)
                        if tier in tier_nodes:
                            tier_nodes[tier].append((tag["name"], node))
                        else:
                            # Unknown tier falls back to tier 2
                            logger.warning(f"Unknown tier {tier} for '{tag['name']}' — defaulting to Tier 2.")
                            tier_nodes[2].append((tag["name"], node))
                    except Exception as e:
                        logger.warning(f"Skipping node {node_id}: {e}")

                logger.info(f"Tier 1: {len(tier_nodes[1])} tags | Tier 2: {len(tier_nodes[2])} tags")

                pollers = [
                    TieredPoller("High-Freq", 1, TIER1_INTERVAL, opc_client, mqtt_client, tier_nodes[1]),
                    TieredPoller("Low-Freq",  2, TIER2_INTERVAL, opc_client, mqtt_client, tier_nodes[2]),
                ]
                active = [p for p in pollers if p.nodes]

                if active:
                    # Independent pollers — one dying does not cancel the other
                    results = await asyncio.gather(*(p.run() for p in active), return_exceptions=True)
                    for poller, result in zip(active, results):
                        if isinstance(result, Exception):
                            logger.error(f"[{poller.name}] Terminated: {result}")
                else:
                    logger.warning("No active OPC nodes. Check opc_tags table.")
                    await asyncio.sleep(10)

        except Exception as e:
            logger.error(f"OPC connection error: {e} — reconnecting in 10s...")
            await asyncio.sleep(10)

        # Refresh tags from DB after every OPC reconnect cycle
        # (picks up any is_active changes made while the service was running)
        logger.info("Refreshing tag list from DB before reconnect...")
        tags_meta = await fetch_active_tags()
        continue  # go back to top of while True


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service stopped.")
