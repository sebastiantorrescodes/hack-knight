import { formatNumber, formatTime } from "./ranges";

const MAX_POINTS = 24; // enough to see the shape of the chart without a huge message

// How the plant should answer, sent along with the data so the system prompt doesn't need to know about charts
const HOW_TO_ANSWER =
  "Explain this chart like a friendly teacher. Point out the biggest change and why it happened (a watering, " +
  "day and night, the weather), using times of day instead of raw numbers. Then ask the kid to find something " +
  "in the chart themselves, like when the line was highest. If there isn't much data, say so and tell them what " +
  "to look out for later.";

/** Average the points into at most MAX_POINTS groups, so a 7-day chart still fits in a message. */
function downsample(points, key) {
  const size = Math.ceil(points.length / MAX_POINTS);
  const groups = [];
  for (let i = 0; i < points.length; i += size) {
    const group = points.slice(i, i + size);
    groups.push({
      t: group[Math.floor(group.length / 2)].t,
      v: group.reduce((sum, p) => sum + p[key], 0) / group.length,
    });
  }
  return groups;
}

/**
 * A short text version of one chart for the plant to explain: what it measures, the range, its shape over
 * time and any waterings. `rows` are chart points with `t` (ms) and the value under `key`.
 */
export function chartContext({ title, range, rows, key, unit = "", digits = 0, meaning, waterings }) {
  const points = rows.filter((p) => p[key] != null);
  const fmt = (v) => `${formatNumber(v, digits)}${unit}`;
  const lines = [`Chart: ${title}, ${range.label.toLowerCase()}. ${meaning}`];

  if (points.length === 0) {
    lines.push("There's no data in this range yet.");
  } else {
    const values = points.map((p) => p[key]);
    lines.push(
      `Lowest ${fmt(Math.min(...values))}, highest ${fmt(Math.max(...values))}. ` +
        `It started at ${fmt(values[0])} and is ${fmt(values[values.length - 1])} at the end.`,
      `Over time: ${downsample(points, key).map((g) => `${formatTime(g.t)} ${fmt(g.v)}`).join("; ")}.`
    );
  }
  if (waterings) {
    lines.push(
      waterings.length
        ? `Waterings: ${waterings.map((w) => formatTime(w.t)).join(", ")}.`
        : "No waterings in this range."
    );
  }
  lines.push(`The kid's time now: ${formatTime(Date.now())}.`, HOW_TO_ANSWER);
  return lines.join("\n");
}
