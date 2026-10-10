"""Streams the webcam to the backend and takes timed photos from the same feed.

Only one program can open the webcam at a time, so this process does both:
    live view   sends a JPEG to the backend's /frames STREAM_FPS times a second while someone is watching
                the dashboard, and one every STREAM_IDLE_SECONDS otherwise (saves hotspot data)
    photos      every PHOTO_INTERVAL saves a full-size photo and its plant metrics to the local DB

Metrics (computed with Pillow on a downscaled copy):
    brightness  0-255 average of the grayscale image
    green_pct   % of pixels that look like foliage (green hue, not too dark or washed out)

Run `python camera.py --test` to take one photo, print the metrics and send one live frame, without saving to the DB.
"""
import argparse
import logging
import time
from datetime import datetime

import cv2
import requests
from PIL import Image, ImageStat

import config
import db

log = logging.getLogger("camera")

# Pillow HSV uses 0-255 for every channel, so green (~70-170 degrees) is ~50-120
GREEN_HUE = (50, 120)
MIN_SATURATION = 60
MIN_VALUE = 40

WARMUP_FRAMES = 10  # frames to skip after opening while auto-exposure settles
SEND_RETRY_SECONDS = 5


def open_camera():
    """Open the webcam, retrying until it's available."""
    device = int(config.CAMERA_DEVICE) if config.CAMERA_DEVICE.isdigit() else config.CAMERA_DEVICE
    width, height = (int(n) for n in config.CAMERA_RESOLUTION.split("x"))
    while True:
        cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
        if cap.isOpened():
            # USB webcams only reach full frame rate at higher resolutions in MJPG mode
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # always read the newest frame, not a queued old one
            for _ in range(WARMUP_FRAMES):
                cap.read()
            log.info("Camera %s open", config.CAMERA_DEVICE)
            return cap
        log.warning("Can't open camera %s, retrying in 5s", config.CAMERA_DEVICE)
        time.sleep(5)


def analyze(path):
    with Image.open(path) as img:
        small = img.convert("RGB")
        small.thumbnail((160, 120))

    brightness = ImageStat.Stat(small.convert("L")).mean[0]

    pixels = list(small.convert("HSV").getdata())
    green = sum(
        1 for h, s, v in pixels
        if GREEN_HUE[0] <= h <= GREEN_HUE[1] and s >= MIN_SATURATION and v >= MIN_VALUE
    )
    green_pct = 100 * green / len(pixels)

    return round(green_pct, 1), round(brightness, 1)


def take_photo(frame, save_to_db=True):
    path = config.PHOTO_DIR / f"{datetime.now():%Y%m%d_%H%M%S}.jpg"
    if not cv2.imwrite(str(path), frame):
        log.error("Couldn't write %s", path)
        return None
    green_pct, brightness = analyze(path)
    if save_to_db:
        db.insert_photo(path, green_pct, brightness)
    log.info("Saved %s green=%s%% brightness=%s", path.name, green_pct, brightness)
    return path, green_pct, brightness


def send_frame(session, frame):
    """Send one live frame. Returns the number of dashboard viewers, or None if the backend is unreachable."""
    height, width = frame.shape[:2]
    if width > config.STREAM_WIDTH:
        frame = cv2.resize(frame, (config.STREAM_WIDTH, round(height * config.STREAM_WIDTH / width)))
    ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.STREAM_QUALITY])
    if not ok:
        return None
    try:
        resp = session.post(
            f"{config.API_URL}/frames",
            params={"plant_id": config.PLANT_ID},
            data=jpeg.tobytes(),
            headers={"X-API-Key": config.API_KEY, "Content-Type": "image/jpeg"},
            timeout=5,
        )
        resp.raise_for_status()
        return resp.json()["viewers"]
    except (requests.RequestException, ValueError, KeyError) as e:
        log.debug("Frame upload failed: %s", e)
        return None


def run():
    db.init()
    cap = open_camera()
    session = requests.Session()  # reuses one TCP connection for every frame
    next_photo = next_send = 0.0
    viewers = 0
    backend_ok = True

    while True:
        ok, frame = cap.read()
        if not ok:
            log.warning("Camera read failed, reopening")
            cap.release()
            cap = open_camera()
            continue

        now = time.monotonic()
        if now >= next_photo:
            take_photo(frame)
            next_photo = now + config.PHOTO_INTERVAL

        if now >= next_send:
            result = send_frame(session, frame)
            if result is None:
                if backend_ok:
                    log.warning("Can't reach %s; live view paused, retrying every %ss", config.API_URL, SEND_RETRY_SECONDS)
                backend_ok = False
                next_send = now + SEND_RETRY_SECONDS
                continue
            if not backend_ok:
                log.info("Live view connected")
            backend_ok = True
            if result != viewers:
                log.info("Dashboard viewers: %s", result)
            viewers = result
            next_send = now + (1 / config.STREAM_FPS if viewers else config.STREAM_IDLE_SECONDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="take one photo and send one live frame, don't save to DB")
    args = parser.parse_args()

    if args.test:
        cap = open_camera()
        ok, frame = cap.read()
        cap.release()
        if not ok:
            print("FAILED: camera opened but returned no frame")
        else:
            path, green_pct, brightness = take_photo(frame, save_to_db=False)
            print(f"OK  photo={path}  green={green_pct}%  brightness={brightness}")
            if brightness < 10:
                print("Image is nearly black: lens cap, dark room, or wrong device?")
            viewers = send_frame(requests.Session(), frame)
            if viewers is None:
                print(f"Live frame NOT sent: is the backend running at {config.API_URL} with the same API_KEY?")
            else:
                print(f"OK  live frame sent, {viewers} viewer(s) watching")
    else:
        try:
            run()
        except KeyboardInterrupt:
            pass
