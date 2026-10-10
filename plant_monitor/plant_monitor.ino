#include <Servo.h>
#include <DHT.h>

const int SOIL_PIN = A0;
const int LIGHT_PIN = A1;
const int SERVO_PIN = 2;
const int DHT_PIN = 3;

DHT dht(DHT_PIN, DHT11);

// Soil limits
const int DRY_LIMIT = 150;
const int WET_LIMIT = 450;

// Light limits
const int DARK_LIMIT = 200;
const int BRIGHT_LIMIT = 600;

// Servo positions (adjust after testing)
const int REST_ANGLE = 0;
const int POUR_ANGLE = 45;
const int STEP_SIZE = 5;     // degrees per step
const int STEP_DELAY = 40;   // ms between steps (higher = slower)

// Timing
const unsigned long DRY_WAIT_MS = 60000;    // soil must stay dry for 1 minute
const unsigned long POUR_TIME_MS = 1500;    // hold the tilt while water pours
const unsigned long COOLDOWN_MS = 60000;    // wait 1 minute between pours

// Water supply
const int POURS_PER_FILL = 3;

Servo waterServo;
unsigned long dryStart = 0;
unsigned long lastWatered = 0;
bool hasWatered = false;
bool skipWatering = false;
int waterCount = 0;
int poursLeft = POURS_PER_FILL;

void moveSlowly(int from, int to) {
  if (from < to) {
    for (int a = from; a <= to; a += STEP_SIZE) {
      waterServo.write(a);
      delay(STEP_DELAY);
    }
  } else {
    for (int a = from; a >= to; a -= STEP_SIZE) {
      waterServo.write(a);
      delay(STEP_DELAY);
    }
  }
  waterServo.write(to);
}

void waterPlant() {
  if (poursLeft <= 0) return;

  moveSlowly(REST_ANGLE, POUR_ANGLE);
  delay(POUR_TIME_MS);
  moveSlowly(POUR_ANGLE, REST_ANGLE);

  lastWatered = millis();
  hasWatered = true;
  dryStart = 0;
  waterCount++;
  poursLeft--;
}

void setup() {
  Serial.begin(9600);
  dht.begin();
  waterServo.attach(SERVO_PIN);
  waterServo.write(REST_ANGLE);
}

void loop() {
  // Commands from the Pi or Serial Monitor
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "WATER") {
      waterPlant();
    } else if (cmd == "SKIP") {
      skipWatering = true;
    } else if (cmd == "RESUME") {
      skipWatering = false;
    } else if (cmd == "REFILLED") {
      poursLeft = POURS_PER_FILL;
    }
  }

  int soil = analogRead(SOIL_PIN);
  int light = analogRead(LIGHT_PIN);
  float temp = dht.readTemperature();   // Celsius
  float humidity = dht.readHumidity();

  // Soil status
  String status;
  if (soil < DRY_LIMIT) {
    status = "DRY";
  } else if (soil > WET_LIMIT) {
    status = "WET";
  } else {
    status = "OK";
  }

  // Light status
  String lightStatus;
  if (light < DARK_LIMIT) {
    lightStatus = "DARK";
  } else if (light < BRIGHT_LIMIT) {
    lightStatus = "DIM";
  } else {
    lightStatus = "BRIGHT";
  }

  // Auto watering: only after soil has been dry for DRY_WAIT_MS
  unsigned long now = millis();
  if (status == "DRY") {
    if (dryStart == 0) {
      dryStart = now;
    }
    bool dryLongEnough = (now - dryStart >= DRY_WAIT_MS);
    bool cooledDown = !hasWatered || (now - lastWatered >= COOLDOWN_MS);
    if (dryLongEnough && cooledDown && !skipWatering) {
      waterPlant();
    }
  } else {
    dryStart = 0;   // soil is no longer dry, restart the timer
  }

  // Format agreed with Group B
  Serial.print("soil=");
  Serial.print(soil);
  Serial.print(",light=");
  Serial.print(light);
  Serial.print(",temp=");
  if (isnan(temp)) Serial.print("ERR"); else Serial.print(temp, 1);
  Serial.print(",humidity=");
  if (isnan(humidity)) Serial.print("ERR"); else Serial.print(humidity, 0);
  Serial.print(",status=");
  Serial.print(status);
  Serial.print(",lightStatus=");
  Serial.print(lightStatus);
  Serial.print(",waterCount=");
  Serial.print(waterCount);
  Serial.print(",skip=");
  Serial.print(skipWatering ? "YES" : "NO");
  Serial.print(",refill=");
  Serial.println(poursLeft <= 0 ? "YES" : "NO");

  delay(2000);
}