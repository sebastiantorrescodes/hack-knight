import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DARK_LIMIT, BRIGHT_LIMIT, DRY_LIMIT, WET_LIMIT } from "../plant";
import { formatNumber, formatTime, tickFormatter } from "./ranges";

// Chart tokens, defined in styles.css so they follow light/dark mode. Text never uses the series hues.
export const C = {
  soil: "var(--chart-soil)",
  light: "var(--chart-light)",
  leaf: "var(--chart-leaf)",
  surface: "var(--chart-surface)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  muted: "var(--chart-muted)",
  ink2: "var(--muted-foreground)",
};

const HEIGHT = 260; // includes the x-axis band
const axisProps = {
  stroke: C.axis,
  tick: { fill: C.muted, fontSize: 12 },
  tickLine: false,
};

const TICK_COUNT = 5;

function timeAxis(range, now) {
  const start = now - range.hours * 3600e3;
  // Explicit, evenly spaced ticks so every chart shares the same time axis however sparse its data is
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => start + ((now - start) * i) / (TICK_COUNT - 1));
  return (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={[start, now]}
      ticks={ticks}
      tickFormatter={tickFormatter(range)}
      minTickGap={48}
      {...axisProps}
    />
  );
}

function threshold(y, label) {
  return (
    <ReferenceLine
      y={y}
      stroke={C.axis}
      strokeWidth={1}
      label={{ value: label, position: "insideTopLeft", fill: C.muted, fontSize: 11 }}
    />
  );
}

/** Hover card: time, then one row per value with a swatch for identity; text stays in ink. */
function Tip({ active, payload, label, rows }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-strong min-w-40 rounded-xl px-3 py-2 text-[13px]">
      <div className="mb-1 text-muted-foreground">{formatTime(label)}</div>
      {rows(point).map((r) => (
        <div key={r.name} className="flex items-center gap-1.5">
          {r.color && <span className="size-2.5 flex-none rounded-[3px]" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const crosshair = { stroke: C.axis, strokeWidth: 1 };
const endDot = (color) => ({ r: 5, fill: color, stroke: C.surface, strokeWidth: 2 });

export function SoilChart({ points, waterings, range, now }) {
  const max = Math.max(600, ...points.map((p) => p.soilRange?.[1] ?? 0));
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={points} margin={{ top: 16, right: 32, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        {timeAxis(range, now)}
        <YAxis domain={[0, Math.ceil(max / 100) * 100]} width={44} {...axisProps} />
        {threshold(DRY_LIMIT, `Dry below ${DRY_LIMIT}`)}
        {threshold(WET_LIMIT, `Too wet above ${WET_LIMIT}`)}
        {waterings.map((w) => (
          <ReferenceLine
            key={w.id}
            x={w.t}
            stroke={C.ink2}
            strokeWidth={1}
            label={{ value: "💧", position: "top", fontSize: 14 }}
          />
        ))}
        <Area
          dataKey="soilRange"
          stroke="none"
          fill={C.soil}
          fillOpacity={0.14}
          isAnimationActive={false}
          activeDot={false}
        />
        <Line
          dataKey="soil"
          stroke={C.soil}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={endDot(C.soil)}
          isAnimationActive={false}
        />
        <Tooltip
          cursor={crosshair}
          content={
            <Tip
              rows={(p) =>
                p.soil == null
                  ? [{ name: "No readings", value: "" }]
                  : [
                      { name: "Average", value: formatNumber(p.soil, 1), color: C.soil },
                      { name: "Range", value: `${formatNumber(p.soilRange[0])}–${formatNumber(p.soilRange[1])}` },
                      { name: "Readings", value: p.count },
                    ]
              }
            />
          }
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function LightChart({ points, range, now }) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={points} margin={{ top: 16, right: 32, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        {timeAxis(range, now)}
        <YAxis domain={[0, 800]} ticks={[0, 200, 400, 600, 800]} width={44} {...axisProps} />
        {threshold(DARK_LIMIT, `Dark below ${DARK_LIMIT}`)}
        {threshold(BRIGHT_LIMIT, `Bright above ${BRIGHT_LIMIT}`)}
        <Area
          dataKey="light"
          stroke={C.light}
          strokeWidth={2}
          fill={C.light}
          fillOpacity={0.14}
          dot={false}
          activeDot={endDot(C.light)}
          isAnimationActive={false}
        />
        <Tooltip
          cursor={crosshair}
          content={
            <Tip
              rows={(p) =>
                p.light == null
                  ? [{ name: "No readings", value: "" }]
                  : [{ name: "Average light", value: formatNumber(p.light, 1), color: C.light }]
              }
            />
          }
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function LeafChart({ points, range, now }) {
  const max = Math.max(40, ...points.map((p) => p.green));
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={points} margin={{ top: 16, right: 32, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        {timeAxis(range, now)}
        <YAxis domain={[0, Math.ceil(max / 10) * 10]} unit="%" width={48} {...axisProps} />
        <Line
          dataKey="green"
          stroke={C.leaf}
          strokeWidth={2}
          dot={{ r: 4, fill: C.leaf, stroke: C.surface, strokeWidth: 2 }}
          activeDot={endDot(C.leaf)}
          isAnimationActive={false}
        />
        <Tooltip
          cursor={crosshair}
          content={
            <Tip
              rows={(p) => [
                { name: "Green", value: `${formatNumber(p.green, 1)}%`, color: C.leaf },
                { name: "Brightness", value: formatNumber(p.brightness) },
              ]}
            />
          }
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
