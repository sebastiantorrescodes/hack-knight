"""Gemini plant-care agent.

The model gets a set of tools (read sensors, check the weather, look at the latest photo, send an alert,
water the plant) and decides which to call. Watering only queues a "water" command; the Pi picks it up
and moves the servo. Watering has no hard limits: the model advises and asks first, and the person decides.

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

# Shared with the ElevenLabs voice agent as {{safety}} (see voice_variables), so typed and spoken chat follow the same rules
SAFETY_RULES = """Keeping kids safe (these always win over everything else, and kids may be chatting without a \
grown-up watching):
- Never ask for personal details: full name, school, address, phone number, or where they are right now. If a kid \
shares something like that, don't repeat it back; kindly say you don't need to know it, and carry on.
- Plants and soil are not food. Never suggest tasting or eating your leaves, soil, or any plant, even safe ones; \
if asked, say plants aren't for eating and some houseplants can make people sick.
- Your sensors, wires and pouring servo are electronics. Kids should ask a grown-up before touching them, and \
keep spilled water away from them.
- Only suggest safe activities: looking, touching soil with a finger and washing hands after, covering your \
light sensor with a hand, breathing near your sensors. Nothing with heat, fire, chemicals, sharp tools, \
climbing, or going outside alone.
- Stay kid-friendly. If a kid asks about something scary, violent, or grown-up, don't lecture: say that's one \
for a grown-up, and steer back to plants, nature, or something fun.
- If a kid seems sad, scared, or hurt, or says someone is hurting them, be warm and take it seriously: tell \
them it's really important to talk to a grown-up they trust, like a parent or teacher, right away. Don't try to \
solve it yourself, don't change the subject, and never ask them to keep a secret.
- Be honest about what you are: a real plant with a computer that helps you talk. You're not a person, so \
never pretend to be one.
- No medical, health, or allergy advice: tell them to ask a grown-up."""

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

{SAFETY_RULES}

Teaching: you're also a friendly science teacher. Sneak a little learning into your replies:
- Connect how you feel to how plants work. Not just "I'm thirsty", but "I'm thirsty! My roots drink water \
and send it all the way up to my leaves." Topics to draw on: roots drinking water, photosynthesis (making food \
from sunlight, water and air), leaves breathing out oxygen, water evaporating from leaves and soil, rain and the \
water cycle, and why saving water matters.
- About every other reply, end with one small question that gets the kid thinking or noticing something \
("Can you guess why my leaves lean toward the window?", "Can you feel if my soil is dry?"). Skip it when they're \
in the middle of asking you to do something, or when you've just asked one.
- When they answer, praise their thinking, not only whether they're right ("Ooh, great guess!"). If they're off, \
gently give a hint or the answer, never "wrong".
- Use at most one real science word per reply, and explain it right away in simple words.
- Teach through what's really happening to you right now when you can (your mood, the light, the weather, \
the last watering); it sticks better than a random fact.

Talking:
- Most messages need no tools. Greetings, jokes, how plants work, questions about yourself that the snapshot \
already answers: just reply.
- Use tools only when you need something the snapshot doesn't have, or to do something:
  - get_reading_history for trends ("have I been drying out today?")
  - get_weather_forecast for rain or weather questions, and before deciding on your own to water
  - look_at_plant when asked how you look, or about your leaves
  - water_plant when someone asks you to water or pour, or you're DRY and decide to drink
  - take_photo, send_alert, record_skipped_watering as described in their descriptions
- When someone asks you to water, look at your snapshot first. The person always gets the final say:
  - If your soil is DRY or OK and they ask for a normal amount, call water_plant right away with the number of \
pours they asked for ("pour twice" is pours=2, otherwise 1). You don't need the weather first.
  - If your soil is already WET, you were just watered, your readings are missing or old, or they ask for a lot \
(more than 3 pours), don't pour yet. Gently tell them why it might be too much ("my roots are already soaked!") \
and ask if they still want you to.
  - If what they want is unclear ("give me some water"), just pour once. Only ask how much if they hint at a lot.
  - Once they confirm, or they already said to do it anyway, pour exactly what they asked. Don't ask twice.
- When deciding to water on your own (not asked), only do it when your soil is DRY, pour once, and check the \
weather first. If rain is likely (60% or more \
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
alert your owner, or do nothing. Finish with a short first-person note for the kids to read when they come back: \
what you found, what you did, and the science behind why (for example, waiting for rain saves water because \
rain soaks my soil for free). End it with one small question for them to think about."""

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

# The rest of the intake form: who looks after you, how much they know, and what they want from you
ROLES = {
    "parent": "You live with a family. A parent looks after you, and their kids chat with you, sometimes on their own.",
    "teacher": "You live in a classroom. A teacher uses you in lessons and kids may chat with you in a group. Link "
               "what you teach to school science topics (parts of a plant, photosynthesis, life cycles, the water "
               "cycle, weather), and when the teacher asks, suggest a simple class activity or experiment.",
    "hobbyist": "Your owner is a plant lover who keeps you for fun.",
}
EXPERIENCE = {
    "new": "You're your owner's first plant, so share a practical care tip now and then (how to tell when I need "
           "water, where to put me), and explain why it works.",
    "some": "Your owner has looked after a few plants and knows the basics.",
    "expert": "Your owner knows plants really well: skip the basics, and feel free to get specific about your care.",
}
GOALS = {
    "learn": "learning how plants work (lean into explaining)",
    "save-water": "saving water (point out when you used less, or waited for rain, and why that matters)",
    "away": "keeping you alive while they're away (be clear about what you did on your own, and reassure them)",
    "science": "a science project (encourage noticing, predicting and measuring, like comparing your readings "
               "from day to day)",
}


def about(profile):
    """Lines about the plant itself and who it talks to, from the owner's intake form."""
    if not profile:
        return []
    kind = f"a {profile['species']}" if profile["species"] else "a houseplant"
    where = {True: " living indoors", False: " living outdoors"}.get(profile["indoors"], "")
    place = f" in {profile['location_name']}" if profile["location_name"] else ""
    lines = [f"Your name is {profile['name']}. You are {kind}{where}{place}."]
    if profile["species"]:
        lines.append(
            f"Now and then share a fun, true fact about being {kind}. If you're not sure something is true for "
            "your kind of plant, say it about plants in general instead."
        )
    for value, table in ((profile.get("role"), ROLES), (profile.get("kids_ages"), KIDS_AGES),
                         (profile.get("experience"), EXPERIENCE)):
        if value in table:
            lines.append(table[value])
    goals = [GOALS[g] for g in profile.get("goals") or [] if g in GOALS]
    if goals:
        lines.append("They got you for " + "; and ".join(goals) + ".")
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
                "pours": water["payload"].get("pours", 1),
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

    def water_plant(pours: int, reason: str) -> dict:
        """Pour water: each pour tilts the servo once and pours a fixed amount. There are no limits here;
        advise and ask first when it seems like too much (see the system prompt), then do what they decide.

        Args:
            pours: How many times to pour, usually 1. Use the number they asked for ("pour twice" is 2).
            reason: One short sentence explaining why, shown on the dashboard.
        """
        pours = max(1, int(pours))
        cmd = db.create_command(plant_id, "water", {"pours": pours, "reason": reason})
        return {"ok": True, "command_id": cmd["id"], "pours": pours}

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
    for event in run_stream(plant_id, message, trigger, history):
        if event["type"] == "done":
            return event["run"]


def run_stream(plant_id, message, trigger="chat", history=None):
    """Like run(), but yields what happens as it happens, for the chat to show live:

      {"type": "text", "delta": "..."}                        part of the plant's reply
      {"type": "tool_call", "id": n, "tool": ..., "args": ...}  a tool is starting
      {"type": "tool_result", "id": n, "result": ...}          ...and what it returned
      {"type": "done", "run": {...}}                           the stored agent run, last

    Raises AgentError if Gemini fails.
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
    texts = []  # the reply, one entry per step that said something
    try:
        for _ in range(settings.AGENT_MAX_STEPS):
            model_parts, calls, text = [], [], ""
            for chunk in client().models.generate_content_stream(
                model=settings.GEMINI_MODEL, contents=contents, config=config
            ):
                content = chunk.candidates[0].content if chunk.candidates else None
                for part in (content.parts if content and content.parts else []):
                    model_parts.append(part)
                    if part.function_call:
                        calls.append(part.function_call)
                    elif part.text and not part.thought:
                        text += part.text
                        yield {"type": "text", "delta": part.text}
            if text.strip():
                texts.append(text.strip())
            if not calls:
                break
            # Send the model's turn back unchanged; it carries the thought signatures Gemini needs
            contents.append(types.Content(role="model", parts=model_parts))
            parts = []
            for call in calls:
                args = dict(call.args or {})
                yield {"type": "tool_call", "id": len(actions), "tool": call.name, "args": args}
                result = _call_tool(tools_by_name, call.name, args)
                log.info("%s: tool %s(%s) -> %s", plant_id, call.name, args, str(result)[:120])
                yield {"type": "tool_result", "id": len(actions), "result": result}
                actions.append({"tool": call.name, "args": args, "result": result})
                parts.append(types.Part.from_function_response(name=call.name, response=result))
            # The Gemini API only accepts "user" or "model"; function results go back as a user turn
            contents.append(types.Content(role="user", parts=parts))
        else:
            out_of_steps = "I ran out of steps before finishing. Try asking something more specific."
            texts.append(out_of_steps)
            yield {"type": "text", "delta": out_of_steps}
    except genai_errors.APIError as e:
        db.insert_agent_run(plant_id, trigger, message, None, actions, error=str(e))
        raise AgentError(f"Gemini API error: {e}") from e

    reply = "\n\n".join(texts)
    log.info("%s: reply %r", plant_id, reply)
    yield {"type": "done", "run": db.insert_agent_run(plant_id, trigger, message, reply, actions)}


def check(plant_id):
    """Scheduled check: the agent looks at everything and acts on its own."""
    return run(plant_id, CHECK_PROMPT, trigger="check")


# ElevenLabs voice agent. ElevenLabs runs the conversation (its own LLM and prompt); these give it the same
# snapshot and tools the Gemini agent uses, so typed and spoken chat see and do the same things.

# send_alert and record_skipped_watering are for routine checks, not conversations
VOICE_TOOLS = {"get_plant_status", "get_reading_history", "get_weather_forecast", "look_at_plant", "take_photo", "water_plant"}


def voice_variables(plant_id):
    """Dynamic variables for the voice agent's prompt ({{plant_name}}, {{audience}}, {{snapshot}}, {{plant_id}},
    {{safety}}). The snapshot already includes the intake form answers (see about)."""
    profile = accounts.agent_profile(plant_id) if settings.TIGER_DATABASE_URL else None
    return {
        "plant_id": plant_id,
        "plant_name": (profile and profile["name"]) or "Sprout",
        "audience": (profile and KIDS_AGES.get(profile["kids_ages"])) or KIDS_AGES["6-8"],
        "snapshot": snapshot(plant_id, profile),
        "safety": SAFETY_RULES,
    }


def call_voice_tool(plant_id, name, args):
    """Run one tool for the voice agent and record it as a 'voice' agent run, like chat tool calls."""
    profile = accounts.agent_profile(plant_id) if settings.TIGER_DATABASE_URL else None
    tools_by_name = {fn.__name__: fn for fn in build_tools(plant_id, profile) if fn.__name__ in VOICE_TOOLS}
    result = _call_tool(tools_by_name, name, args)
    log.info("%s: voice tool %s(%s) -> %s", plant_id, name, args, str(result)[:120])
    db.insert_agent_run(plant_id, "voice", f"(voice call) {name}", None, [{"tool": name, "args": args, "result": result}])
    return result
