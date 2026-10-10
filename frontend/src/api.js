export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const PLANT_ID = import.meta.env.VITE_PLANT_ID || "plant-1";

async function get(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

export const getStatus = () => get(`/status?plant_id=${PLANT_ID}`);
export const getStreamStatus = () => get(`/stream/status?plant_id=${PLANT_ID}`);
export const streamUrl = () => `${API_URL}/stream?plant_id=${PLANT_ID}`;
