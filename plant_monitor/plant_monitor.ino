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
const int REST_ANGLE = 175;
const int POUR_ANGLE = 130;
const int STEP_SIZE = 1;     // degrees per step
const int STEP_DELAY = 25;   // ms between steps (higher = slower)

// Timing
const unsigned long POUR_TIME_MS = 1500;    // hold the tilt while water pours

Servo waterServo;
int waterCount = 0;

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

// Watering is decided by the backend/AI; the Arduino only pours when told to
void waterPlant() {
  moveSlowly(REST_ANGLE, POUR_ANGLE);
  delay(POUR_TIME_MS);
  moveSlowly(POUR_ANGLE, REST_ANGLE);
  waterCount++;
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
  Serial.println(waterCount);

  delay(2000);
}
