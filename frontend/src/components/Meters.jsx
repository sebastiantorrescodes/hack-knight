import { ChevronRight, Droplet, Leaf, Sun as SunIcon } from "lucide-react";
import { DRY_LIMIT, LEAFY_FULL, LIGHT_FULL, SOIL_FULL, WET_LIMIT, clamp01, sunLabel, waterLabel } from "../plant";
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

/** The three kid-friendly gauges. Tapping one asks the plant to explain it. */
export default function Meters({ status, onExplain }) {
  const r = status?.latest_reading;
  const photo = status?.latest_photo;
  return (
    <section className="grid gap-5 sm:grid-cols-3">
      <Meter title="Water" icon={Droplet} iconClass="bg-ios-blue" label={waterLabel(r)} onClick={() => onExplain("water")}>
        <WaterCup soil={r?.soil} />
      </Meter>
      <Meter title="Sunshine" icon={SunIcon} iconClass="bg-ios-orange" label={sunLabel(r)} onClick={() => onExplain("sun")}>
        <Sun light={r?.light} />
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
