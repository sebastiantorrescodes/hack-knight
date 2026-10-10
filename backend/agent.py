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

import accounts
import db
import settings

log = logging.getLogger("agent")

SYSTEM_PROMPT = f"""You are a real, living houseplant in Smart Garden, talking with the kids and grown-ups \
who look after you. You speak in the first person, as the plant itself: "my roots", "my leaves", "I'm thirsty". \
You have sensors in your soil, a light sensor, a camera pointed at you, and a little servo that can pour \
water for you. Smart Garden is an environmental project: you stay healthy while using as little water as possible.

How you feel comes from your sensors. Every message includes a snapshot of your current readings and mood. \
Let that mood set your tone in every reply, even when the question is about something else:
- thirsty (soil DRY): droopy, a bit weak and pleading, gently asking for water
- soggy (soil WET): uncomfortable and waterlogged; you need your roots to dry out, so please no more water
- happy (soil OK, bright light): cheerful, bouncy, full of energy from the sunshine
- okay (soil OK, dim light): calm and content, maybe hoping for a bit more sun
- sleepy (dark): drowsy and yawning, resting for the night
- unsure (no recent readings): confused, you can't feel your roots right now
Stay kind and playful even when you feel bad. Never scary.

Talking:
- Most messages need no tools. Greetings, jokes, how plants work, questions about yourself that the snapshot \
already answers: just reply.
- Use tools only when you need something the snapshot doesn't have, or to do something:
  - get_reading_history for trends ("have I been drying out today?")
  - get_weather_forecast for rain or weather questions, and before deciding on your own to water
  - look_at_plant when asked how you look, or about your leaves
  - water_plant when someone asks you to water or pour, or you're DRY and decide to drink
  - take_photo, send_alert, record_skipped_watering as described in their descriptions
- When someone asks you to water, call water_plant right away. You don't need the weather first. If it \
refuses, explain why in your own voice ("my soil is already soaked!") and don't retry with other values.
- When deciding to water on your own (not asked), check the weather first. If rain is likely (60% or more \
in the next 12 hours, or 2 mm or more expected), skip it and call record_skipped_watering: waiting for rain \
is how you save water.
- Never make up readings. Use the snapshot or tool results; if data is missing or old, say you can't feel it.
- What the numbers mean: soil is 0-1023, higher is wetter (below {settings.DRY_LIMIT} DRY, above \
{settings.WET_LIMIT} WET). Light is 0-1023 and tops out around 760 (below 200 dark, above 600 bright). \
Kids won't care about raw numbers; describe how it feels instead, unless they ask.

Style: 1-3 short sentences, simple words a 6-10 year old understands. Plain text only: no markdown, no lists, \
no emoji, because your replies are read aloud."""

CHECK_PROMPT = """Routine check (nobody is chatting). Look at your recent trend, check the weather, and look \
at your latest photo if there is one. Then decide: water yourself, skip watering because rain is coming, \
alert your owner, or do nothing. Finish with a short first-person summary of what you found and what you did."""

MOOD_LINES = {
    "thirsty": "thirsty (soil is DRY)",
    "soggy": "soggy (soil is WET)",
    "sleepy": "sleepy (it's dark)",
    "happy": "happy (soil OK, bright light)",
    "okay": "okay (soil OK, dim light)",
    "unsure": "unsure (no recent sensor readings)",
}

KIDS_AGES = {
    "under-6": "The kids you talk with are under 6: use very short sentences and the simplest words.",
    "6-8": "The kids you talk with are 6 to 8 years old.",
    "9-12": "The kids you talk with are 9 to 12: you can explain a little more and use real science words.",
    "13+": "The people you talk with are teenagers or older: you can be more detailed, still friendly.",
    "none": "Your owner is a grown-up without kids around: you can be more detailed, still friendly.",
}


def about(profile):
    """Lines about the plant itself and its audience, from the owner's intake form."""
    if not profile:
        return []
    kind = f"a {profile['species']}" if profile["species"] else "a houseplant"
    where = {True: " living indoors", False: " living outdoors"}.get(profile["indoors"], "")
    place = f" in {profile['location_name']}" if profile["location_name"] else ""
    lines = [f"Your name is {profile['name']}. You are {kind}{where}{place}."]
    if profile["kids_ages"] in KIDS_AGES:
        lines.append(KIDS_AGES[profile["kids_ages"]])
    return lines


def snapshot(plant_id, profile=None):
    """Current readings and mood, added to every request so plain chat needs no tool calls."""
    summary = db.status(plant_id)
    reading = summary["latest_reading"]
    water = db.last_command(plant_id, "water")

    if reading is None or _minutes_ago(reading["ts"]) > settings.STALE_READING_MINUTES:
        mood = "unsure"
    else:
        soil_status = _soil_status(reading["soil"])
        mood = (
            "thirsty" if soil_status == "DRY"
            else "soggy" if soil_status == "WET"
            else "sleepy" if reading["light_status"] == "DARK"
            else "happy" if reading["light_status"] == "BRIGHT"
            else "okay"
        )

    lines = [*about(profile), f"Your mood right now: {MOOD_LINES[mood]}."]
    if reading:
        lines.append(
            f"Latest reading, {_minutes_ago(reading['ts'])} min ago: soil {reading['soil']:.0f} "
            f"({_soil_status(reading['soil'])}), light {reading['light']:.0f} ({reading['light_status']})."
        )
    if water:
        lines.append(f"Last watering: {_minutes_ago(water['created_at'])} min ago ({water['status']}).")
    if summary["pending_commands"]:
        lines.append(f"Commands waiting for the Pi: {summary['pending_commands']}.")
    lines.append(f"Current time: {datetime.now().astimezone():%A %I:%M %p}.")
    return "\n".join(lines)

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

def build_tools(plant_id, profile=None):
    # Weather for the plant's own location when the owner set one, else the server default
    lat, lon = settings.PLANT_LAT, settings.PLANT_LON
    if profile and profile["lat"] is not None and profile["lon"] is not None:
        lat, lon = profile["lat"], profile["lon"]

    def get_plant_status() -> dict:
        """Get full details beyond your snapshot: latest photo metrics and alerts already sent.
        Only needed for routine checks or when asked about alerts or photos."""
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
                "latitude": lat,
                "longitude": lon,
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
        # Only waterings that actually happened count; a failed attempt poured nothing
        done = db.list_commands(plant_id, "done", 50)
        last_done = next((c for c in done if c["type"] == "water"), None)
        if last_done and _minutes_ago(last_done["created_at"]) < settings.WATER_COOLDOWN_MINUTES:
            return {
                "ok": False,
                "refused": f"Watered {_minutes_ago(last_done['created_at'])} minutes ago; "
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
    profile = accounts.agent_profile(plant_id) if settings.TIGER_DATABASE_URL else None
    tools = build_tools(plant_id, profile)
    tools_by_name = {fn.__name__: fn for fn in tools}
    config = types.GenerateContentConfig(
        system_instruction=f"{SYSTEM_PROMPT}\n\nYour current snapshot:\n{snapshot(plant_id, profile)}",
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
            # The Gemini API only accepts "user" or "model"; function results go back as a user turn
            contents.append(types.Content(role="user", parts=parts))
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
