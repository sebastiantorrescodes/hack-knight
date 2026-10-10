import { DRY_LIMIT, LEAFY_FULL, LIGHT_FULL, SOIL_FULL, WET_LIMIT, clamp01, sunLabel, waterLabel } from "../plant";

function WaterCup({ soil }) {
  const fill = soil == null ? 0 : clamp01(soil / SOIL_FULL);
  const top = 20, bottom = 110, height = bottom - top;
  const lineY = (v) => bottom - (v / SOIL_FULL) * height;
  return (
    <svg viewBox="0 0 100 120" className="meter-art" aria-hidden="true">
      <defs>
        <clipPath id="cup">
          <path d="M18 20 L82 20 L74 110 L26 110 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#cup)">
        <rect x="0" y="0" width="100" height="120" fill="#e3f2fd" />
        <rect className="water" x="0" y={bottom - fill * height} width="100" height={fill * height} fill="#42a5f5" />
      </g>
      <line x1="14" x2="86" y1={lineY(DRY_LIMIT)} y2={lineY(DRY_LIMIT)} stroke="#ef6c00" strokeDasharray="4 3" strokeWidth="2" />
      <line x1="14" x2="86" y1={lineY(WET_LIMIT)} y2={lineY(WET_LIMIT)} stroke="#1565c0" strokeDasharray="4 3" strokeWidth="2" />
      <path d="M18 20 L82 20 L74 110 L26 110 Z" fill="none" stroke="#546e7a" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

function Sun({ light }) {
  const level = light == null ? 0 : clamp01(light / LIGHT_FULL);
  return (
    <svg viewBox="0 0 100 120" className="meter-art" aria-hidden="true">
      <g style={{ opacity: 0.25 + level * 0.75 }} transform="translate(50 60)">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="0" y1={-30 - level * 8} x2="0" y2={-42 - level * 10} stroke="#ffb300" strokeWidth="6"
            strokeLinecap="round" transform={`rotate(${i * 45})`} />
        ))}
        <circle r={20 + level * 6} fill="#ffca28" />
      </g>
    </svg>
  );
}

function Leaves({ greenPct }) {
  const count = greenPct == null ? 0 : Math.round(clamp01(greenPct / LEAFY_FULL) * 5);
  return (
    <div className="meter-art leaf-row" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? "leaf on" : "leaf"}>🍃</span>
      ))}
    </div>
  );
}

function Meter({ title, label, onClick, children }) {
  return (
    <button className="card meter" onClick={onClick}>
      <span className="meter-title">{title}</span>
      {children}
      <span className="meter-label">{label}</span>
      <span className="meter-hint">Tap to learn!</span>
    </button>
  );
}

/** The three kid-friendly gauges. Tapping one asks the plant to explain it. */
export default function Meters({ status, onExplain }) {
  const r = status?.latest_reading;
  const photo = status?.latest_photo;
  return (
    <section className="meters">
      <Meter title="💧 Water" label={waterLabel(r)} onClick={() => onExplain("water")}>
        <WaterCup soil={r?.soil} />
      </Meter>
      <Meter title="☀️ Sunshine" label={sunLabel(r)} onClick={() => onExplain("sun")}>
        <Sun light={r?.light} />
      </Meter>
      <Meter title="🌿 Leafiness" label={photo ? `${Math.round(photo.green_pct ?? 0)}% green` : "?"} onClick={() => onExplain("leaf")}>
        <Leaves greenPct={photo?.green_pct} />
      </Meter>
    </section>
  );
}
