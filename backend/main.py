"""Plant monitor backend.

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
Docs: http://localhost:8000/docs

Writes from the Pi (and creating commands by hand) need the X-API-Key header.
Dashboard reads and /agent/chat need a Clerk sign-in (see auth.py), and only work for plants the signed-in
user has claimed (POST /plants). The agent's watering limits live in agent.py.
"""
import asyncio
import logging
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import httpx
from pydantic import BaseModel, Field

import accounts
import agent
import auth
import db
import settings
import stream
import tts

PLANT_ID = r"^[A-Za-z0-9_-]{1,64}$"
MAX_PHOTO_BYTES = 10 * 1024 * 1024
PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png"}
MAX_FRAME_BYTES = 2 * 1024 * 1024
CommandType = Literal["water", "photo"]

log = logging.getLogger("main")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)-7s %(message)s", datefmt="%H:%M:%S")


class HidePolling(logging.Filter):
    """Drop uvicorn access-log lines for requests that repeat every few seconds; the handlers log a summary instead."""
    PATHS = {"/frames", "/status", "/stream/status"}

    def filter(self, record):
        args = record.args if isinstance(record.args, tuple) else ()
        return not (len(args) >= 3 and str(args[2]).split("?")[0] in self.PATHS)


logging.getLogger("uvicorn.access").addFilter(HidePolling())

FRAME_LOG_SECONDS = 10
_frame_stats = {}  # plant_id -> [frames since last log line, time of last log line]


def log_frame(plant_id, size, viewers):
    """One summary line every FRAME_LOG_SECONDS instead of a line per frame."""
    now = time.monotonic()
    if plant_id not in _frame_stats:
        _frame_stats[plant_id] = [0, now]
        log.info("camera  %s: live frames arriving", plant_id)
    stats = _frame_stats[plant_id]
    stats[0] += 1
    elapsed = now - stats[1]
    if elapsed >= FRAME_LOG_SECONDS:
        log.info("camera  %s: %.1f fps, %d KB/frame, %d watching", plant_id, stats[0] / elapsed, size // 1024, viewers)
        stats[:] = [0, now]


async def agent_check_loop():
    """Let the agent check the plant on its own every AGENT_CHECK_MINUTES."""
    while True:
        await asyncio.sleep(settings.AGENT_CHECK_MINUTES * 60)
        try:
            run = await asyncio.to_thread(agent.check, settings.AGENT_PLANT_ID)
            log.info("Agent check: %s", run["reply"])
        except Exception:
            log.exception("Agent check failed")


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(agent_check_loop()) if settings.AGENT_CHECK_MINUTES > 0 else None
    yield
    if task:
        task.cancel()


db.init()
app = FastAPI(title="Plant Monitor API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.mount("/photo-files", StaticFiles(directory=settings.PHOTO_DIR), name="photo-files")


@app.exception_handler(accounts.NotConfigured)
def accounts_not_configured(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=503)


def require_key(x_api_key: str = Header(default="")):
    if not settings.API_KEY:
        raise HTTPException(500, "API_KEY is not set on the server (backend/.env)")
    if not secrets.compare_digest(x_api_key.encode(), settings.API_KEY.encode()):
        raise HTTPException(401, "Invalid API key")


def owned_plant(plant_id: str = Query(pattern=PLANT_ID), user_id: str = Depends(auth.current_user)):
    """The plant in ?plant_id=, if the signed-in user owns it. Someone else's plant looks the same as a missing one."""
    return check_owner(plant_id, user_id)


def pi_or_owner(
    plant_id: str = Query(pattern=PLANT_ID),
    x_api_key: str = Header(default=""),
    authorization: str = Header(default=""),
    token: str = Query(default=""),
):
    """For reads both sides use: the Pi with its API key (e.g. polling pending commands), or the plant's owner."""
    if x_api_key:
        return require_key(x_api_key)
    return check_owner(plant_id, auth.current_user(authorization, token))


def check_owner(plant_id, user_id):
    """Plants are shared: any signed-in user can view and control any claimed plant."""
    plant = accounts.get_plant(plant_id)
    if plant is None:
        raise HTTPException(404, "Plant not found")
    return plant


def to_utc(ts: datetime) -> str:
    """Store every timestamp in the same UTC format so string comparisons sort correctly."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).isoformat(timespec="seconds")


def with_url(photo):
    return {**photo, "url": f"/photo-files/{photo['path']}"} if photo else None


# Models

class Reading(BaseModel):
    id: int = Field(description="The Pi's local row id, echoed back so it can mark the row sent")
    ts: datetime
    soil: float
    light: float
    status: str
    light_status: str
    temp: Optional[float] = None
    humidity: Optional[float] = None


class ReadingBatch(BaseModel):
    plant_id: str = Field(pattern=PLANT_ID)
    readings: list[Reading] = Field(max_length=1000)


class CommandIn(BaseModel):
    plant_id: str = Field(pattern=PLANT_ID)
    type: CommandType
    payload: dict = Field(default_factory=dict, description='e.g. {"pours": 2} for water')


class CommandResult(BaseModel):
    success: bool
    message: str = ""


class ChatTurn(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(max_length=4000)


class ChatIn(BaseModel):
    plant_id: str = Field(pattern=PLANT_ID)
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40, description="Earlier turns, oldest first")


class Profile(BaseModel):
    """Answers from the intake form."""
    role: Literal["parent", "teacher", "hobbyist"]
    kids_ages: Literal["under-6", "6-8", "9-12", "13+", "none"]
    experience: Literal["new", "some", "expert"]
    goals: list[Literal["learn", "save-water", "away", "science"]] = Field(default_factory=list, max_length=4)


class PlantFields(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=20)
    species: Optional[str] = Field(None, max_length=60)
    indoors: Optional[bool] = None
    location_name: Optional[str] = Field(None, max_length=120)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)


class PlantClaim(PlantFields):
    id: str = Field(pattern=PLANT_ID, description="The device id the Pi uploads with (PLANT_ID in pi/.env)")
    name: str = Field(min_length=1, max_length=20)


# Routes

@app.get("/health")
def health():
    return {"ok": True, "readings_store": db.readings_store()}


@app.post("/readings", dependencies=[Depends(require_key)])
def add_readings(batch: ReadingBatch):
    rows = [{**r.model_dump(), "ts": to_utc(r.ts)} for r in batch.readings]
    inserted = db.insert_readings(batch.plant_id, rows)
    if rows:
        last = rows[-1]
        log.info(
            "reading %s: %d new, %d duplicate | latest soil=%s (%s) light=%s (%s) temp=%s humidity=%s",
            batch.plant_id, inserted, len(rows) - inserted,
            last["soil"], last["status"], last["light"], last["light_status"],
            last.get("temp"), last.get("humidity"),
        )
    # Duplicates are already stored, so every id in the batch is safe for the Pi to mark sent
    return {"accepted_ids": [r.id for r in batch.readings], "inserted": inserted}


@app.get("/readings", dependencies=[Depends(owned_plant)])
def get_readings(
    plant_id: str = Query(pattern=PLANT_ID),
    limit: int = Query(200, ge=1, le=5000),
    since: Optional[datetime] = None,
):
    return db.list_readings(plant_id, limit, to_utc(since) if since else None)


HISTORY_BUCKETS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1d": 86400}


@app.get("/readings/history", dependencies=[Depends(owned_plant)])
def get_reading_history(
    plant_id: str = Query(pattern=PLANT_ID),
    hours: int = Query(24, ge=1, le=24 * 30),
    bucket: Literal["1m", "5m", "15m", "1h", "1d"] = "1h",
):
    """Average/min/max soil and average light per time bucket, oldest first. Made for charts."""
    since = to_utc(datetime.now(timezone.utc) - timedelta(hours=hours))
    return db.reading_history(plant_id, HISTORY_BUCKETS[bucket], since)


@app.post("/photos", dependencies=[Depends(require_key)])
async def add_photo(
    plant_id: str = Form(pattern=PLANT_ID),
    ts: datetime = Form(),
    green_pct: Optional[float] = Form(None),
    brightness: Optional[float] = Form(None),
    file: UploadFile = File(),
):
    ts_str = to_utc(ts)
    existing = db.find_photo(plant_id, ts_str)
    if existing:
        return with_url(existing)  # retry of a photo we already have

    ext = PHOTO_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(415, f"Photo must be JPEG or PNG, got {file.content_type}")
    data = await file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo is larger than 10 MB")

    rel_path = f"{plant_id}/{uuid.uuid4().hex}{ext}"
    dest = settings.PHOTO_DIR / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    log.info("photo   %s: %d KB, green=%s%% brightness=%s", plant_id, len(data) // 1024, green_pct, brightness)
    return with_url(db.insert_photo(plant_id, ts_str, rel_path, green_pct, brightness))


@app.get("/photos", dependencies=[Depends(owned_plant)])
def get_photos(plant_id: str = Query(pattern=PLANT_ID), limit: int = Query(20, ge=1, le=500)):
    return [with_url(p) for p in db.list_photos(plant_id, limit)]


@app.post("/commands", dependencies=[Depends(require_key)])
def create_command(cmd: CommandIn):
    created = db.create_command(cmd.plant_id, cmd.type, cmd.payload)
    log.info("command %s: #%d %s %s queued", cmd.plant_id, created["id"], cmd.type, cmd.payload)
    return created


@app.get("/commands", dependencies=[Depends(pi_or_owner)])
def get_commands(
    plant_id: str = Query(pattern=PLANT_ID),
    status: Optional[Literal["pending", "done", "failed"]] = None,
    limit: int = Query(50, ge=1, le=500),
):
    return db.list_commands(plant_id, status, limit)


@app.post("/commands/{command_id}/done", dependencies=[Depends(require_key)])
def finish_command(command_id: int, result: CommandResult):
    cmd = db.get_command(command_id)
    if cmd is None:
        raise HTTPException(404, "Command not found")
    if cmd["status"] != "pending":
        raise HTTPException(409, f"Command already {cmd['status']}")
    log.info(
        "command %s: #%d %s %s %s", cmd["plant_id"], command_id, cmd["type"],
        "done" if result.success else "FAILED", result.message,
    )
    return db.finish_command(command_id, result.success, result.message)


@app.get("/status", dependencies=[Depends(owned_plant)])
def get_status(plant_id: str = Query(pattern=PLANT_ID)):
    summary = db.status(plant_id)
    summary["latest_photo"] = with_url(summary["latest_photo"])
    summary["skipped_waterings"] = db.count_events(plant_id, "skipped_watering")
    return summary


# Live camera

@app.post("/frames", dependencies=[Depends(require_key)])
async def add_frame(request: Request, plant_id: str = Query(pattern=PLANT_ID)):
    """The Pi sends one JPEG as the raw request body. The reply says how many people are watching."""
    frame = await request.body()
    if not frame.startswith(b"\xff\xd8"):
        raise HTTPException(415, "Frame must be a JPEG")
    if len(frame) > MAX_FRAME_BYTES:
        raise HTTPException(413, "Frame is larger than 2 MB")
    ch = stream.channel(plant_id)
    await ch.publish(frame)
    log_frame(plant_id, len(frame), ch.viewers)
    return {"viewers": ch.viewers}


@app.get("/stream", dependencies=[Depends(owned_plant)])
def live_stream(plant_id: str = Query(pattern=PLANT_ID)):
    """Live video for an <img src="/stream?plant_id=..."> tag."""
    return StreamingResponse(
        stream.mjpeg(plant_id),
        media_type=f"multipart/x-mixed-replace; boundary={stream.BOUNDARY}",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/stream/snapshot", dependencies=[Depends(owned_plant)])
def stream_snapshot(plant_id: str = Query(pattern=PLANT_ID)):
    frame = stream.channel(plant_id).frame
    if frame is None:
        raise HTTPException(404, "No live frame yet")
    return Response(frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/stream/status", dependencies=[Depends(owned_plant)])
def stream_status(plant_id: str = Query(pattern=PLANT_ID)):
    return stream.channel(plant_id).status()


# Plant voice

@app.get("/tts", dependencies=[Depends(auth.current_user)])
async def text_to_speech(text: str = Query(min_length=1)):
    """MP3 of the plant saying `text`. A GET so the frontend can use it directly: new Audio("/tts?text=...")."""
    text = " ".join(text.split())
    if len(text) > settings.TTS_MAX_CHARS:
        raise HTTPException(413, f"Text is longer than {settings.TTS_MAX_CHARS} characters")

    cached = tts.cache_path(text)
    log.info("voice   %s: %r", "cached" if cached.exists() else "new", text[:80])
    if cached.exists():
        return FileResponse(cached, media_type="audio/mpeg", headers={"X-TTS-Cache": "hit"})
    try:
        chunks = await tts.open_stream(text)
    except tts.TTSError as e:
        raise HTTPException(e.status, str(e))
    return StreamingResponse(chunks, media_type="audio/mpeg", headers={"X-TTS-Cache": "miss"})


# AI agent. These are plain `def` routes so FastAPI runs the slow Gemini calls in a worker thread.

def run_agent(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except agent.AgentError as e:
        raise HTTPException(502, str(e))


@app.post("/agent/chat")
def agent_chat(chat: ChatIn, user_id: str = Depends(auth.current_user)):
    """Ask the agent something. Returns {reply, actions, ...}; send earlier turns in `history` to keep context."""
    check_owner(chat.plant_id, user_id)
    history = [turn.model_dump() for turn in chat.history]
    return run_agent(agent.run, chat.plant_id, chat.message, trigger="chat", history=history)


@app.post("/agent/check", dependencies=[Depends(require_key)])
def agent_check(plant_id: str = Query(pattern=PLANT_ID)):
    """Run the routine check now (the same thing AGENT_CHECK_MINUTES runs on a timer)."""
    return run_agent(agent.check, plant_id)


@app.get("/agent/runs", dependencies=[Depends(owned_plant)])
def get_agent_runs(plant_id: str = Query(pattern=PLANT_ID), limit: int = Query(20, ge=1, le=200)):
    return db.list_agent_runs(plant_id, limit)


@app.get("/agent/events", dependencies=[Depends(owned_plant)])
def get_agent_events(
    plant_id: str = Query(pattern=PLANT_ID),
    kind: Optional[Literal["alert", "skipped_watering"]] = None,
    limit: int = Query(50, ge=1, le=500),
):
    return db.list_events(plant_id, kind, limit)


# People and their plants

@app.get("/me")
def get_me(user_id: str = Depends(auth.current_user)):
    """The signed-in user's intake answers (onboarded_at is null until the form is done) and their plants."""
    return {"user": accounts.ensure_user(user_id), "plants": accounts.list_plants(user_id)}


@app.put("/me/profile")
def put_profile(profile: Profile, user_id: str = Depends(auth.current_user)):
    return accounts.save_profile(user_id, profile.model_dump())


@app.post("/plants")
def claim_plant(plant: PlantClaim, user_id: str = Depends(auth.current_user)):
    """Tie a Pi's plant id to the signed-in user. Plants are shared, so an already-claimed id is just returned."""
    existing = accounts.get_plant(plant.id)
    if existing and existing["owner_id"] == user_id:
        return accounts.update_plant(plant.id, plant.model_dump(exclude={"id"}, exclude_unset=True))
    if existing:
        return existing
    try:
        created = accounts.claim_plant(user_id, plant.id, plant.model_dump(exclude={"id"}))
    except accounts.AlreadyClaimed:  # someone claimed it a moment ago
        return accounts.get_plant(plant.id)
    log.info("plant   %s: claimed by %s", plant.id, user_id)
    return created


@app.patch("/plants/{plant_id}")
def patch_plant(plant_id: str, fields: PlantFields, user_id: str = Depends(auth.current_user)):
    check_owner(plant_id, user_id)
    return accounts.update_plant(plant_id, fields.model_dump(exclude_unset=True))


@app.get("/geocode", dependencies=[Depends(auth.current_user)])
def geocode(q: str = Query(min_length=2, max_length=100)):
    """Town or city name -> up to 5 matches with coordinates, for the plant's weather location."""
    try:
        resp = httpx.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": q, "count": 5, "language": "en", "format": "json"},
            timeout=10,
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Location search failed: {e}")
    return [
        {
            "name": ", ".join(p for p in (r.get("name"), r.get("admin1"), r.get("country")) if p),
            "lat": r["latitude"],
            "lon": r["longitude"],
        }
        for r in resp.json().get("results", [])
    ]
