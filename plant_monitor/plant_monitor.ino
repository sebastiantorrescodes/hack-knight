const int SOIL_PIN = A0;
const int LIGHT_PIN = A1;

// Soil limits
const int DRY_LIMIT = 150;   // below this = needs water
const int WET_LIMIT = 450;   // above this = too wet

// Light limits
const int DARK_LIMIT = 200;   // below this = dark
const int BRIGHT_LIMIT = 600; // above this = bright

void setup() {
  Serial.begin(9600);
}

void loop() {
  int soil = analogRead(SOIL_PIN);
  int light = analogRead(LIGHT_PIN);

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
  Serial.print(",status=");
  Serial.print(status);
  Serial.print(",lightStatus=");
  Serial.println(lightStatus);

  delay(2000);
}