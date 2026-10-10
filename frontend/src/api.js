export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const PLANT_ID = import.meta.env.VITE_PLANT_ID || "plant-1";

async function get(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

const q = (params) => new URLSearchParams({ plant_id: PLANT_ID, ...params }).toString();

export const getStatus = () => get(`/status?${q()}`);
export const getStreamStatus = () => get(`/stream/status?${q()}`);
export const streamUrl = () => `${API_URL}/stream?${q()}`;
export const photoUrl = (photo) => `${API_URL}${photo.url}`;

// Analytics
export const getHealth = () => get("/health");
export const getHistory = (hours, bucket) => get(`/readings/history?${q({ hours, bucket })}`);
export const getCommands = () => get(`/commands?${q({ limit: 500 })}`);
export const getPhotos = () => get(`/photos?${q({ limit: 500 })}`);
export const getAgentRuns = () => get(`/agent/runs?${q({ limit: 20 })}`);
export const getEvents = () => get(`/agent/events?${q({ limit: 100 })}`);
