"""Sensor readings in Tiger Data (Postgres + TimescaleDB).

Used instead of SQLite for the readings table when TIGER_DATABASE_URL is set. The table is a hypertable:
TimescaleDB splits it into time-based chunks automatically, and time_bucket() turns raw readings into
per-minute / per-hour averages for charts without any extra bookkeeping.
Rows come back in the same shape as db.py's SQLite readings so callers don't care which store is used.
"""
import logging
from datetime import datetime, timezone

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    plant_id     TEXT             NOT NULL,
    ts           TIMESTAMPTZ      NOT NULL,
    soil         DOUBLE PRECISION NOT NULL,
    light        DOUBLE PRECISION NOT NULL,
    status       TEXT             NOT NULL,
    light_status TEXT             NOT NULL,
    temp         DOUBLE PRECISION,
    humidity     DOUBLE PRECISION,
    received_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
    UNIQUE (plant_id, ts)
) WITH (
    tsdb.hypertable,
    tsdb.partition_column = 'ts',
    tsdb.segmentby = 'plant_id',
    tsdb.orderby = 'ts DESC'
);
ALTER TABLE readings ADD COLUMN IF NOT EXISTS temp     DOUBLE PRECISION;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS humidity DOUBLE PRECISION;
"""

log = logging.getLogger("tsdb")

_pool = None
_schema_ready = False


def pool():
    global _pool
    if _pool is None:
        # A pool matters here: each new TLS connection to the cloud costs a few hundred ms
        _pool = ConnectionPool(
            settings.TIGER_DATABASE_URL,
            min_size=1,
            max_size=5,
            timeout=10,  # how long a request waits for a connection before failing
            kwargs={"row_factory": dict_row, "connect_timeout": 10},
            open=True,
        )
    return _pool


def _connection():
    """A pooled connection, creating the table first if that hasn't succeeded yet."""
    global _schema_ready
    if not _schema_ready:
        with pool().connection() as conn:
            conn.execute(SCHEMA)
        _schema_ready = True
        log.info("Connected to Tiger Data; readings hypertable ready")
    return pool().connection()


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _row(r):
    return {**r, "ts": _iso(r["ts"]), "received_at": _iso(r["received_at"])}


def init():
    """Try to set up the table at startup. If Tiger Data can't be reached, start anyway and retry on first use."""
    try:
        with _connection():
            pass
    except Exception as e:
        log.error("Can't reach Tiger Data (%s). The backend will keep retrying; readings uploads fail until then.", e)


def insert_readings(plant_id, readings):
    """Insert readings, skipping any already stored (same plant + timestamp). Returns count inserted."""
    if not readings:
        return 0
    with _connection() as conn:
        cur = conn.execute(
            """INSERT INTO readings (plant_id, ts, soil, light, status, light_status, temp, humidity)
               SELECT %s, * FROM unnest(%s::timestamptz[], %s::float8[], %s::float8[], %s::text[], %s::text[], %s::float8[], %s::float8[])
               ON CONFLICT (plant_id, ts) DO NOTHING""",
            (
                plant_id,
                [datetime.fromisoformat(r["ts"]) for r in readings],
                [r["soil"] for r in readings],
                [r["light"] for r in readings],
                [r["status"] for r in readings],
                [r["light_status"] for r in readings],
                [r.get("temp") for r in readings],
                [r.get("humidity") for r in readings],
            ),
        )
        return cur.rowcount


def list_readings(plant_id, limit, since=None):
    """Newest `limit` readings, returned oldest-first so they can go straight into a chart."""
    query = "SELECT * FROM readings WHERE plant_id = %s"
    params = [plant_id]
    if since:
        query += " AND ts >= %s"
        params.append(datetime.fromisoformat(since))
    query = f"SELECT * FROM ({query} ORDER BY ts DESC LIMIT %s) newest ORDER BY ts"
    params.append(limit)
    with _connection() as conn:
        return [_row(r) for r in conn.execute(query, params)]


def latest_reading(plant_id):
    with _connection() as conn:
        r = conn.execute(
            "SELECT * FROM readings WHERE plant_id = %s ORDER BY ts DESC LIMIT 1", (plant_id,)
        ).fetchone()
    return _row(r) if r else None


def history(plant_id, bucket_seconds, since):
    """Averages per time bucket since `since` (ISO string), oldest first."""
    with _connection() as conn:
        rows = conn.execute(
            """SELECT time_bucket(make_interval(secs => %s), ts) AS bucket,
                      avg(soil) AS soil_avg, min(soil) AS soil_min, max(soil) AS soil_max,
                      avg(light) AS light_avg,
                      avg(temp) AS temp_avg, min(temp) AS temp_min, max(temp) AS temp_max,
                      avg(humidity) AS humidity_avg, min(humidity) AS humidity_min, max(humidity) AS humidity_max,
                      count(*) AS count
               FROM readings
               WHERE plant_id = %s AND ts >= %s
               GROUP BY bucket
               ORDER BY bucket""",
            (bucket_seconds, plant_id, datetime.fromisoformat(since)),
        ).fetchall()
    return [
        {
            "ts": _iso(r["bucket"]),
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
