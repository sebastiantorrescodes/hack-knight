# Smarty Plants 🌱

A smart plant care system built for **Hack Knight 2026: Best Environmental Hack**.

Most people overwater or underwater their plants, and farms waste huge amounts of water on irrigation. Smarty Plants watches soil moisture, light, temperature and humidity, waters only when the plant actually needs it, and skips watering when rain is on the way. The plant even talks: an AI agent speaks as the plant, so kids can ask it how it's feeling.

## How it works

```
Sensors + servo ─ Arduino ─(USB serial)─ Raspberry Pi ─(HTTP)─ Backend (FastAPI + AI agent) ─ Dashboard (React)
                                         + webcam
```

| Part | Folder | What it does |
|---|---|---|
| **Arduino** | `plant_monitor/` | Reads the sensors, sends one line of data every 2 seconds, and tilts the water servo when it receives `WATER`. It never waters on its own. |
| **Raspberry Pi** | `pi/` | Reads the Arduino, stores and uploads readings, streams the webcam, and passes watering commands from the backend to the Arduino. |
| **Backend** | `backend/` | Stores readings and photos, runs the AI agent (Gemini), checks the weather, sends phone alerts, and voices the plant (ElevenLabs). |
| **Dashboard** | `frontend/` | Sign-in, live readings, history charts, live camera, and a chat with the plant. |

The backend decides when to water, not the Arduino. There are no hard limits: if someone asks for water when the soil is already wet, right after a watering, or asks for a lot, the plant explains why it might be too much and asks if they're sure. Whatever they decide, it does ("pour twice" pours twice). When it waters on its own, it only does so when the soil is dry, and checks the weather first.

## Hardware

| Part | Purpose |
|---|---|
| Arduino UNO R4 | Reads the sensors and drives the servo |
| Grove Base Shield | Plug-in ports for Grove sensors |
| Grove Soil Moisture Sensor | How wet the soil is |
| Grove Light Sensor | Relative brightness |
| DHT11 | Temperature and humidity |
| Servo | Tilts the water container to pour |
| Raspberry Pi 4 | Runs the Pi scripts |
| Logitech webcam | Live view and plant photos |
| USB-C cable | Powers the Arduino and carries data |

### Wiring

Set the Grove Base Shield's voltage switch to **5V** if it has one. Always unplug the USB cable before connecting or moving anything.

| Part | Shield port |
|---|---|
| Soil moisture | A0 |
| Light | A1 |
| Servo | D2 |
| DHT11 | D3 |

## Getting everything running

Set things up in this order: backend, dashboard, Arduino, then Pi. The Pi needs the backend's address, and the dashboard needs the backend running.

### 0. Accounts and keys

| Service | Needed for | Where it goes |
|---|---|---|
| [Clerk](https://dashboard.clerk.com) | Dashboard sign-in (**required**) | Publishable key (`pk_...`) in `backend/.env` and `frontend/.env` |
| [Tiger Data](https://console.cloud.timescale.com) | Users, plants and readings (**required** for the dashboard) | Service URL in `backend/.env` |
| [Google AI Studio](https://aistudio.google.com/apikey) | The AI agent and plant chat | `GEMINI_API_KEY` in `backend/.env` |
| [ElevenLabs](https://elevenlabs.io) | The plant's voice (optional) | `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `backend/.env` |
| [ntfy](https://ntfy.sh) app | Phone alerts (optional) | `NTFY_TOPIC` in `backend/.env` |

Pick a shared secret for `API_KEY`. It has to be the same in `backend/.env` and `pi/.env`, because the Pi uses it to upload data.

### 1. Backend (laptop or server)

Needs Python 3.10 or newer.

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then fill in the keys from step 0
uvicorn main:app --host 0.0.0.0 --port 8000
```

Check it at http://localhost:8000/health. The API docs are at http://localhost:8000/docs.

To have the agent check on the plant by itself, set `AGENT_CHECK_MINUTES=30` (or any number of minutes). At `0` it only acts when someone chats with it. Set `PLANT_LAT` and `PLANT_LON` to where the plant is, so the weather forecast is local.

### 2. Dashboard

Needs Node.js 20 or newer.

```bash
cd frontend
npm install
cp .env.example .env              # VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY
npm run dev
```

Open http://localhost:5173 and sign in. The first time, a short setup form asks about you and your plant. For **Device ID**, enter the same value as `PLANT_ID` in `pi/.env` (default `plant-1`). This links the Pi's data to your account.

### 3. Arduino

1. Install the [Arduino IDE](https://www.arduino.cc/en/software).
2. In **Tools → Board → Boards Manager**, install **Arduino UNO R4 Boards**.
3. In **Tools → Manage Libraries**, install **DHT sensor library** (by Adafruit) and **Servo**.
4. Open `plant_monitor/plant_monitor.ino`.
5. Plug in the Arduino, then choose the board and port from the **Select Board** dropdown.
6. Click **Upload**.
7. Open the **Serial Monitor** at **9600 baud** with the line ending set to **Newline**. You should see a reading every 2 seconds. Type `WATER` and press Enter to test the servo.
8. Close the Serial Monitor when you're done. Only one program can use the port at a time.

The code stays on the Arduino and runs whenever it has power. You only upload again when the `.ino` file changes. If the Arduino is plugged into the Pi, stop the Pi scripts (`./garden.sh stop`) before uploading.

### 4. Raspberry Pi

Plug the Arduino and webcam into the Pi, then:

```bash
git clone <this repo> && cd hack-knight/pi
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env
nano .env                         # set API_URL, API_KEY, SERIAL_PORT, PLANT_ID
./garden.sh restart
```

In `pi/.env`:

- **`API_URL`** is the backend's address *as seen from the Pi*. If the backend runs on your laptop, use the laptop's IP address on the same network, for example `http://192.168.1.20:8000`. `localhost` only works if the backend runs on the Pi itself.
- **`API_KEY`** must match `backend/.env`.
- **`SERIAL_PORT`** is usually `/dev/ttyACM0`. Run `ls /dev/ttyACM* /dev/ttyUSB*` to check.
- **`PLANT_ID`** must match the Device ID you entered on the dashboard.

`garden.sh` runs three scripts in the background:

| Script | Job |
|---|---|
| `reader.py` | Reads the Arduino, averages every 5 readings and stores them; sends `WATER` when the backend asks |
| `uploader.py` | Uploads readings and photos, and picks up commands (water, photo) from the backend |
| `camera.py` | Streams the webcam to the dashboard and takes a photo every hour |

```bash
./garden.sh status                # which scripts are running
./garden.sh logs                  # follow all logs (or: ./garden.sh logs reader)
./garden.sh stop
```

Run `./garden.sh restart` after every `git pull` so the scripts load the new code. To test the camera alone, run `venv/bin/python camera.py --test`. To turn off watering (for example while the servo is unplugged), set `WATERING_ENABLED=0` in `pi/.env`.

### Checking it all works

1. `./garden.sh logs reader` on the Pi shows a line like `soil=312.0 (OK) light=540.0 (DIM)` about every 10 seconds.
2. The dashboard shows live readings and the camera.
3. Ask the plant in the chat to water itself. The servo should pour within about 20 seconds.

## Troubleshooting

| Problem | Fix |
|---|---|
| Upload fails or "port busy" | Close the Serial Monitor and run `./garden.sh stop` on the Pi; only one program can use the port. |
| `reader.py` keeps saying it can't open the port | Check `SERIAL_PORT`. Add the Pi user to the serial group: `sudo usermod -aG dialout $USER`, then log out and back in. |
| Dashboard says "Almost there: add your Clerk key" | Set `VITE_CLERK_PUBLISHABLE_KEY` in `frontend/.env` and restart `npm run dev`. |
| Dashboard errors about Tiger Data | Set `TIGER_DATABASE_URL` in `backend/.env` and restart the backend. |
| Pi uploads fail with 401 | `API_KEY` differs between `pi/.env` and `backend/.env`. |
| Pi uploads fail to connect | `API_URL` in `pi/.env` points at `localhost` or the wrong IP, or the backend wasn't started with `--host 0.0.0.0`. |
| No data on the dashboard | The Device ID on the dashboard doesn't match `PLANT_ID` in `pi/.env`. |
| `temp=ERR` in the readings | The DHT11 isn't connected to D3, or is loose. |
| The agent says "watering is turned off" | Set `WATERING_ENABLED=1` in `pi/.env` and restart the Pi scripts. |

## Arduino data format

One line every 2 seconds at **9600 baud**:

```
soil=310,light=759,temp=22.5,humidity=48,status=OK,lightStatus=BRIGHT,waterCount=0
```

| Field | Values | Meaning |
|---|---|---|
| `soil` | 0–1023 | Raw soil moisture, higher is wetter |
| `light` | 0–1023 | Raw light reading |
| `temp` | °C or `ERR` | Temperature from the DHT11 |
| `humidity` | % or `ERR` | Humidity from the DHT11 |
| `status` | `DRY`, `OK`, `WET` | Soil condition |
| `lightStatus` | `DARK`, `DIM`, `BRIGHT` | Light condition |
| `waterCount` | 0+ | Pours since the Arduino started |

**Command:** send `WATER` followed by a newline and the servo tilts slowly, holds for 1.5 seconds, and returns. Change `POUR_ANGLE`, `POUR_TIME_MS` and `STEP_DELAY` at the top of the `.ino` to change how much and how fast it pours.

## Calibration

These thresholds were measured with our sensors and soil. If your readings differ, change them in **all three** places: the top of `plant_monitor.ino`, `pi/.env` and `backend/.env`.

**Soil moisture**

| Reading | Status |
|---|---|
| Below 150 | `DRY`, needs water |
| 150–450 | `OK`, healthy |
| Above 450 | `WET`, too much water |

Our measurements: dry soil read about 0, and drenched soil read 450–600.

**Light**

| Reading | Status |
|---|---|
| Below 200 | `DARK` |
| 200–600 | `DIM` |
| Above 600 | `BRIGHT` |

The light sensor measures relative brightness, not true sunlight units, and tops out around 760.

## Safety

- Only the soil sensor's prongs go in the soil. Keep the board, Pi and electronics away from the water container.
- Unplug the USB cable before changing any wiring.
- Place the Arduino on a non-conductive surface such as cardboard.
- Remove the soil sensor from wet soil when not testing to reduce corrosion.

## Project structure

```
hack-knight/
├── Readme.md
├── plant_monitor/
│   └── plant_monitor.ino    # Arduino: sensors and water servo
├── pi/                      # Raspberry Pi: reader.py, uploader.py, camera.py, garden.sh
├── backend/                 # FastAPI server, AI agent (agent.py), voice (tts.py)
└── frontend/                # React dashboard (Vite)
```

## Roadmap

- [x] Soil moisture and light readings
- [x] DRY / OK / WET and DARK / DIM / BRIGHT status labels
- [x] Web dashboard with live readings and history graphs
- [x] Weather check that skips watering when rain is forecast
- [x] "Water saved" counter
- [x] Watering with a servo, controlled by the AI agent
- [x] Live camera and hourly plant photos
- [x] Talking plant: chat and voice
- [ ] Temperature and humidity on the dashboard (the Arduino sends them; the Pi doesn't store them yet)
- [ ] Plant status face on the Arduino's LED matrix
- [ ] Photo timelapse
- [ ] NFC tag on the pot that opens the dashboard

## Team

Built at Hack Knight 2026.

- **Group A (hardware):** Arduino, sensors and servo
- **Group B (software):** Pi scripts, backend, AI agent and dashboard
