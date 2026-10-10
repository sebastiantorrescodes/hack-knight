import { useCallback, useMemo, useState } from "react";
import { getAgentRuns, getCommands, getEvents, getHealth, getHistory, getPhotos, getStatus } from "../api";
import usePoll from "../usePoll";
import ChartCard from "./ChartCard";
import { LeafChart, LightChart, SoilChart } from "./charts";
import { RANGES, fillBuckets, formatNumber, formatTime, inRange, timeAgo } from "./ranges";

const STATUS_BADGE = {
  DRY: { icon: "⚠", text: "Dry", tone: "warn" },
  WET: { icon: "⚠", text: "Too wet", tone: "warn" },
  OK: { icon: "✓", text: "Healthy", tone: "good" },
};

function StatTile({ label, value, detail, badge }) {
  return (
    <div className="a-tile">
      <div className="a-tile-label">{label}</div>
      <div className="a-tile-value">{value}</div>
      <div className="a-tile-detail">
        {badge && <span className={`a-badge ${badge.tone}`}>{badge.icon} {badge.text}</span>}
        {detail}
      </div>
    </div>
  );
}

function activityRows(runs, events, commands) {
  const rows = [
    ...(runs || []).map((r) => ({
      ts: r.ts,
      kind: r.trigger === "check" ? "AI check" : "AI chat",
      text: r.error ? `Error: ${r.error}` : r.reply,
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
      text: c.payload?.reason || (c.type === "water" ? `${c.payload?.seconds ?? "?"}s` : ""),
      extra: `${c.status}${c.message ? `: ${c.message}` : ""}`,
    })),
  ];
  return rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 15);
}

export default function Analytics() {
  const [range, setRange] = useState(RANGES[1]);
  const fetchHistory = useCallback(() => getHistory(range.hours, range.bucket), [range]);

  const history = usePoll(fetchHistory, 30000);
  const { data: status } = usePoll(getStatus, 10000);
  const { data: commands } = usePoll(getCommands, 30000);
  const { data: photos } = usePoll(getPhotos, 60000);
  const { data: runs } = usePoll(getAgentRuns, 30000);
  const { data: events } = usePoll(getEvents, 30000);
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
  const timeCol = { key: "t", label: "Time", format: (t) => formatTime(t) };

  return (
    <div className="analytics">
      <div className="a-filters" role="group" aria-label="Time range">
        {RANGES.map((opt) => (
          <button
            key={opt.key}
            className={opt.key === range.key ? "active" : ""}
            aria-pressed={opt.key === range.key}
            onClick={() => setRange(opt)}
          >
            {opt.label}
          </button>
        ))}
        {health?.readings_store === "tigerdata" && (
          <span className="a-source" title="Readings are stored in a TimescaleDB hypertable and averaged with time_bucket()">
            🐯 Live from Tiger Data
          </span>
        )}
      </div>

      <div className="a-tiles">
        <StatTile
          label="Soil moisture now"
          value={r ? formatNumber(r.soil) : "–"}
          badge={r && STATUS_BADGE[r.status]}
          detail={soilTrend != null && ` ${soilTrend >= 0 ? "+" : ""}${formatNumber(soilTrend)} over ${range.label.toLowerCase()}`}
        />
        <StatTile label="Light now" value={r ? formatNumber(r.light) : "–"} detail={r?.light_status?.toLowerCase()} />
        <StatTile label="Readings" value={formatNumber(readingCount)} detail={range.label.toLowerCase()} />
        <StatTile label="Waterings" value={waterings.length} detail={range.label.toLowerCase()} />
        <StatTile
          label="Waterings skipped for rain"
          value={status?.skipped_waterings ?? "–"}
          detail="all time"
        />
        <StatTile label="Pi last seen" value={timeAgo(status?.last_seen)} detail={status?.last_seen && formatTime(new Date(status.last_seen))} />
      </div>

      <div className="a-grid">
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

        <section className="a-card a-activity">
          <header className="a-card-head">
            <div>
              <h3>Recent activity</h3>
              <p className="a-sub">AI decisions, alerts and commands sent to the Pi</p>
            </div>
          </header>
          {activityRows(runs, events, commands).length === 0 ? (
            <div className="a-empty">Nothing yet. Ask the plant something to see the AI at work.</div>
          ) : (
            <ul className="a-feed">
              {activityRows(runs, events, commands).map((a, i) => (
                <li key={i}>
                  <div className="a-feed-head">
                    <span className="a-kind">{a.kind}</span>
                    <time>{timeAgo(a.ts)}</time>
                  </div>
                  {a.text && <p>{a.text}</p>}
                  {a.extra && <p className="a-sub">{a.extra}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
