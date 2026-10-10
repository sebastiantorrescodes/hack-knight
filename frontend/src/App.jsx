import { useEffect, useState } from "react";
import { getStatus } from "./api";
import usePoll from "./usePoll";
import { explain, getMood } from "./plant";
import PlantFace from "./components/PlantFace";
import Meters from "./components/Meters";
import PlantCam from "./components/PlantCam";
import Analytics from "./analytics/Analytics";

const EXPLAIN_MS = 12000;
const TABS = [
  { key: "plant", label: "🌱 Plant" },
  { key: "data", label: "📊 Garden data" },
];

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

const tabFromHash = () => (window.location.hash === "#data" ? "data" : "plant");

function PlantView({ name, status, error }) {
  const mood = getMood(status, error);
  const [explanation, setExplanation] = useState(null);

  useEffect(() => {
    if (!explanation) return;
    const id = setTimeout(() => setExplanation(null), EXPLAIN_MS);
    return () => clearTimeout(id);
  }, [explanation]);

  return (
    <>
      <main className="stage">
        <section className="card plant">
          <div className="bubble" aria-live="polite">{explanation || mood.line}</div>
          <PlantFace mood={mood.key} />
        </section>
        <PlantCam name={name} />
      </main>
      <Meters status={status} onExplain={(m) => setExplanation(explain(m, status))} />
    </>
  );
}

export default function App() {
  const { data: status, error } = usePoll(getStatus, 5000);
  const [name, setName] = useState(loadName);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const rename = (e) => {
    e.preventDefault();
    const next = e.target.elements.name.value.trim().slice(0, 20) || "Sprout";
    setName(next);
    saveName(next);
    setEditing(false);
  };

  const saved = status?.skipped_waterings ?? 0;

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

      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t.key} href={`#${t.key}`} className={tab === t.key ? "active" : ""} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>

      {tab === "data" ? <Analytics /> : <PlantView name={name} status={status} error={error} />}
    </div>
  );
}
