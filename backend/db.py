"""Server-side SQLite storage for readings, photos and commands.

Readings go to Tiger Data instead when TIGER_DATABASE_URL is set (see tsdb.py).
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id     TEXT NOT NULL,
    ts           TEXT NOT NULL,
    soil         REAL NOT NULL,
    light        REAL NOT NULL,
    status       TEXT NOT NULL,
    light_status TEXT NOT NULL,
    temp         REAL,
    humidity     REAL,
    received_at  TEXT NOT NULL,
    UNIQUE (plant_id, ts)
);

CREATE TABLE IF NOT EXISTS photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id    TEXT NOT NULL,
    ts          TEXT NOT NULL,
    path        TEXT NOT NULL,
    green_pct   REAL,
    brightness  REAL,
    received_at TEXT NOT NULL,
    UNIQUE (plant_id, ts)
);

CREATE TABLE IF NOT EXISTS commands (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id    TEXT NOT NULL,
    type        TEXT NOT NULL,
    payload     TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'pending',
    message     TEXT,
    created_at  TEXT NOT NULL,
    finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_commands_plant_status ON commands(plant_id, status);

-- One row per agent request (a chat message or a scheduled check)
CREATE TABLE IF NOT EXISTS agent_runs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id TEXT NOT NULL,
    ts       TEXT NOT NULL,
    trigger  TEXT NOT NULL,              -- 'chat', 'check' or 'voice'
    prompt   TEXT,
    reply    TEXT,
    actions  TEXT NOT NULL DEFAULT '[]', -- tool calls the agent made, JSON
    error    TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_plant ON agent_runs(plant_id, id);

-- Things the agent did that the dashboard shows: alerts sent, waterings skipped because of rain
CREATE TABLE IF NOT EXISTS agent_events (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id TEXT NOT NULL,
    ts       TEXT NOT NULL,
    kind     TEXT NOT NULL,              -- 'alert' or 'skipped_watering'
    message  TEXT NOT NULL,
    data     TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_agent_events_plant_kind ON agent_events(plant_id, kind);
"""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    conn = sqlite3.connect(settings.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init():
    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        # Migrate existing readings table if temp/humidity columns are missing
        cols = {row[1] for row in conn.execute("PRAGMA table_info(readings)")}
        if "temp" not in cols:
            conn.execute("ALTER TABLE readings ADD COLUMN temp REAL")
        if "humidity" not in cols:
            conn.execute("ALTER TABLE readings ADD COLUMN humidity REAL")
    if USE_TIGER:
        tsdb.init()


def _one(row):
    return dict(row) if row else None


# Readings: stored in Tiger Data when TIGER_DATABASE_URL is set, otherwise in the SQLite table above

USE_TIGER = bool(settings.TIGER_DATABASE_URL)
if USE_TIGER:
    import tsdb


def readings_store():
    return "tigerdata" if USE_TIGER else "sqlite"


def insert_readings(plant_id, readings):
    """Insert readings, skipping any already stored (same plant + timestamp). Returns count inserted."""
    if USE_TIGER:
        return tsdb.insert_readings(plant_id, readings)
    received = now()
    with connect() as conn:
        before = conn.total_changes
        conn.executemany(
            """INSERT OR IGNORE INTO readings (plant_id, ts, soil, light, status, light_status, temp, humidity, received_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [(plant_id, r["ts"], r["soil"], r["light"], r["status"], r["light_status"],
              r.get("temp"), r.get("humidity"), received) for r in readings],
        )
        return conn.total_changes - before


def list_readings(plant_id, limit, since=None):
    """Newest `limit` readings, returned oldest-first so they can go straight into a chart."""
    if USE_TIGER:
        return tsdb.list_readings(plant_id, limit, since)
    query = "SELECT * FROM readings WHERE plant_id = ?"
    params = [plant_id]
    if since:
        query += " AND ts >= ?"
        params.append(since)
    query = f"SELECT * FROM ({query} ORDER BY ts DESC LIMIT ?) ORDER BY ts"
    params.append(limit)
    with connect() as conn:
        return [dict(r) for r in conn.execute(query, params)]


def latest_reading(plant_id):
    if USE_TIGER:
        return tsdb.latest_reading(plant_id)
    with connect() as conn:
        return _one(conn.execute(
            "SELECT * FROM readings WHERE plant_id = ? ORDER BY ts DESC LIMIT 1", (plant_id,)
        ).fetchone())


def reading_history(plant_id, bucket_seconds, since):
    """Averages per time bucket since `since` (ISO string), oldest first. Tiger Data does this with time_bucket()."""
    if USE_TIGER:
        return tsdb.history(plant_id, bucket_seconds, since)
    with connect() as conn:
        rows = conn.execute(
            """SELECT CAST(strftime('%s', ts) AS INTEGER) / :b * :b AS bucket,
                      AVG(soil) AS soil_avg, MIN(soil) AS soil_min, MAX(soil) AS soil_max,
                      AVG(light) AS light_avg,
                      AVG(temp) AS temp_avg, MIN(temp) AS temp_min, MAX(temp) AS temp_max,
                      AVG(humidity) AS humidity_avg, MIN(humidity) AS humidity_min, MAX(humidity) AS humidity_max,
                      COUNT(*) AS count
               FROM readings
               WHERE plant_id = :p AND ts >= :since
               GROUP BY bucket
               ORDER BY bucket""",
            {"b": bucket_seconds, "p": plant_id, "since": since},
        ).fetchall()
    return [
        {
            "ts": datetime.fromtimestamp(r["bucket"], timezone.utc).isoformat(timespec="seconds"),
            "soil_avg": round(r["soil_avg"], 1),
            "soil_min": r["soil_min"],
            "soil_max": r["soil_max"],
            "light_avg": round(r["light_avg"], 1),
            "temp_avg": round(r["temp_avg"], 1) if r["temp_avg"] is not None else None,
            "temp_min": r["temp_min"],
            "temp_max": r["temp_max"],
            "humidity_avg": round(r["humidity_avg"], 1) if r["humidity_avg"] is not None else None,
            "humidity_min": r["humidity_min"],
            "humidity_max": r["humidity_max"],
            "count": r["count"],
        }
        for r in rows
    ]


# Photos

def find_photo(plant_id, ts):
    with connect() as conn:
        return _one(conn.execute("SELECT * FROM photos WHERE plant_id = ? AND ts = ?", (plant_id, ts)).fetchone())


def insert_photo(plant_id, ts, path, green_pct, brightness):
    with connect() as conn:
        cur = conn.execute(
            """INSERT INTO photos (plant_id, ts, path, green_pct, brightness, received_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (plant_id, ts, path, green_pct, brightness, now()),
        )
        return _one(conn.execute("SELECT * FROM photos WHERE id = ?", (cur.lastrowid,)).fetchone())


def list_photos(plant_id, limit):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM photos WHERE plant_id = ? ORDER BY ts DESC LIMIT ?", (plant_id, limit)
        )
        return [dict(r) for r in rows]


# Commands

def _command(row):
    if row is None:
        return None
    cmd = dict(row)
    cmd["payload"] = json.loads(cmd["payload"])
    return cmd


def create_command(plant_id, type_, payload):
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO commands (plant_id, type, payload, created_at) VALUES (?, ?, ?, ?)",
            (plant_id, type_, json.dumps(payload), now()),
        )
        return _command(conn.execute("SELECT * FROM commands WHERE id = ?", (cur.lastrowid,)).fetchone())


def list_commands(plant_id, status, limit):
    query = "SELECT * FROM commands WHERE plant_id = ?"
    params = [plant_id]
    if status:
        query += " AND status = ?"
        params.append(status)
    # Pending commands oldest-first (the order the Pi should run them); history newest-first
    query += " ORDER BY id" if status == "pending" else " ORDER BY id DESC"
    query += " LIMIT ?"
    params.append(limit)
    with connect() as conn:
        return [_command(r) for r in conn.execute(query, params)]


def get_command(command_id):
    with connect() as conn:
        return _command(conn.execute("SELECT * FROM commands WHERE id = ?", (command_id,)).fetchone())


def last_command(plant_id, type_):
    with connect() as conn:
        return _command(conn.execute(
            "SELECT * FROM commands WHERE plant_id = ? AND type = ? ORDER BY id DESC LIMIT 1", (plant_id, type_)
        ).fetchone())


def finish_command(command_id, success, message):
    with connect() as conn:
        conn.execute(
            "UPDATE commands SET status = ?, message = ?, finished_at = ? WHERE id = ?",
            ("done" if success else "failed", message, now(), command_id),
        )
        return _command(conn.execute("SELECT * FROM commands WHERE id = ?", (command_id,)).fetchone())


# Agent

def _json_fields(row, *fields):
    if row is None:
        return None
    out = dict(row)
    for f in fields:
        out[f] = json.loads(out[f])
    return out


def insert_agent_run(plant_id, trigger, prompt, reply, actions, error=None):
    with connect() as conn:
        cur = conn.execute(
            """INSERT INTO agent_runs (plant_id, ts, trigger, prompt, reply, actions, error)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (plant_id, now(), trigger, prompt, reply, json.dumps(actions), error),
        )
        return _json_fields(conn.execute("SELECT * FROM agent_runs WHERE id = ?", (cur.lastrowid,)).fetchone(), "actions")


def list_agent_runs(plant_id, limit):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM agent_runs WHERE plant_id = ? ORDER BY id DESC LIMIT ?", (plant_id, limit)
        )
        return [_json_fields(r, "actions") for r in rows]


def insert_event(plant_id, kind, message, data=None):
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO agent_events (plant_id, ts, kind, message, data) VALUES (?, ?, ?, ?, ?)",
            (plant_id, now(), kind, message, json.dumps(data or {})),
        )
        return _json_fields(conn.execute("SELECT * FROM agent_events WHERE id = ?", (cur.lastrowid,)).fetchone(), "data")


def list_events(plant_id, kind, limit):
    query = "SELECT * FROM agent_events WHERE plant_id = ?"
    params = [plant_id]
    if kind:
        query += " AND kind = ?"
        params.append(kind)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with connect() as conn:
        return [_json_fields(r, "data") for r in conn.execute(query, params)]


def count_events(plant_id, kind):
    with connect() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM agent_events WHERE plant_id = ? AND kind = ?", (plant_id, kind)
        ).fetchone()[0]


# Dashboard summary

def status(plant_id):
    reading = latest_reading(plant_id)
    with connect() as conn:
        photo = _one(conn.execute(
            "SELECT * FROM photos WHERE plant_id = ? ORDER BY ts DESC LIMIT 1", (plant_id,)
        ).fetchone())
        pending = conn.execute(
            "SELECT COUNT(*) FROM commands WHERE plant_id = ? AND status = 'pending'", (plant_id,)
        ).fetchone()[0]
    # Readings arrive in order, so the newest reading's received_at is the newest for that table
    seen = [r["received_at"] for r in (reading, photo) if r]
    last_seen = max(seen) if seen else None
    return {
        "plant_id": plant_id,
        "latest_reading": reading,
        "latest_photo": photo,
        "pending_commands": pending,
        "last_seen": last_seen,
    }
