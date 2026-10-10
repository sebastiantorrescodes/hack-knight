"""Sends locally stored readings and photos to the backend, and runs commands the backend queues.

    readings/photos  every UPLOAD_INTERVAL, anything not yet marked sent is uploaded, then marked sent.
                     If the backend is unreachable the data stays in the local DB and goes next time.
    commands         every COMMAND_POLL_INTERVAL, pending commands are fetched and run:
                       photo  asks camera.py for a photo now (camera.py owns the webcam)
                       water  asks reader.py (which owns the serial port) to send WATER to the Arduino
"""
import logging
import time

import requests

import config
import db

log = logging.getLogger("uploader")

BATCH_SIZE = 200
PHOTO_WAIT_SECONDS = 30


class Backend:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["X-API-Key"] = config.API_KEY

    def request(self, method, path, **kwargs):
        resp = self.session.request(method, f"{config.API_URL}{path}", timeout=config.REQUEST_TIMEOUT, **kwargs)
        resp.raise_for_status()
        return resp.json()


def upload_readings(api):
    total = 0
    while rows := db.get_unsent("readings", BATCH_SIZE):
        body = {
            "plant_id": config.PLANT_ID,
            "readings": [
                {k: r[k] for k in ("id", "ts", "soil", "light", "status", "light_status")} for r in rows
            ],
        }
        result = api.request("POST", "/readings", json=body)
        db.mark_sent("readings", result["accepted_ids"])
        total += len(rows)
    if total:
        log.info("Uploaded %d readings", total)


def upload_photos(api):
    for photo in db.get_unsent("photos", 20):
        try:
            with open(photo["path"], "rb") as f:
                api.request(
                    "POST",
                    "/photos",
                    data={
                        "plant_id": config.PLANT_ID,
                        "ts": photo["ts"],
                        "green_pct": photo["green_pct"],
                        "brightness": photo["brightness"],
                    },
                    files={"file": (f"{photo['id']}.jpg", f, "image/jpeg")},
                )
        except FileNotFoundError:
            log.warning("Photo file %s is missing, skipping it", photo["path"])
        db.mark_sent("photos", [photo["id"]])
        log.info("Uploaded photo %s", photo["path"])


def take_photo_now():
    """Ask camera.py for a photo and wait for it to be taken. Returns (success, message)."""
    config.PHOTO_REQUEST_FILE.touch()
    deadline = time.monotonic() + PHOTO_WAIT_SECONDS
    while time.monotonic() < deadline:
        if not config.PHOTO_REQUEST_FILE.exists():
            return True, "Photo taken"
        time.sleep(1)
    config.PHOTO_REQUEST_FILE.unlink(missing_ok=True)
    return False, "camera.py didn't take the photo; is it running?"


WATER_WAIT_SECONDS = 15


def water(payload):
    """Ask reader.py to send WATER to the Arduino and wait until it has. Returns (success, message)."""
    if not config.WATERING_ENABLED:
        return False, "Watering is turned off on the Pi (WATERING_ENABLED=0)"
    config.WATER_REQUEST_FILE.touch()
    deadline = time.monotonic() + WATER_WAIT_SECONDS
    while time.monotonic() < deadline:
        if not config.WATER_REQUEST_FILE.exists():
            # The Arduino pours a fixed amount per WATER command; payload["seconds"] isn't used yet
            return True, "Poured water"
        time.sleep(0.5)
    config.WATER_REQUEST_FILE.unlink(missing_ok=True)  # don't pour later by surprise
    return False, "reader.py didn't pick up the request; is it running and connected to the Arduino?"


def run_commands(api):
    pending = api.request("GET", "/commands", params={"plant_id": config.PLANT_ID, "status": "pending"})
    for cmd in pending:
        log.info("Running command #%s %s %s", cmd["id"], cmd["type"], cmd["payload"])
        if cmd["type"] == "photo":
            success, message = take_photo_now()
            if success:
                upload_photos(api)  # get it to the dashboard now, not at the next upload tick
        elif cmd["type"] == "water":
            success, message = water(cmd["payload"])
        else:
            success, message = False, f"Unknown command type {cmd['type']}"
        api.request("POST", f"/commands/{cmd['id']}/done", json={"success": success, "message": message})
        log.info("Command #%s %s: %s", cmd["id"], "done" if success else "failed", message)


def run():
    db.init()
    api = Backend()
    next_upload = next_commands = 0.0
    backend_ok = True

    while True:
        now = time.monotonic()
        try:
            if now >= next_upload:
                upload_readings(api)
                upload_photos(api)
                next_upload = now + config.UPLOAD_INTERVAL
            if now >= next_commands:
                run_commands(api)
                next_commands = now + config.COMMAND_POLL_INTERVAL
            if not backend_ok:
                log.info("Backend reachable again")
            backend_ok = True
        except requests.RequestException as e:
            if backend_ok:
                log.warning("Can't reach %s (%s); keeping data locally and retrying", config.API_URL, e)
            backend_ok = False
            next_upload = next_commands = now + 10
        time.sleep(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    try:
        run()
    except KeyboardInterrupt:
        pass
