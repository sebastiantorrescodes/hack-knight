import { getToken } from "@clerk/react";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function request(path, { method = "GET", body, signal } = {}) {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail).catch(() => null);
    const message = typeof detail === "string" ? detail : `${path.split("?")[0]} returned ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json();
}

const get = (path) => request(path);
export const post = (path, body, signal) => request(path, { method: "POST", body, signal });

/** A URL for <img>/<audio>, which can't send headers: the short-lived session token goes in the query. */
export async function signedUrl(path) {
  const token = await getToken();
  const sep = path.includes("?") ? "&" : "?";
  return `${API_URL}${path}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}

// The signed-in person and their plants
export const getMe = () => get("/me");
export const saveProfile = (profile) => request("/me/profile", { method: "PUT", body: profile });
export const claimPlant = (plant) => post("/plants", plant);
export const updatePlant = (id, fields) => request(`/plants/${encodeURIComponent(id)}`, { method: "PATCH", body: fields });
export const searchPlaces = (q) => get(`/geocode?${new URLSearchParams({ q })}`);
export const getHealth = () => get("/health");

/** Calls for one plant. Create once per plant id (see PlantContext) so usePoll gets stable functions. */
export function plantApi(plantId) {
  const q = (params) => new URLSearchParams({ plant_id: plantId, ...params }).toString();
  return {
    getStatus: () => get(`/status?${q()}`),
    getStreamStatus: () => get(`/stream/status?${q()}`),
    streamUrl: () => signedUrl(`/stream?${q()}`),
    getHistory: (hours, bucket) => get(`/readings/history?${q({ hours, bucket })}`),
    getCommands: () => get(`/commands?${q({ limit: 500 })}`),
    getPhotos: () => get(`/photos?${q({ limit: 500 })}`),
    getAgentRuns: () => get(`/agent/runs?${q({ limit: 20 })}`),
    getEvents: () => get(`/agent/events?${q({ limit: 100 })}`),
  };
}
