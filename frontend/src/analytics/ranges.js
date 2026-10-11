// Time ranges for the analytics page. Each picks a bucket size so a chart has roughly 60-170 points.
export const RANGES = [
  { key: "1h", label: "Last hour", hours: 1, bucket: "1m", bucketMs: 60e3 },
  { key: "6h", label: "6 hours", hours: 6, bucket: "5m", bucketMs: 300e3 },
  { key: "24h", label: "24 hours", hours: 24, bucket: "15m", bucketMs: 900e3 },
  { key: "7d", label: "7 days", hours: 168, bucket: "1h", bucketMs: 3600e3 },
];

/**
 * Turn /readings/history rows into one point per bucket across the whole range, with nulls where the
 * Pi sent nothing. Lines then break at gaps instead of drawing a straight line through missing data.
 */
export function fillBuckets(rows, range, now = Date.now()) {
  const byTime = new Map((rows || []).map((r) => [new Date(r.ts).getTime(), r]));
  const start = Math.floor((now - range.hours * 3600e3) / range.bucketMs) * range.bucketMs;
  const points = [];
  for (let t = start; t <= now; t += range.bucketMs) {
    const r = byTime.get(t);
    points.push({
      t,
      soil: r ? r.soil_avg : null,
      soilRange: r ? [r.soil_min, r.soil_max] : null,
      light: r ? r.light_avg : null,
      temp: r ? r.temp_avg ?? null : null,
      tempRange: r && r.temp_min != null ? [r.temp_min, r.temp_max] : null,
      humidity: r ? r.humidity_avg ?? null : null,
      humidityRange: r && r.humidity_min != null ? [r.humidity_min, r.humidity_max] : null,
      count: r ? r.count : 0,
    });
  }
  return points;
}

export const inRange = (iso, range, now = Date.now()) => new Date(iso).getTime() >= now - range.hours * 3600e3;

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric" });
const fullFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export const tickFormatter = (range) => (t) => (range.hours > 24 ? dayFmt : timeFmt).format(t);
export const formatTime = (t) => fullFmt.format(t);
export const formatNumber = (n, digits = 0) =>
  n == null ? "–" : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
