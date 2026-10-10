"""Loads server settings from .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

API_KEY = os.getenv("API_KEY", "")
DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data" / "server.db"))
PHOTO_DIR = Path(os.getenv("PHOTO_DIR", BASE_DIR / "data" / "photos"))
# Comma-separated origins allowed to call the API from a browser (the frontend). "*" allows any.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# AI agent (Gemini)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
AGENT_MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", 8))  # tool-call rounds per request
# Plant id the agent checks on its own; leave AGENT_CHECK_MINUTES at 0 to only run on request
AGENT_PLANT_ID = os.getenv("AGENT_PLANT_ID", "plant-1")
AGENT_CHECK_MINUTES = int(os.getenv("AGENT_CHECK_MINUTES", 0))

# Where the plant is, for the weather forecast (default: Queens College)
PLANT_LAT = float(os.getenv("PLANT_LAT", 40.7365))
PLANT_LON = float(os.getenv("PLANT_LON", -73.8203))

# Phone alerts via ntfy.sh: install the ntfy app and subscribe to this topic. Empty = alerts are only logged.
NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")

# Watering limits the agent cannot override
MAX_WATER_SECONDS = int(os.getenv("MAX_WATER_SECONDS", 5))
WATER_COOLDOWN_MINUTES = int(os.getenv("WATER_COOLDOWN_MINUTES", 60))
STALE_READING_MINUTES = int(os.getenv("STALE_READING_MINUTES", 30))

# Plant voice (ElevenLabs). Pick a voice in the ElevenLabs Voice Library and copy its voice ID.
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")  # lowest-latency model
TTS_MAX_CHARS = int(os.getenv("TTS_MAX_CHARS", 600))
TTS_CACHE_DIR = Path(os.getenv("TTS_CACHE_DIR", BASE_DIR / "data" / "tts"))

# Soil thresholds (keep in sync with plant_monitor.ino and pi/.env)
DRY_LIMIT = int(os.getenv("DRY_LIMIT", 150))
WET_LIMIT = int(os.getenv("WET_LIMIT", 450))

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
PHOTO_DIR.mkdir(parents=True, exist_ok=True)
TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
