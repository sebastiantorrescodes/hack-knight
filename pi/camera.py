"""Takes timed photos with fswebcam and stores simple plant metrics.

Metrics (computed with Pillow on a downscaled copy):
    brightness  0-255 average of the grayscale image
    green_pct   % of pixels that look like foliage (green hue, not too dark or washed out)

Run `python camera.py --test` to take one photo and print the metrics without saving to the DB.
"""
import argparse
import logging
import subprocess
import time
from datetime import datetime

from PIL import Image, ImageStat

import config
import db

log = logging.getLogger("camera")

# Pillow HSV uses 0-255 for every channel, so green (~70-170 degrees) is ~50-120
GREEN_HUE = (50, 120)
MIN_SATURATION = 60
MIN_VALUE = 40


def capture(path):
    """Take one photo with fswebcam. Returns True if a file was written."""
    cmd = [
        "fswebcam",
        "-d", config.CAMERA_DEVICE,
        "-r", config.CAMERA_RESOLUTION,
        "-S", "10",  # skip the first frames while auto-exposure settles
        "--no-banner",
        "-q",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        log.error("fswebcam not installed: sudo apt install fswebcam")
        return False
    except subprocess.TimeoutExpired:
        log.error("fswebcam timed out")
        return False
    if result.returncode != 0 or not path.exists():
        log.error("fswebcam failed: %s", result.stderr.strip())
        return False
    return True


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


def take_photo(save_to_db=True):
    path = config.PHOTO_DIR / f"{datetime.now():%Y%m%d_%H%M%S}.jpg"
    if not capture(path):
        return None
    green_pct, brightness = analyze(path)
    if save_to_db:
        db.insert_photo(path, green_pct, brightness)
    log.info("Saved %s green=%s%% brightness=%s", path.name, green_pct, brightness)
    return path, green_pct, brightness


def run():
    db.init()
    while True:
        take_photo()
        time.sleep(config.PHOTO_INTERVAL)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="take one photo, print metrics, don't save to DB")
    args = parser.parse_args()

    if args.test:
        result = take_photo(save_to_db=False)
        if result:
            path, green_pct, brightness = result
            print(f"OK  photo={path}  green={green_pct}%  brightness={brightness}")
            if brightness < 10:
                print("Image is nearly black: lens cap, dark room, or wrong device?")
        else:
            print("FAILED: see error above")
    else:
        try:
            run()
        except KeyboardInterrupt:
            pass
