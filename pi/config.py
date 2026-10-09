"""Loads settings from .env so every other module imports them from one place."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _int(name, default):
    return int(os.getenv(name, default))


def _float(name, default):
    return float(os.getenv(name, default))


# Plant
PLANT_ID = os.getenv("PLANT_ID", "plant-1")

# Backend
API_URL = os.getenv("API_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.getenv("API_KEY", "")
REQUEST_TIMEOUT = _float("REQUEST_TIMEOUT", 10)

# Serial (Arduino prints "soil=...,light=...,status=...,lightStatus=..." every 2s)
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyACM0")
SERIAL_BAUD = _int("SERIAL_BAUD", 9600)

# Local storage
DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data" / "plant.db"))
PHOTO_DIR = Path(os.getenv("PHOTO_DIR", BASE_DIR / "data" / "photos"))

# Intervals (seconds)
READ_INTERVAL = _int("READ_INTERVAL", 2)          # matches Arduino delay(2000)
SMOOTHING_WINDOW = _int("SMOOTHING_WINDOW", 5)    # readings averaged per stored value
PHOTO_INTERVAL = _int("PHOTO_INTERVAL", 3600)     # one photo per hour
UPLOAD_INTERVAL = _int("UPLOAD_INTERVAL", 60)
COMMAND_POLL_INTERVAL = _int("COMMAND_POLL_INTERVAL", 15)
UPLOAD_MAX_RETRIES = _int("UPLOAD_MAX_RETRIES", 5)

# Thresholds (keep in sync with plant_monitor.ino)
DRY_LIMIT = _int("DRY_LIMIT", 150)
WET_LIMIT = _int("WET_LIMIT", 450)
DARK_LIMIT = _int("DARK_LIMIT", 200)
BRIGHT_LIMIT = _int("BRIGHT_LIMIT", 600)

# Camera
CAMERA_DEVICE = os.getenv("CAMERA_DEVICE", "/dev/video0")
CAMERA_RESOLUTION = os.getenv("CAMERA_RESOLUTION", "1280x720")

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
PHOTO_DIR.mkdir(parents=True, exist_ok=True)
