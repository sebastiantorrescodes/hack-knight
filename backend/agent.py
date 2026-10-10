"""Gemini plant-care agent.

The model gets a set of tools (read sensors, check the weather, look at the latest photo, send an alert,
water the plant) and decides which to call. Watering only queues a "water" command; the Pi picks it up
and moves the servo. The limits in water_plant() are enforced here in code, not left to the model.

The tool loop is written out by hand (automatic function calling disabled) so every call is recorded
in `actions` for the dashboard, and so it keeps working when the SDK changes its automatic mode.
"""
import logging
from datetime import datetime, timedelta, timezone

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

import db
import settings

log = logging.getLogger("agent")

SYSTEM_PROMPT = f"""You are the AI caretaker for a plant in Smart Garden, an environmental project that \
keeps plants healthy while using as little water as possible.

What the sensors mean:
- Soil moisture is a raw value from 0 to 1023; higher is wetter. Below {settings.DRY_LIMIT} is DRY (needs \
water), {settings.DRY_LIMIT}-{settings.WET_LIMIT} is OK, above {settings.WET_LIMIT} is WET (too much water).
- Light is a relative raw value from 0 to 1023 that tops out around 760. Below 200 is DARK, 200-600 is DIM, \
above 600 is BRIGHT.
- Photos come from a webcam pointed at the plant. green_pct is the share of pixels that look like leaves.

How to work:
- Base everything you say on tool results. Never make up readings. If data is missing or old, say so.
- Before watering, check the plant's status and the weather forecast. If rain is likely (60% or higher in \
the next 12 hours, or 2 mm or more expected), don't water: call record_skipped_watering instead, because \
skipping is how this project saves water.
- Water only when the soil is DRY, or when the owner asks and the soil isn't WET. Use short bursts of 2-3 \
seconds. water_plant enforces safety limits; if it refuses, explain why instead of retrying with other values.
- Call send_alert only when the owner needs to know or act: the plant is dry and can't be watered, the \
sensors went quiet, a photo shows a problem, or watering failed. Don't repeat an alert listed in \
recent_alerts unless the situation got worse.
- Reply in 2-4 short, friendly sentences of plain text with no markdown. Replies appear on a dashboard \
and may be read aloud."""

CHECK_PROMPT = """Routine check. Look at the plant's current status and recent trend, check the weather, \
and look at the latest photo if there is one. Then decide: water, skip watering because of rain, alert the \
owner, or do nothing. Finish with a short summary of what you found and what you did."""

_client = None


class AgentError(Exception):
    pass


def client():
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise AgentError("GEMINI_API_KEY is not set on the server (backend/.env)")
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _minutes_ago(ts):
    return round((datetime.now(timezone.utc) - datetime.fromisoformat(ts)).total_seconds() / 60)


def _soil_status(soil):
    if soil < settings.DRY_LIMIT:
        return "DRY"
    if soil > settings.WET_LIMIT:
        return "WET"
    return "OK"


# Tools. Gemini builds each tool's schema from the function name, type hints and docstring,
# so the docstrings are written for the model.

def build_tools(plant_id):
    def get_plant_status() -> dict:
        """Get the plant's latest sensor reading and how old it is, the latest photo's metrics,
        the last watering, pending commands for the Pi, and recent alerts already sent."""
        summary = db.status(plant_id)
        reading = summary["latest_reading"]
        photo = summary["latest_photo"]
        water = db.last_command(plant_id, "water")
        return {
            "latest_reading": reading and {
                "soil": reading["soil"],
                "soil_status": _soil_status(reading["soil"]),
                "light": reading["light"],
                "light_status": reading["light_status"],
                "minutes_ago": _minutes_ago(reading["ts"]),
            },
            "latest_photo": photo and {
                "green_pct": photo["green_pct"],
                "brightness": photo["brightness"],
                "minutes_ago": _minutes_ago(photo["ts"]),
            },
            "last_watering": water and {
                "seconds": water["payload"].get("seconds"),
                "status": water["status"],
                "minutes_ago": _minutes_ago(water["created_at"]),
            },
            "pending_commands": summary["pending_commands"],
            "recent_alerts": [
                {"message": e["message"], "minutes_ago": _minutes_ago(e["ts"])}
                for e in db.list_events(plant_id, "alert", 3)
            ],
        }

    def get_reading_history(hours: int) -> dict:
        """Get soil moisture and light readings over the past few hours, to see trends such as
        soil drying out steadily. Returns min/max/average and about 24 evenly spaced samples.

        Args:
            hours: How many hours back to look, from 1 to 72.
        """
        hours = max(1, min(int(hours), 72))
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="seconds")
        rows = db.list_readings(plant_id, 5000, since)
        if not rows:
            return {"hours": hours, "count": 0, "note": "No readings in this period."}
        soils = [r["soil"] for r in rows]
        step = max(1, len(rows) // 24)
        return {
            "hours": hours,
            "count": len(rows),
            "soil_min": min(soils),
            "soil_max": max(soils),
            "soil_avg": round(sum(soils) / len(soils), 1),
            "soil_first": soils[0],
            "soil_last": soils[-1],
            "light_avg": round(sum(r["light"] for r in rows) / len(rows), 1),
            "samples": [
                {"minutes_ago": _minutes_ago(r["ts"]), "soil": r["soil"], "light": r["light"]}
                for r in rows[::step]
            ],
        }

    def get_weather_forecast() -> dict:
        """Get the current weather and the rain forecast for the next 24 hours at the plant's location."""
        resp = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": settings.PLANT_LAT,
                "longitude": settings.PLANT_LON,
                "current": "temperature_2m,relative_humidity_2m,precipitation",
                "hourly": "precipitation_probability,precipitation",
                "forecast_hours": 24,
                "temperature_unit": "fahrenheit",
                "timezone": "auto",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        hourly = data["hourly"]
        probs = [p or 0 for p in hourly["precipitation_probability"]]
        rain = [r or 0 for r in hourly["precipitation"]]
        likely = [t for t, p in zip(hourly["time"], probs) if p >= 60]
        return {
            "current": {
                "temperature_f": data["current"]["temperature_2m"],
                "humidity_pct": data["current"]["relative_humidity_2m"],
                "precipitation_mm": data["current"]["precipitation"],
            },
            "next_12h": {"max_rain_chance_pct": max(probs[:12], default=0), "rain_mm": round(sum(rain[:12]), 1)},
            "next_24h": {"max_rain_chance_pct": max(probs, default=0), "rain_mm": round(sum(rain), 1)},
            "first_likely_rain_hour": likely[0] if likely else None,
        }

    def look_at_plant() -> dict:
        """Look at the latest webcam photo of the plant and describe its health:
        leaf color, wilting or drooping, dry-looking soil, pests, or anything unusual."""
        photos = db.list_photos(plant_id, 1)
        if not photos:
            return {"error": "No photos yet. You can call take_photo to request one."}
        photo = photos[0]
        image = (settings.PHOTO_DIR / photo["path"]).read_bytes()
        mime = "image/png" if photo["path"].endswith(".png") else "image/jpeg"
        resp = client().models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=image, mime_type=mime),
                "This webcam photo shows a houseplant being monitored. In 2-4 sentences, describe its "
                "health: leaf color, wilting or drooping, visible soil dryness, pests or damage. If the "
                "photo is too dark or the plant isn't visible, say that instead.",
            ],
        )
        return {
            "photo_minutes_ago": _minutes_ago(photo["ts"]),
            "green_pct": photo["green_pct"],
            "brightness": photo["brightness"],
            "assessment": resp.text,
        }

    def take_photo() -> dict:
        """Ask the Pi to take a new photo now. The photo arrives within a minute or two,
        so it won't be available to look_at_plant during this conversation."""
        pending = db.list_commands(plant_id, "pending", 50)
        if any(c["type"] == "photo" for c in pending):
            return {"ok": True, "note": "A photo is already requested."}
        cmd = db.create_command(plant_id, "photo", {})
        return {"ok": True, "command_id": cmd["id"]}

    def send_alert(message: str, urgent: bool) -> dict:
        """Send the owner a phone notification about the plant.

        Args:
            message: One or two sentences saying what's wrong and what to do.
            urgent: True only if the plant needs attention within the next few hours.
        """
        delivered = False
        if settings.NTFY_TOPIC:
            resp = httpx.post(
                f"https://ntfy.sh/{settings.NTFY_TOPIC}",
                content=message.encode(),
                headers={
                    "Title": "Smart Garden",
                    "Priority": "high" if urgent else "default",
                    "Tags": "seedling",
                },
                timeout=10,
            )
            resp.raise_for_status()
            delivered = True
        db.insert_event(plant_id, "alert", message, {"urgent": urgent, "delivered": delivered})
        return {"ok": True, "delivered_to_phone": delivered}

    def water_plant(seconds: int, reason: str) -> dict:
        """Water the plant by running the watering servo for a few seconds. Refused if the soil is
        already wet, the latest reading is old, the plant was watered recently, or a watering is pending.

        Args:
            seconds: How long to water, from 1 to the server's limit (usually 5).
            reason: One short sentence explaining why, shown on the dashboard.
        """
        seconds = int(seconds)
        if not 1 <= seconds <= settings.MAX_WATER_SECONDS:
            return {"ok": False, "refused": f"seconds must be between 1 and {settings.MAX_WATER_SECONDS}"}

        reading = db.status(plant_id)["latest_reading"]
        if reading is None:
            return {"ok": False, "refused": "No soil readings yet, so watering would be blind."}
        age = _minutes_ago(reading["ts"])
        if age > settings.STALE_READING_MINUTES:
            return {"ok": False, "refused": f"The latest soil reading is {age} minutes old; the sensor may be offline."}
        if _soil_status(reading["soil"]) == "WET":
            return {"ok": False, "refused": f"Soil is already WET ({reading['soil']})."}

        last = db.last_command(plant_id, "water")
        if last and last["status"] == "pending":
            return {"ok": False, "refused": "A watering is already waiting for the Pi."}
        if last and _minutes_ago(last["created_at"]) < settings.WATER_COOLDOWN_MINUTES:
            return {
                "ok": False,
                "refused": f"Watered {_minutes_ago(last['created_at'])} minutes ago; "
                           f"the minimum gap is {settings.WATER_COOLDOWN_MINUTES} minutes.",
            }

        cmd = db.create_command(plant_id, "water", {"seconds": seconds, "reason": reason})
        return {"ok": True, "command_id": cmd["id"], "seconds": seconds}

    def record_skipped_watering(reason: str) -> dict:
        """Record that the plant needed water but you skipped watering because rain is coming.
        This feeds the dashboard's water-saved counter.

        Args:
            reason: One short sentence, e.g. "80% chance of rain in the next 6 hours".
        """
        db.insert_event(plant_id, "skipped_watering", reason)
        return {"ok": True, "total_skipped": db.count_events(plant_id, "skipped_watering")}

    return [
        get_plant_status,
        get_reading_history,
        get_weather_forecast,
        look_at_plant,
        take_photo,
        send_alert,
        water_plant,
        record_skipped_watering,
    ]


def _call_tool(tools_by_name, name, args):
    fn = tools_by_name.get(name)
    if fn is None:
        return {"error": f"Unknown tool {name}"}
    try:
        return fn(**args)
    except Exception as e:  # report tool failures to the model instead of crashing the request
        log.exception("Tool %s failed", name)
        return {"error": f"{type(e).__name__}: {e}"}


def run(plant_id, message, trigger="chat", history=None):
    """Run the agent on one message. history is earlier chat turns: [{"role": "user"|"model", "text": ...}].

    Returns the stored agent run: {id, ts, reply, actions: [{tool, args, result}], ...}.
    """
    tools = build_tools(plant_id)
    tools_by_name = {fn.__name__: fn for fn in tools}
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=tools,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    contents = [
        types.Content(role=turn["role"], parts=[types.Part.from_text(text=turn["text"])])
        for turn in history or []
    ]
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))
    log.info("%s: %s %r", plant_id, trigger, message[:80])

    actions = []
    reply = None
    try:
        for _ in range(settings.AGENT_MAX_STEPS):
            response = client().models.generate_content(
                model=settings.GEMINI_MODEL, contents=contents, config=config
            )
            calls = response.function_calls
            if not calls:
                reply = response.text or ""
                break
            # Send the model's turn back unchanged; it carries the thought signatures Gemini needs
            contents.append(response.candidates[0].content)
            parts = []
            for call in calls:
                args = dict(call.args or {})
                result = _call_tool(tools_by_name, call.name, args)
                log.info("%s: tool %s(%s) -> %s", plant_id, call.name, args, str(result)[:120])
                actions.append({"tool": call.name, "args": args, "result": result})
                parts.append(types.Part.from_function_response(name=call.name, response=result))
            contents.append(types.Content(role="tool", parts=parts))
        else:
            reply = "I ran out of steps before finishing. Try asking something more specific."
    except genai_errors.APIError as e:
        db.insert_agent_run(plant_id, trigger, message, None, actions, error=str(e))
        raise AgentError(f"Gemini API error: {e}") from e

    log.info("%s: reply %r", plant_id, reply)
    return db.insert_agent_run(plant_id, trigger, message, reply, actions)


def check(plant_id):
    """Scheduled check: the agent looks at everything and acts on its own."""
    return run(plant_id, CHECK_PROMPT, trigger="check")
