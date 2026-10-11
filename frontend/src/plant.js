// Kid-friendly meaning of the sensor values. Thresholds match plant_monitor.ino.
export const DRY_LIMIT = 150;
export const WET_LIMIT = 450;
export const DARK_LIMIT = 200;
export const BRIGHT_LIMIT = 600;
export const SOIL_FULL = 600; // drenched soil reads about 450-600
export const LIGHT_FULL = 760; // the light sensor tops out around here
export const LEAFY_FULL = 40; // green_pct when the plant fills much of the photo

const STALE_MS = 10 * 60 * 1000;

/** Pick the plant's mood from /status. `error` is set when the backend can't be reached. */
export function getMood(status, error) {
  if (error && !status) {
    return { key: "offline", line: "I can't reach my brain right now. Is the server running?" };
  }
  const reading = status?.latest_reading;
  if (!reading || Date.now() - new Date(reading.ts).getTime() > STALE_MS) {
    return { key: "offline", line: "I can't feel my roots right now. Is my sensor plugged in?" };
  }
  if (reading.status === "DRY") return { key: "thirsty", line: "I'm sooo thirsty… my soil is really dry!" };
  if (reading.status === "WET") return { key: "soggy", line: "Too much water! My roots need air to breathe." };
  if (reading.light_status === "DARK") return { key: "sleepy", line: "It's dark… plants rest when there's no light. Zzz." };
  if (reading.light_status === "BRIGHT") return { key: "happy", line: "Sunshine! I'm making food from light!" };
  return { key: "okay", line: "I'm doing fine! A little more sun would be nice." };
}

/** What the plant says when a kid taps one of the meters. */
export function explain(meter, status) {
  const r = status?.latest_reading;
  if (meter === "water") {
    const now =
      !r ? "I can't tell how wet my soil is right now."
      : r.status === "DRY" ? "Right now my soil is dry, so I'm thirsty!"
      : r.status === "WET" ? "Right now my soil is soaking wet. Too much water can make my roots sick!"
      : "Right now my soil is just right, not too dry and not too wet.";
    return `I drink water through my roots, deep down in the soil. ${now}`;
  }
  if (meter === "sun") {
    const now =
      !r ? "I can't tell how bright it is right now."
      : r.light_status === "BRIGHT" ? "It's super sunny, so I'm making lots of food!"
      : r.light_status === "DIM" ? "There's a little light, so I'm making a little food."
      : "It's dark, so I'm resting.";
    return `I make my own food from sunlight. That's called photosynthesis! ${now}`;
  }
  if (meter === "temp") {
    const t = r?.temp != null && r.temp !== "ERR" ? parseFloat(r.temp) : null;
    const now =
      t == null ? "I can't read the temperature right now."
      : t < 10 ? `It's ${t.toFixed(1)}°C — pretty chilly for me!`
      : t < 28 ? `It's ${t.toFixed(1)}°C — that feels nice and cosy.`
      : `It's ${t.toFixed(1)}°C — a bit hot for me!`;
    return `Plants grow best between 15–28°C. ${now}`;
  }
  if (meter === "humidity") {
    const h = r?.humidity != null && r.humidity !== "ERR" ? parseFloat(r.humidity) : null;
    const now =
      h == null ? "I can't read the humidity right now."
      : h < 30 ? `It's ${Math.round(h)}% — the air is pretty dry.`
      : h < 60 ? `It's ${Math.round(h)}% — perfect moisture for me!`
      : `It's ${Math.round(h)}% — the air is very humid.`;
    return `Humidity is how much water is in the air. I like it between 40–60%. ${now}`;
  }
  return "My leaves are green because of chlorophyll. It catches sunlight like a tiny solar panel!";
}

export const waterLabel = (r) => (!r ? "?" : r.status === "DRY" ? "Thirsty" : r.status === "WET" ? "Too much" : "Just right");
export const sunLabel = (r) => (!r ? "?" : r.light_status === "BRIGHT" ? "Super sunny" : r.light_status === "DIM" ? "A little light" : "Dark");
export const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const tempLabel = (r) => {
  if (!r || r.temp == null || r.temp === "ERR") return "?";
  const t = parseFloat(r.temp);
  if (isNaN(t)) return "?";
  if (t < 10) return `${t.toFixed(1)}°C — Chilly`;
  if (t < 18) return `${t.toFixed(1)}°C — Cool`;
  if (t < 28) return `${t.toFixed(1)}°C — Comfy`;
  if (t < 35) return `${t.toFixed(1)}°C — Warm`;
  return `${t.toFixed(1)}°C — Hot!`;
};

export const humidityLabel = (r) => {
  if (!r || r.humidity == null || r.humidity === "ERR") return "?";
  const h = parseFloat(r.humidity);
  if (isNaN(h)) return "?";
  if (h < 30) return `${Math.round(h)}% — Dry air`;
  if (h < 60) return `${Math.round(h)}% — Just right`;
  return `${Math.round(h)}% — Humid`;
};
