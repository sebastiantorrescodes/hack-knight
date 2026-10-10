"""People and the plants they own, stored in Tiger Data (plain Postgres tables next to the readings hypertable).

Clerk owns identity (name, email, sign-in), so `users` only keeps the Clerk user id and the intake answers.
`plants.id` is the device id the Pi sends with every upload (PLANT_ID in pi/.env); claiming it ties that
device's readings, photos and commands to one owner.
"""
import logging
import time

import settings

log = logging.getLogger("accounts")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    clerk_id     TEXT PRIMARY KEY,
    role         TEXT,                          -- 'parent', 'teacher' or 'hobbyist'
    kids_ages    TEXT,                          -- age range of the kids using the dashboard, or 'none'
    experience   TEXT,                          -- 'new', 'some' or 'expert'
    goals        TEXT[] NOT NULL DEFAULT '{}',
    onboarded_at TIMESTAMPTZ,                   -- set when the intake form is finished
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plants (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT NOT NULL REFERENCES users (clerk_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    species       TEXT,
    indoors       BOOLEAN,
    location_name TEXT,
    lat           DOUBLE PRECISION,
    lon           DOUBLE PRECISION,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plants_owner_idx ON plants (owner_id);
"""

PLANT_FIELDS = ("name", "species", "indoors", "location_name", "lat", "lon")
PROFILE_FIELDS = ("role", "kids_ages", "experience", "goals")

# The dashboard polls several endpoints every few seconds and each one checks plant ownership,
# so plant rows are cached briefly. Writes in this process clear the entry right away.
PLANT_CACHE_SECONDS = 30
_plant_cache = {}  # plant id -> (expires at, row or None)

_schema_ready = False


class NotConfigured(Exception):
    pass


def _connection():
    global _schema_ready
    if not settings.TIGER_DATABASE_URL:
        raise NotConfigured("Accounts are stored in Tiger Data: set TIGER_DATABASE_URL in backend/.env")
    import tsdb  # only importable once the URL is set

    if not _schema_ready:
        with tsdb.pool().connection() as conn:
            conn.execute(SCHEMA)
        _schema_ready = True
        log.info("users and plants tables ready")
    return tsdb.pool().connection()


def _iso(row, *fields):
    if row is None:
        return None
    out = dict(row)
    for f in fields:
        if out.get(f) is not None:
            out[f] = out[f].isoformat(timespec="seconds")
    return out


# Users

def ensure_user(clerk_id):
    """The user's row, created on their first request. Returns the row."""
    with _connection() as conn:
        conn.execute("INSERT INTO users (clerk_id) VALUES (%s) ON CONFLICT (clerk_id) DO NOTHING", (clerk_id,))
        row = conn.execute("SELECT * FROM users WHERE clerk_id = %s", (clerk_id,)).fetchone()
    return _iso(row, "onboarded_at", "created_at")


def save_profile(clerk_id, profile):
    """Store the intake answers and mark the user onboarded."""
    ensure_user(clerk_id)
    with _connection() as conn:
        row = conn.execute(
            """UPDATE users SET role = %s, kids_ages = %s, experience = %s, goals = %s,
                                onboarded_at = COALESCE(onboarded_at, now())
               WHERE clerk_id = %s RETURNING *""",
            (*(profile[f] for f in PROFILE_FIELDS), clerk_id),
        ).fetchone()
    return _iso(row, "onboarded_at", "created_at")


# Plants

def list_plants(owner_id):
    with _connection() as conn:
        rows = conn.execute("SELECT * FROM plants WHERE owner_id = %s ORDER BY created_at", (owner_id,)).fetchall()
    return [_iso(r, "created_at") for r in rows]


def get_plant(plant_id):
    hit = _plant_cache.get(plant_id)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    with _connection() as conn:
        row = _iso(conn.execute("SELECT * FROM plants WHERE id = %s", (plant_id,)).fetchone(), "created_at")
    _plant_cache[plant_id] = (time.monotonic() + PLANT_CACHE_SECONDS, row)
    return row


class AlreadyClaimed(Exception):
    pass


def claim_plant(owner_id, plant_id, fields):
    """Register a device id to this user. Raises AlreadyClaimed if someone else owns it."""
    ensure_user(owner_id)
    with _connection() as conn:
        row = conn.execute(
            f"""INSERT INTO plants (id, owner_id, {", ".join(PLANT_FIELDS)})
                VALUES (%s, %s, {", ".join(["%s"] * len(PLANT_FIELDS))})
                ON CONFLICT (id) DO NOTHING RETURNING *""",
            (plant_id, owner_id, *(fields.get(f) for f in PLANT_FIELDS)),
        ).fetchone()
    _plant_cache.pop(plant_id, None)
    if row is None:
        raise AlreadyClaimed(plant_id)
    return _iso(row, "created_at")


def update_plant(plant_id, fields):
    """Change the given columns (only keys in PLANT_FIELDS). Returns the updated row."""
    changes = {k: v for k, v in fields.items() if k in PLANT_FIELDS}
    if changes.get("name", "") is None:
        del changes["name"]  # every plant keeps a name
    if not changes:
        return get_plant(plant_id)
    assignments = ", ".join(f"{k} = %s" for k in changes)
    with _connection() as conn:
        row = conn.execute(
            f"UPDATE plants SET {assignments} WHERE id = %s RETURNING *", (*changes.values(), plant_id)
        ).fetchone()
    _plant_cache.pop(plant_id, None)
    return _iso(row, "created_at")


def agent_profile(plant_id):
    """What the agent should know about the plant and who it talks to, or None if the plant isn't claimed."""
    try:
        with _connection() as conn:
            return conn.execute(
                """SELECT p.name, p.species, p.indoors, p.location_name, p.lat, p.lon, u.kids_ages
                   FROM plants p JOIN users u ON u.clerk_id = p.owner_id
                   WHERE p.id = %s""",
                (plant_id,),
            ).fetchone()
    except Exception as e:  # the agent still works without it, just less personal
        log.warning("Couldn't load profile for %s: %s", plant_id, e)
        return None
