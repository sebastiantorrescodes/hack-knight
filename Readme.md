# Smart Garden 🌱

A smart plant care system built for **Hack Knight 2026: Best Environmental Hack**.

Most people overwater or underwater their plants, and farms waste huge amounts of water on irrigation. Smart Garden monitors soil moisture and light in real time and is designed to water only when the soil actually needs it, and to skip watering when rain is forecast.

## How it works

```
Sensors → Arduino → (USB serial) → Raspberry Pi / laptop → Dashboard + weather check
```

- The **Arduino** reads the soil moisture and light sensors and labels the plant's status.
- It sends one line of data every 2 seconds over USB.
- The **Raspberry Pi** (or a laptop during development) reads that data, shows it on a web dashboard, and checks the weather forecast.

## Hardware

| Part | Purpose |
|---|---|
| Arduino UNO R4 | Reads the sensors |
| Grove Base Shield | Plug-in ports for Grove sensors |
| Grove Soil Moisture Sensor | Measures how wet the soil is |
| Grove Light Sensor | Measures relative brightness |
| Raspberry Pi 4 | Runs the dashboard, weather check, and camera |
| Logitech Webcam | Plant photos (planned) |
| USB-C cable | Powers the Arduino and carries data |

## Wiring

Set the Grove Base Shield's voltage switch to **5V** if it has one.

| Sensor | Shield port |
|---|---|
| Soil moisture | A0 |
| Light | A1 |

Always unplug the USB cable before connecting or moving sensors.

## Setup

1. Install the [Arduino IDE](https://www.arduino.cc/en/software).
2. In **Tools → Board → Boards Manager**, install **Arduino UNO R4 Boards**.
3. Open `plant_monitor/plant_monitor.ino`.
4. Connect the Arduino with the USB-C cable, then choose your board and port from the **Select Board** dropdown.
5. Click **Upload**.
6. Open the **Serial Monitor** at **9600 baud** to see live readings.

The code stays on the Arduino after uploading and runs automatically whenever the board has power.

## Data format

The Arduino sends one line every 2 seconds at **9600 baud**:

```
soil=310,light=759,status=OK,lightStatus=BRIGHT
```

| Field | Values | Meaning |
|---|---|---|
| `soil` | 0–1023 | Raw soil moisture reading |
| `light` | 0–1023 | Raw light reading |
| `status` | `DRY`, `OK`, `WET` | Soil condition |
| `lightStatus` | `DARK`, `DIM`, `BRIGHT` | Light condition |

### Reading it in Python

```python
import serial

# Raspberry Pi: usually /dev/ttyACM0. Windows: the COM port shown in the Arduino IDE.
ser = serial.Serial("/dev/ttyACM0", 9600, timeout=5)

while True:
    line = ser.readline().decode("utf-8").strip()
    if not line:
        continue
    data = dict(pair.split("=") for pair in line.split(","))
    print(data)
```

Close the Arduino IDE's Serial Monitor before running this. Only one program can use the port at a time.

## Calibration

These thresholds were measured with our sensors and soil. Adjust the constants at the top of `plant_monitor.ino` if your readings differ.

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

- Only the soil sensor's prongs go in the soil. Keep the board and electronics dry.
- Unplug the USB cable before changing any wiring.
- Place the Arduino on a non-conductive surface such as cardboard.
- Remove the soil sensor from wet soil when not testing to reduce corrosion.

## Project structure

```
smart-garden/
├── README.md
├── plant_monitor/
│   └── plant_monitor.ino    # Arduino sensor code
└── dashboard/               # Raspberry Pi dashboard (in progress)
```

## Roadmap

- [x] Soil moisture and light readings
- [x] DRY / OK / WET and DARK / DIM / BRIGHT status labels
- [ ] Web dashboard with live readings and history graphs
- [ ] Weather check that skips watering when rain is forecast
- [ ] "Water saved" counter
- [ ] Temperature, humidity, and pressure (BME280 sensor)
- [ ] Plant status face on the Arduino's LED matrix
- [ ] Automatic watering with a servo
- [ ] Plant photos and timelapse with the webcam
- [ ] NFC tag on the pot that opens the dashboard

## Team

Built at Hack Knight 2026.

- **Group A (hardware):** Arduino and sensors
- **Group B (software):** Dashboard, weather check, and camera
