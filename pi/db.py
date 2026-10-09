"""Local SQLite storage. Readings and photos are kept until the uploader marks them sent."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT    NOT NULL,
    soil         REAL    NOT NULL,
    light        REAL    NOT NULL,
    status       TEXT    NOT NULL,
    light_status TEXT    NOT NULL,
    sent         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_readings_sent ON readings(sent);

CREATE TABLE IF NOT EXISTS photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT    NOT NULL,
    path        TEXT    NOT NULL,
    green_pct   REAL,
    brightness  REAL,
    sent        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_photos_sent ON photos(sent);
"""

TABLES = ("readings", "photos")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    conn = sqlite3.connect(config.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init():
    with connect() as conn:
        # WAL lets reader, camera and uploader run as separate processes without locking each other out
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)


def insert_reading(soil, light, status, light_status, ts=None):
    with connect() as conn:
        conn.execute(
            "INSERT INTO readings (ts, soil, light, status, light_status) VALUES (?, ?, ?, ?, ?)",
            (ts or now(), soil, light, status, light_status),
        )


def insert_photo(path, green_pct=None, brightness=None, ts=None):
    with connect() as conn:
        conn.execute(
            "INSERT INTO photos (ts, path, green_pct, brightness) VALUES (?, ?, ?, ?)",
            (ts or now(), str(path), green_pct, brightness),
        )


def get_unsent(table, limit=100):
    if table not in TABLES:
        raise ValueError(f"unknown table: {table}")
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM {table} WHERE sent = 0 ORDER BY id LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def mark_sent(table, ids):
    if table not in TABLES:
        raise ValueError(f"unknown table: {table}")
    if not ids:
        return
    placeholders = ",".join("?" * len(ids))
    with connect() as conn:
        conn.execute(f"UPDATE {table} SET sent = 1 WHERE id IN ({placeholders})", list(ids))


def latest_reading():
    with connect() as conn:
        row = conn.execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchone()
    return dict(row) if row else None


if __name__ == "__main__":
    init()
    print(f"Database ready at {config.DB_PATH}")
