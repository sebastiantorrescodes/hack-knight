import { ChevronRight, Droplet, Droplets, Leaf, Sun as SunIcon, Thermometer } from "lucide-react";
import { DRY_LIMIT, LEAFY_FULL, LIGHT_FULL, SOIL_FULL, WET_LIMIT, clamp01, humidityLabel, sunLabel, tempLabel, waterLabel } from "../plant";
import { cn } from "@/lib/utils";

function WaterCup({ soil }) {
  const fill = soil == null ? 0 : clamp01(soil / SOIL_FULL);
  const top = 20, bottom = 110, height = bottom - top;
  const lineY = (v) => bottom - (v / SOIL_FULL) * height;
  return (
    <svg viewBox="0 0 100 120" className="h-28 w-24" aria-hidden="true">
      <defs>
        <clipPath id="cup">
          <path d="M18 20 L82 20 L74 110 L26 110 Z" />
        </clipPath>
        <linearGradient id="water-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5ac8fa" />
          <stop offset="1" stopColor="var(--ios-blue)" />
        </linearGradient>
      </defs>
      <g clipPath="url(#cup)">
        <rect x="0" y="0" width="100" height="120" fill="var(--ios-blue)" opacity="0.08" />
        <rect className="water" x="0" y={bottom - fill * height} width="100" height={fill * height} fill="url(#water-fill)" />
      </g>
      <line x1="14" x2="86" y1={lineY(DRY_LIMIT)} y2={lineY(DRY_LIMIT)} stroke="var(--ios-orange)" strokeDasharray="4 3" strokeWidth="2" />
      <line x1="14" x2="86" y1={lineY(WET_LIMIT)} y2={lineY(WET_LIMIT)} stroke="var(--ios-blue)" strokeDasharray="4 3" strokeWidth="2" />
      <path d="M18 20 L82 20 L74 110 L26 110 Z" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function Sun({ light }) {
  const level = light == null ? 0 : clamp01(light / LIGHT_FULL);
  return (
    <svg viewBox="0 0 100 120" className="h-28 w-24" aria-hidden="true">
      <defs>
        <radialGradient id="sun-fill">
          <stop offset="0" stopColor="#ffd60a" />
          <stop offset="1" stopColor="var(--ios-orange)" />
        </radialGradient>
      </defs>
      <g style={{ opacity: 0.25 + level * 0.75 }} transform="translate(50 60)">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1="0" y1={-30 - level * 8} x2="0" y2={-42 - level * 10} stroke="#ffcc00" strokeWidth="6"
            strokeLinecap="round" transform={`rotate(${i * 45})`} />
        ))}
        <circle r={20 + level * 6} fill="url(#sun-fill)" />
      </g>
    </svg>
  );
}

function Leaves({ greenPct }) {
  const count = greenPct == null ? 0 : Math.round(clamp01(greenPct / LEAFY_FULL) * 5);
  return (
    <div className="flex h-28 items-center justify-center gap-1" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Leaf
          key={i}
          className={cn("size-7 transition-colors", i < count ? "fill-ios-green/80 text-ios-green" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

/** Thermometer gauge: bulb + tube fill from 0°C (bottom) to 50°C (top). */
function TempGauge({ temp }) {
  const raw = temp != null && temp !== "ERR" ? parseFloat(temp) : null;
  const fill = raw == null ? 0 : clamp01(raw / 50);
  const tubeTop = 20, tubeBtm = 88, tubeH = tubeBtm - tubeTop;
  const fillY = tubeBtm - fill * tubeH;
  return (
    <svg viewBox="0 0 100 120" className="h-28 w-24" aria-hidden="true">
      <defs>
        <linearGradient id="therm-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff9f0a" />
          <stop offset="1" stopColor="#ff3b30" />
        </linearGradient>
        <clipPath id="therm-clip">
          <rect x="40" y={tubeTop} width="20" height={tubeH} rx="10" />
        </clipPath>
      </defs>
      {/* tube background */}
      <rect x="40" y={tubeTop} width="20" height={tubeH} rx="10" fill="currentColor" opacity="0.1" />
      {/* fill */}
      <rect x="40" y={fillY} width="20" height={tubeBtm - fillY} rx="10" fill="url(#therm-fill)" clipPath="url(#therm-clip)" />
      {/* bulb */}
      <circle cx="50" cy="98" r="12" fill="url(#therm-fill)" />
      {/* outline */}
      <rect x="40" y={tubeTop} width="20" height={tubeH} rx="10" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      {/* tick marks */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1="60" x2="67" y1={tubeBtm - t * tubeH} y2={tubeBtm - t * tubeH}
          stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
      ))}
      {raw != null && (
        <text x="50" y="15" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7" fontWeight="600">
          {raw.toFixed(1)}°C
        </text>
      )}
    </svg>
  );
}

/** Droplet gauge: water drop that fills based on humidity 0–100 %. */
function HumidityGauge({ humidity }) {
  const raw = humidity != null && humidity !== "ERR" ? parseFloat(humidity) : null;
  const fill = raw == null ? 0 : clamp01(raw / 100);
  // The drop clip path
  const dropPath = "M50 15 C50 15 22 52 22 70 A28 28 0 0 0 78 70 C78 52 50 15 50 15 Z";
  return (
    <svg viewBox="0 0 100 120" className="h-28 w-24" aria-hidden="true">
      <defs>
        <linearGradient id="hum-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5ac8fa" />
          <stop offset="1" stopColor="var(--ios-blue)" />
        </linearGradient>
        <clipPath id="drop-clip">
          <path d={dropPath} />
        </clipPath>
      </defs>
      {/* drop background */}
      <path d={dropPath} fill="currentColor" opacity="0.1" />
      {/* fill — clip to drop shape */}
      <rect x="22" y={98 - fill * 76} width="56" height={fill * 76} fill="url(#hum-fill)" clipPath="url(#drop-clip)" />
      {/* outline */}
      <path d={dropPath} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      {raw != null && (
        <text x="50" y="75" textAnchor="middle" fontSize="14" fill="white" fontWeight="700">
          {Math.round(raw)}%
        </text>
      )}
    </svg>
  );
}

function Meter({ title, icon: Icon, iconClass, label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="glass group flex flex-col gap-2 rounded-3xl p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <span className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span className={cn("flex size-8 items-center justify-center rounded-[10px] text-white shadow-sm", iconClass)}>
          <Icon className="size-[18px]" />
        </span>
        {title}
      </span>
      <span className="flex justify-center">{children}</span>
      <span className="font-rounded text-2xl font-extrabold tracking-tight">{label}</span>
      <span className="flex items-center text-sm text-muted-foreground group-hover:text-foreground">
        Tap to learn <ChevronRight className="size-4" />
      </span>
    </button>
  );
}

/** The five kid-friendly gauges. Tapping one asks the plant to explain it. */
export default function Meters({ status, onExplain }) {
  const r = status?.latest_reading;
  const photo = status?.latest_photo;
  return (
    <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Meter title="Water" icon={Droplet} iconClass="bg-ios-blue" label={waterLabel(r)} onClick={() => onExplain("water")}>
        <WaterCup soil={r?.soil} />
      </Meter>
      <Meter title="Sunshine" icon={SunIcon} iconClass="bg-ios-orange" label={sunLabel(r)} onClick={() => onExplain("sun")}>
        <Sun light={r?.light} />
      </Meter>
      <Meter title="Temperature" icon={Thermometer} iconClass="bg-ios-red" label={tempLabel(r)} onClick={() => onExplain("temp")}>
        <TempGauge temp={r?.temp} />
      </Meter>
      <Meter title="Humidity" icon={Droplets} iconClass="bg-ios-teal" label={humidityLabel(r)} onClick={() => onExplain("humidity")}>
        <HumidityGauge humidity={r?.humidity} />
      </Meter>
      <Meter
        title="Leafiness"
        icon={Leaf}
        iconClass="bg-ios-green"
        label={photo ? `${Math.round(photo.green_pct ?? 0)}% green` : "?"}
        onClick={() => onExplain("leaf")}
      >
        <Leaves greenPct={photo?.green_pct} />
      </Meter>
    </section>
  );
}
