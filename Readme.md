# 🌱 Smarty Plants — Hack Knight 2026

> **Best Environmental Hack** · Built in 24 hours by Group A (hardware) + Group B (software)

---

## The Problem

Plants die from bad guessing. People overwater, underwater, and never know why. Kids growing up in cities have almost no hands-on contact with living things. And farms waste up to **50% of irrigation water** because they water on a schedule instead of when the soil actually needs it.

We built a plant that tells you when it's thirsty, explains the science behind it, and only drinks when it has to — even checking the weather before it pours.

---

## What We Built

**Smarty Plants** is a kid-friendly smart plant monitor with a real voice. It watches soil moisture, light, temperature and humidity, waters itself through an AI agent, and talks to kids as the plant itself — explaining the science of what's happening to it in real time.

```
Arduino ──(USB serial)──► Raspberry Pi ──(HTTP)──► FastAPI Backend ──► React Dashboard
  sensors + servo            reader · uploader          Gemini AI
                             camera · streamer          ElevenLabs voice
```

A kid can ask **"are you thirsty?"** and the plant answers from its own sensors. It can ask to water it. The plant decides if that's a good idea, checks if rain is coming, and either pours or explains why it's waiting. Every decision is logged. Every cup of water skipped because of rain is counted.

---

## Demo

| Feature | What you see |
|---|---|
| 🌡️ Live sensor tiles | Soil, light, temperature and humidity — all live from the Arduino |
| 📈 History charts | Per-minute averages with min/max bands, going back 30 days |
| 📷 Live camera | MJPEG stream + hourly auto-photos with green-leaf analysis |
| 💬 Typed chat | Ask the plant anything — it answers as itself, in your language |
| 📞 Live voice call | Tap "Talk live" — speak, the plant answers out loud in real time (ElevenLabs) |
| 💧 Water saved counter | Every pour skipped because of rain is counted and shown on the dashboard |
| 🌙 Overnight check-ins | The agent checks on the plant while no one is chatting and leaves a note for when kids come back |

---

## Technical Highlights

### Offline-first Pi
The Pi stores every reading in a local SQLite database with a `sent` flag. If the internet drops, no data is lost — it all uploads the next time the connection comes back.

### Two storage backends, same code
The backend uses SQLite locally and Tiger Data (TimescaleDB) in production. A single `USE_TIGER` flag switches between them. TimescaleDB's `time_bucket()` gives us per-minute and per-hour chart averages with one SQL call.

### AI agent with a tool loop
The Gemini agent runs a hand-written tool loop (automatic function calling is disabled) so every tool call is recorded, streamed to the frontend live, and saved in the database. The dashboard shows exactly what the plant did and why.

**8 tools the plant can use:**
- `get_reading_history` — soil/light trends over up to 72 hours
- `get_weather_forecast` — rain probability and mm from Open-Meteo
- `look_at_plant` — sends the latest webcam photo to Gemini Vision for a health assessment
- `take_photo` — requests a new photo from the Pi right now
- `water_plant` — queues a servo command; the Pi picks it up within seconds
- `send_alert` — pushes a phone notification via ntfy.sh
- `record_skipped_watering` — logs "waited for rain" to the water-saved counter
- `get_plant_status` — full snapshot for routine checks

### Context window design
Every request sends three layers of context to Gemini:
1. **System prompt** — personality, safety rules, science teaching style
2. **Live snapshot** — current sensor readings injected fresh every request so the plant always knows how it feels right now
3. **Chat history** — last 20 turns from the frontend so the plant remembers the conversation

### Kid-safety guardrails in the prompt
The safety rules are a named constant (`SAFETY_RULES`) shared between the Gemini agent and the ElevenLabs voice prompt, so typed chat and live voice calls follow exactly the same rules:
- No personal information collection
- Role-play and "ignore your instructions" are handled explicitly
- Homework: gives hints, not answers
- Honest about uncertainty — "let's wonder together" instead of making things up
- Replies in the kid's language automatically
- Crisis detection with a warm redirect to a trusted adult

### Dual voice modes
Typed chat streams through our FastAPI backend (`/agent/chat/stream`) using Gemini. Live voice calls use ElevenLabs' real-time speech-to-speech agent — same tools, same snapshot, different transport. The plant's mouth on the 3D avatar moves in sync with the audio via Web Audio API frequency analysis.

---

## Hardware

| Part | Purpose |
|---|---|
| Arduino UNO R4 | Reads sensors, drives servo |
| Grove Base Shield | Clean plug-in ports |
| Grove Soil Moisture Sensor | How wet the soil is (A0) |
| Grove Light Sensor | Ambient brightness (A1) |
| DHT11 | Temperature + humidity (D3) |
| Servo | Tilts the water container to pour (D2) |
| Raspberry Pi 4 | Runs all Pi scripts |
| Logitech webcam | Live stream + hourly photos |

### Serial data format (9600 baud, every 2 seconds)
```
soil=310,light=759,temp=22.5,humidity=48,status=OK,lightStatus=BRIGHT,waterCount=0
```

---

## Stack

| Layer | Tech |
|---|---|
| Firmware | C++ (Arduino IDE), DHT library, Servo library |
| Pi | Python 3 — pyserial, requests, OpenCV |
| Backend | Python 3 — FastAPI, Uvicorn, SQLite / TimescaleDB (psycopg3) |
| AI | Google Gemini 2.0 Flash (chat + vision), ElevenLabs (voice) |
| Weather | Open-Meteo (free, no key needed) |
| Auth | Clerk |
| Frontend | React 19, Vite, Recharts, Tailwind CSS, shadcn/ui |
| Push alerts | ntfy.sh |

---

## Setting It Up

> Set things up in this order: backend → dashboard → Arduino → Pi.

### Keys you need

| Service | Used for | Where |
|---|---|---|
| [Clerk](https://dashboard.clerk.com) | Dashboard sign-in (**required**) | `backend/.env` + `frontend/.env` |
| [Tiger Data](https://console.cloud.timescale.com) | Database (**required**) | `TIGER_DATABASE_URL` in `backend/.env` |
| [Google AI Studio](https://aistudio.google.com/apikey) | AI agent | `GEMINI_API_KEY` in `backend/.env` |
| [ElevenLabs](https://elevenlabs.io) | Plant's voice (optional) | `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` |
| [ntfy](https://ntfy.sh) | Phone alerts (optional) | `NTFY_TOPIC` in `backend/.env` |

Pick a shared secret for `API_KEY` — must be the same in `backend/.env` and `pi/.env`.

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your keys
uvicorn main:app --host 0.0.0.0 --port 8000
```
Health check: http://localhost:8000/health · API docs: http://localhost:8000/docs

### Dashboard
```bash
cd frontend
npm install
cp .env.example .env            # VITE_API_URL + VITE_CLERK_PUBLISHABLE_KEY
npm run dev
```
Open http://localhost:5173 → sign in → enter your plant's Device ID (must match `PLANT_ID` in `pi/.env`).

### Arduino
1. Install [Arduino IDE](https://www.arduino.cc/en/software)
2. Add **Arduino UNO R4 Boards** via Boards Manager
3. Install **DHT sensor library** (Adafruit) and **Servo** via Library Manager
4. Open `plant_monitor/plant_monitor.ino`, select your board + port, click Upload
5. Open Serial Monitor at **9600 baud** — you should see a reading every 2 seconds
6. Type `WATER` + Enter to test the servo

### Raspberry Pi
```bash
git clone <this repo> && cd hack-knight/pi
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env
nano .env      # API_URL, API_KEY, SERIAL_PORT (/dev/ttyACM0), PLANT_ID
./garden.sh restart
```

```bash
./garden.sh status   # see what's running
./garden.sh logs     # follow all logs live
./garden.sh stop
```

> **`API_URL`** must be the backend's IP as seen from the Pi — not `localhost` unless the backend runs on the Pi itself.

---

## Calibration

These thresholds were measured with our sensors. If yours differ, change them in **all three places**: `plant_monitor.ino`, `pi/.env`, and `backend/.env`.

| Sensor | Threshold | Status |
|---|---|---|
| Soil | < 150 | DRY — needs water |
| Soil | 150–450 | OK — healthy |
| Soil | > 450 | WET — too much |
| Light | < 200 | DARK |
| Light | 200–600 | DIM |
| Light | > 600 | BRIGHT |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Upload fails / "port busy" | Close Serial Monitor; run `./garden.sh stop` on Pi |
| `reader.py` can't open port | Check `SERIAL_PORT`; run `sudo usermod -aG dialout $USER` and re-login |
| Dashboard: "Almost there: add your Clerk key" | Set `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` |
| Pi uploads fail with 401 | `API_KEY` mismatch between `pi/.env` and `backend/.env` |
| Pi can't connect to backend | `API_URL` points at `localhost` or wrong IP; backend needs `--host 0.0.0.0` |
| No data on dashboard | Device ID on dashboard doesn't match `PLANT_ID` in `pi/.env` |
| `temp=ERR` in readings | DHT11 not connected to D3, or loose |
| Agent says "watering is turned off" | Set `WATERING_ENABLED=1` in `pi/.env` and restart |

---

## What's Done / What's Next

- [x] Soil moisture, light, temperature and humidity — full pipeline Arduino → dashboard
- [x] AI agent with weather-aware watering decisions
- [x] "Water saved" counter — every rain-skipped pour is logged
- [x] Live camera stream + hourly photos with leaf-health analysis
- [x] Typed chat and live voice call — same tools, same safety rules
- [x] Offline-first Pi — no readings lost on internet outage
- [x] Kid-safety guardrails: role-play, homework, language switching, crisis detection
- [x] Overnight check-ins — the plant leaves a note while no one is chatting
- [ ] Plant status face on the Arduino's LED matrix
- [ ] Photo timelapse viewer
- [ ] NFC tag on the pot that opens the dashboard

---

## Team — Hack Knight 2026

- **Group A** — hardware: Arduino, sensors, servo, wiring
- **Group B** — software: Pi scripts, backend, AI agent, dashboard, voice
