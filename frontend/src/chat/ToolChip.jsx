import { cn } from "@/lib/utils";

/** Friendly label for each tool the agent can call, given its input and output. */
function describeTool(name, input, output) {
  const refused = output?.refused;
  switch (name) {
    case "water_plant":
      if (refused) return { icon: "🚫", text: `Didn't water: ${refused}`, tone: "warn" };
      if (output?.ok) {
        const pours = output.pours ?? 1;
        return { icon: "💧", text: pours > 1 ? `Pouring water ${pours} times!` : "Pouring water!", tone: "good" };
      }
      return { icon: "💧", text: "Trying to water…" };
    case "record_skipped_watering":
      return { icon: "🌧️", text: "Skipped watering, rain is coming" };
    case "get_plant_status":
      return { icon: "🌱", text: "Checked my sensors" };
    case "get_reading_history":
      return { icon: "📈", text: `Looked at the last ${input?.hours ?? "few"} hours` };
    case "get_weather_forecast":
      return { icon: "☁️", text: "Checked the weather" };
    case "look_at_plant":
      return { icon: "👀", text: "Looked at my photo" };
    case "take_photo":
      return { icon: "📸", text: "Asked for a new photo" };
    case "send_alert":
      return { icon: "🔔", text: "Sent you an alert" };
    default:
      return { icon: "🔧", text: name };
  }
}

const CHIP_TONE = {
  good: "bg-ios-blue/12 text-ios-blue",
  warn: "bg-ios-orange/15 text-ios-orange",
  default: "bg-ios-green/12 text-ios-green",
};

/** One thing the agent did (a tool call), as a little pill. */
export default function ToolChip({ part, className }) {
  const done = part.state === "output-available";
  const { icon, text, tone } = describeTool(part.toolName, part.input, part.output);
  const error = part.output?.error;
  return (
    <div
      className={cn("rounded-full px-3 py-1 text-[13px] font-medium", CHIP_TONE[error ? "warn" : tone || "default"], className)}
      title={JSON.stringify(part.output ?? part.input)}
    >
      <span aria-hidden="true">{icon}</span> {error ? `${text} (failed)` : text}
      {!done && <span className="ml-1">…</span>}
    </div>
  );
}
