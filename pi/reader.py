"""Reads Arduino serial lines, averages them, and stores the result in SQLite.

Expected line format (from plant_monitor.ino):
    soil=312,light=540,status=OK,lightStatus=DIM
"""
import logging
import time
from collections import deque
from statistics import mean

import serial

import config
import db

log = logging.getLogger("reader")


def parse_line(line):
    """Return {'soil': int, 'light': int} or None if the line is malformed."""
    try:
        fields = dict(part.split("=", 1) for part in line.strip().split(","))
        return {"soil": int(fields["soil"]), "light": int(fields["light"])}
    except (ValueError, KeyError):
        return None


def soil_status(soil):
    if soil < config.DRY_LIMIT:
        return "DRY"
    if soil > config.WET_LIMIT:
        return "WET"
    return "OK"


def light_status(light):
    if light < config.DARK_LIMIT:
        return "DARK"
    if light < config.BRIGHT_LIMIT:
        return "DIM"
    return "BRIGHT"


def open_serial():
    while True:
        try:
            ser = serial.Serial(config.SERIAL_PORT, config.SERIAL_BAUD, timeout=5)
            # Opening the port resets most Arduinos; give it time to boot and drop the partial first line
            time.sleep(2)
            ser.reset_input_buffer()
            log.info("Connected to %s", config.SERIAL_PORT)
            return ser
        except serial.SerialException as e:
            log.warning("Can't open %s (%s), retrying in 5s", config.SERIAL_PORT, e)
            time.sleep(5)


def run():
    db.init()
    window = deque(maxlen=config.SMOOTHING_WINDOW)
    ser = open_serial()

    while True:
        try:
            raw = ser.readline().decode("utf-8", errors="ignore")
        except serial.SerialException as e:
            log.warning("Serial error (%s), reconnecting", e)
            ser.close()
            ser = open_serial()
            continue

        if not raw:
            continue  # readline timed out
        reading = parse_line(raw)
        if reading is None:
            log.debug("Skipping bad line: %r", raw)
            continue

        window.append(reading)
        if len(window) < config.SMOOTHING_WINDOW:
            continue

        # Status is recomputed from the averages so it matches what we store
        soil = round(mean(r["soil"] for r in window), 1)
        light = round(mean(r["light"] for r in window), 1)
        db.insert_reading(soil, light, soil_status(soil), light_status(light))
        log.info("soil=%s (%s) light=%s (%s)", soil, soil_status(soil), light, light_status(light))
        window.clear()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    try:
        run()
    except KeyboardInterrupt:
        pass
