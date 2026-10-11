import { useCallback, useMemo, useState } from "react";
import { getHealth } from "../api";
import { usePlant } from "../PlantContext";
import usePoll from "../usePoll";
import ChartCard, { Empty, GlassCard } from "./ChartCard";
import { HumidityChart, LeafChart, LightChart, SoilChart, TempChart } from "./charts";
import { RANGES, fillBuckets, formatNumber, formatTime, inRange, timeAgo } from "./ranges";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const STATUS_BADGE = {
  DRY: { icon: "⚠", text: "Dry", tone: "warn" },
  WET: { icon: "⚠", text: "Too wet", tone: "warn" },
  OK: { icon: "✓", text: "Healthy", tone: "good" },
};

const BADGE_TONE = {
  good: "bg-ios-green/15 text-ios-green",
  warn: "bg-ios-orange/15 text-ios-orange",
};

function StatTile({ label, value, detail, badge }) {
  return (
    <div className="glass flex flex-col gap-1 rounded-[22px] px-4 py-3.5">
      <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="font-rounded text-[28px] leading-tight font-extrabold tracking-tight tabular-nums">{value}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
        {badge && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", BADGE_TONE[badge.tone])}>
            {badge.icon} {badge.text}
          </span>
        )}
        {detail}
      </div>
    </div>
  );
}

function activityRows(runs, events, commands) {
  const rows = [
    ...(runs || []).map((r) => ({
      ts: r.ts,
      kind: { check: "AI check", voice: "Voice call" }[r.trigger] ?? "AI chat",
      text: r.error ? `Error: ${r.error}` : r.reply ?? r.prompt,
      extra: r.actions.length ? `Tools: ${r.actions.map((a) => a.tool).join(", ")}` : "",
    })),
    ...(events || []).map((e) => ({
      ts: e.ts,
      kind: e.kind === "alert" ? "Alert sent" : "Skipped watering",
      text: e.message,
      extra: "",
    })),
    ...(commands || []).map((c) => ({
      ts: c.created_at,
      kind: c.type === "water" ? "Watering" : "Photo request",
      text: c.payload?.reason || (c.type === "water" ? `${c.payload?.pours ?? 1} pour(s)` : ""),
      extra: `${c.status}${c.message ? `: ${c.message}` : ""}`,
    })),
  ];
  return rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 15);
}

export default function Analytics() {
  const { api } = usePlant();
  const [range, setRange] = useState(RANGES[1]);
  const fetchHistory = useCallback(() => api.getHistory(range.hours, range.bucket), [api, range]);

  const history = usePoll(fetchHistory, 30000);
  const { data: status } = usePoll(api.getStatus, 10000);
  const { data: commands } = usePoll(api.getCommands, 30000);
  const { data: photos } = usePoll(api.getPhotos, 60000);
  const { data: runs } = usePoll(api.getAgentRuns, 30000);
  const { data: events } = usePoll(api.getEvents, 30000);
  const { data: health } = usePoll(getHealth, 60000);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [history.data, range]);
  const points = useMemo(() => fillBuckets(history.data, range, now), [history.data, range, now]);
  const withData = points.filter((p) => p.soil != null);
  const waterings = (commands || [])
    .filter((c) => c.type === "water" && c.status === "done" && inRange(c.created_at, range, now))
    .map((c) => ({ id: c.id, t: new Date(c.created_at).getTime() }));
  const leafPoints = (photos || [])
    .filter((p) => p.green_pct != null && inRange(p.ts, range, now))
    .map((p) => ({ t: new Date(p.ts).getTime(), green: p.green_pct, brightness: p.brightness }))
    .sort((a, b) => a.t - b.t);

  const r = status?.latest_reading;
  const readingCount = withData.reduce((n, p) => n + p.count, 0);
  const soilTrend = withData.length > 1 ? withData[withData.length - 1].soil - withData[0].soil : null;
  const activity = activityRows(runs, events, commands);
  const timeCol = { key: "t", label: "Time", format: (t) => formatTime(t) };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={range.key}
          onValueChange={(key) => key && setRange(RANGES.find((r) => r.key === key))}
          aria-label="Time range"
          className="glass rounded-full p-1"
        >
          {RANGES.map((opt) => (
            <ToggleGroupItem
              key={opt.key}
              value={opt.key}
              className="h-8 rounded-full! px-4 text-[13px] hover:bg-transparent data-[state=on]:bg-white data-[state=on]:text-foreground data-[state=on]:shadow-md dark:data-[state=on]:bg-white/15"
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {health?.readings_store === "tigerdata" && (
          <span
            className="glass ml-auto rounded-full px-3 py-1.5 text-[13px] text-muted-foreground"
            title="Readings are stored in a TimescaleDB hypertable and averaged with time_bucket()"
          >
            🐯 Live from Tiger Data
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Soil moisture now"
          value={r ? formatNumber(r.soil) : "–"}
          badge={r && STATUS_BADGE[r.status]}
          detail={soilTrend != null && ` ${soilTrend >= 0 ? "+" : ""}${formatNumber(soilTrend)} over ${range.label.toLowerCase()}`}
        />
        <StatTile label="Light now" value={r ? formatNumber(r.light) : "–"} detail={r?.light_status?.toLowerCase()} />
        <StatTile
          label="Temperature now"
          value={r?.temp != null ? `${formatNumber(r.temp, 1)}°C` : "–"}
          detail={r?.temp != null ? (r.temp < 10 ? "chilly" : r.temp < 28 ? "comfortable" : "hot") : undefined}
        />
        <StatTile
          label="Humidity now"
          value={r?.humidity != null ? `${formatNumber(r.humidity, 1)}%` : "–"}
          detail={r?.humidity != null ? (r.humidity < 30 ? "dry air" : r.humidity < 60 ? "just right" : "humid") : undefined}
        />
        <StatTile label="Readings" value={formatNumber(readingCount)} detail={range.label.toLowerCase()} />
        <StatTile label="Waterings" value={waterings.length} detail={range.label.toLowerCase()} />
        <StatTile
          label="Waterings skipped for rain"
          value={status?.skipped_waterings ?? "–"}
          detail="all time"
        />
        <StatTile label="Pi last seen" value={timeAgo(status?.last_seen)} detail={status?.last_seen && formatTime(new Date(status.last_seen))} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Soil moisture"
          subtitle={`Average per ${range.bucket} bucket, shaded band is min–max · 💧 = watering`}
          rows={withData}
          dimmed={history.loading && !!history.data}
          empty={history.error ? `Couldn't load history: ${history.error.message}` : "No readings in this range yet"}
          columns={[
            timeCol,
            { key: "soil", label: "Average", format: (v) => formatNumber(v, 1) },
            { key: "soilRange", label: "Min–max", format: (v) => `${formatNumber(v[0])}–${formatNumber(v[1])}` },
            { key: "count", label: "Readings" },
          ]}
        >
          <SoilChart points={points} waterings={waterings} range={range} now={now} />
        </ChartCard>

        <ChartCard
          title="Light"
          subtitle={`Average per ${range.bucket} bucket (relative, 0–1023)`}
          rows={withData}
          dimmed={history.loading && !!history.data}
          empty="No readings in this range yet"
          columns={[timeCol, { key: "light", label: "Average light", format: (v) => formatNumber(v, 1) }]}
        >
          <LightChart points={points} range={range} now={now} />
        </ChartCard>

        <ChartCard
          title="Temperature"
          subtitle={`Average per ${range.bucket} bucket, shaded band is min–max`}
          rows={withData}
          dimmed={history.loading && !!history.data}
          empty="No readings in this range yet"
          columns={[
            timeCol,
            { key: "temp", label: "Average (°C)", format: (v) => formatNumber(v, 1) },
            { key: "tempRange", label: "Min–max (°C)", format: (v) => v ? `${formatNumber(v[0], 1)}–${formatNumber(v[1], 1)}` : "–" },
          ]}
        >
          <TempChart points={points} range={range} now={now} />
        </ChartCard>

        <ChartCard
          title="Humidity"
          subtitle={`Average per ${range.bucket} bucket, shaded band is min–max`}
          rows={withData}
          dimmed={history.loading && !!history.data}
          empty="No readings in this range yet"
          columns={[
            timeCol,
            { key: "humidity", label: "Average (%)", format: (v) => formatNumber(v, 1) },
            { key: "humidityRange", label: "Min–max (%)", format: (v) => v ? `${formatNumber(v[0], 1)}–${formatNumber(v[1], 1)}` : "–" },
          ]}
        >
          <HumidityChart points={points} range={range} now={now} />
        </ChartCard>

        <ChartCard
          title="Leafiness"
          subtitle="Share of each photo that looks like green leaves"
          rows={leafPoints}
          empty="No photos in this range yet (the Pi takes one every hour)"
          columns={[
            timeCol,
            { key: "green", label: "Green", format: (v) => `${formatNumber(v, 1)}%` },
            { key: "brightness", label: "Brightness", format: (v) => formatNumber(v) },
          ]}
        >
          <LeafChart points={leafPoints} range={range} now={now} />
        </ChartCard>

        <GlassCard title="Recent activity" subtitle="AI decisions, alerts and commands sent to the Pi">
          {activity.length === 0 ? (
            <Empty>Nothing yet. Ask the plant something to see the AI at work.</Empty>
          ) : (
            <ScrollArea className="h-[300px]">
              <ul className="divide-y pr-3">
                {activity.map((a, i) => (
                  <li key={i} className="py-2.5">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="font-semibold">{a.kind}</span>
                      <time className="text-muted-foreground">{timeAgo(a.ts)}</time>
                    </div>
                    {a.text && <p className="mt-1 text-sm leading-snug">{a.text}</p>}
                    {a.extra && <p className="mt-0.5 text-[13px] text-muted-foreground">{a.extra}</p>}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
