import { useEffect, useState } from "react";
import { getStatus } from "./api";
import usePoll from "./usePoll";
import { explain, getMood } from "./plant";
import PlantFace from "./components/PlantFace";
import Meters from "./components/Meters";
import PlantCam from "./components/PlantCam";

const EXPLAIN_MS = 12000;

function loadName() {
  try {
    return localStorage.getItem("plantName") || "Sprout";
  } catch {
    return "Sprout";
  }
}

function saveName(name) {
  try {
    localStorage.setItem("plantName", name);
  } catch {
    // private mode etc.: the name just won't be remembered
  }
}

export default function App() {
  const { data: status, error } = usePoll(getStatus, 5000);
  const mood = getMood(status, error);
  const [name, setName] = useState(loadName);
  const [editing, setEditing] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [grownUps, setGrownUps] = useState(false);

  useEffect(() => {
    if (!explanation) return;
    const id = setTimeout(() => setExplanation(null), EXPLAIN_MS);
    return () => clearTimeout(id);
  }, [explanation]);

  const rename = (e) => {
    e.preventDefault();
    const next = e.target.elements.name.value.trim().slice(0, 20) || "Sprout";
    setName(next);
    saveName(next);
    setEditing(false);
  };

  const saved = status?.skipped_waterings ?? 0;
  const r = status?.latest_reading;

  return (
    <div className="app">
      <header className="top">
        {editing ? (
          <form onSubmit={rename} className="rename">
            <input name="name" defaultValue={name} autoFocus maxLength={20} aria-label="Plant name" />
            <button type="submit">Save</button>
          </form>
        ) : (
          <h1>
            🌱 Meet {name}!
            <button className="edit" onClick={() => setEditing(true)} aria-label="Rename the plant">✏️</button>
          </h1>
        )}
        <div className="saved-pill" title="Times we waited for rain instead of watering">
          🌧️ Saved <strong>{saved}</strong> {saved === 1 ? "cup" : "cups"} of water
        </div>
      </header>

      <main className="stage">
        <section className="card plant">
          <div className="bubble" aria-live="polite">{explanation || mood.line}</div>
          <PlantFace mood={mood.key} />
        </section>
        <PlantCam name={name} />
      </main>

      <Meters status={status} onExplain={(m) => setExplanation(explain(m, status))} />

      <footer className="grown-ups">
        <button className="link" onClick={() => setGrownUps((g) => !g)}>
          {grownUps ? "Hide" : "Show"} grown-up details
        </button>
        {grownUps && (
          <dl className="details">
            <dt>Soil (0-1023)</dt><dd>{r ? `${r.soil} (${r.status})` : "no data"}</dd>
            <dt>Light (0-1023)</dt><dd>{r ? `${r.light} (${r.light_status})` : "no data"}</dd>
            <dt>Last reading</dt><dd>{r ? new Date(r.ts).toLocaleString() : "never"}</dd>
            <dt>Pending commands</dt><dd>{status?.pending_commands ?? "?"}</dd>
            <dt>Backend</dt><dd>{error ? `unreachable (${error.message})` : "connected"}</dd>
          </dl>
        )}
      </footer>
    </div>
  );
}
