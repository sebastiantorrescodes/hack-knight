"""Copy readings already stored in the local SQLite file into Tiger Data.

Run once after setting TIGER_DATABASE_URL in .env:  python migrate_readings.py
Safe to run again: readings already in Tiger Data (same plant + timestamp) are skipped.
"""
import sqlite3

import settings

if not settings.TIGER_DATABASE_URL:
    raise SystemExit("Set TIGER_DATABASE_URL in backend/.env first")

import tsdb  # noqa: E402  (only importable once the URL is known to be set)

tsdb.init()
conn = sqlite3.connect(settings.DB_PATH)
conn.row_factory = sqlite3.Row
plants = [r[0] for r in conn.execute("SELECT DISTINCT plant_id FROM readings")]
for plant_id in plants:
    rows = [dict(r) for r in conn.execute("SELECT * FROM readings WHERE plant_id = ? ORDER BY ts", (plant_id,))]
    inserted = sum(tsdb.insert_readings(plant_id, rows[i:i + 1000]) for i in range(0, len(rows), 1000))
    print(f"{plant_id}: {len(rows)} readings in SQLite, {inserted} copied to Tiger Data")
if not plants:
    print("No readings in SQLite to copy")
