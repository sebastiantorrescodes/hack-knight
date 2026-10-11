import { useEffect, useMemo, useRef, useState } from "react";
import ToolChip from "./ToolChip";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { cn } from "@/lib/utils";

// The SDK's frequency data has 1024 bins; speech lives in roughly the lowest fifth
const VOICE_BINS = [0.01, 0.22];
const MAX_WORDS = 8; // per subtitle line
const MS_PER_WORD = 360; // about how fast the plant's voice talks
const MIN_LINE_MS = 900;
const TICK_MS = 100;
const TOOL_SHOW_MS = 5000;

/** Split a reply into short subtitle lines: by sentence, then into even chunks of at most MAX_WORDS. */
function toLines(text) {
  const lines = [];
  for (const sentence of text.match(/[^.!?…]+[.!?…]*/g) ?? []) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    const chunks = Math.ceil(words.length / MAX_WORDS);
    const size = Math.ceil(words.length / chunks);
    for (let i = 0; i < words.length; i += size) lines.push(words.slice(i, i + size).join(" "));
  }
  return lines;
}

const lineMs = (line) => Math.max(MIN_LINE_MS, line.split(" ").length * MS_PER_WORD);

/**
 * Which subtitle line to show. The agent's whole reply arrives at once, so this paces through it line by line,
 * only counting time while the plant is actually speaking (it pauses if the audio does).
 */
function useSubtitle(text, speaking) {
  const lines = useMemo(() => toLines(text || ""), [text]);
  const [index, setIndex] = useState(0);
  const elapsed = useRef(0);

  useEffect(() => {
    elapsed.current = 0;
    setIndex(0);
  }, [lines]);

  useEffect(() => {
    if (!speaking || lines.length < 2) return;
    const id = setInterval(() => {
      elapsed.current += TICK_MS;
      let end = 0;
      let next = lines.length - 1;
      for (let i = 0; i < lines.length; i++) {
        end += lineMs(lines[i]);
        if (elapsed.current < end) {
          next = i;
          break;
        }
      }
      setIndex(next);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [speaking, lines]);

  return lines[index] ?? "";
}

/** The newest tool turn, for a few seconds after it happens. */
function useRecentTool(turns) {
  const latest = useMemo(() => [...turns].reverse().find((t) => t.kind === "tool"), [turns]);
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!latest) return;
    setShown(latest);
    const id = setTimeout(() => setShown(null), TOOL_SHOW_MS);
    return () => clearTimeout(id);
  }, [latest]);
  return shown;
}

/**
 * What a live call looks like: a waveform of whoever is talking (green for the plant, blue for the kid),
 * and subtitles of what the plant says.
 */
export default function CallStage({ name, call, turns, className }) {
  const lastAgentText = useMemo(
    () => [...turns].reverse().find((t) => t.kind === "text" && t.role === "agent")?.text,
    [turns]
  );
  const subtitle = useSubtitle(lastAgentText, call.speaking);
  const tool = useRecentTool(turns);

  const hint = call.connecting ? `Calling ${name}…` : `Say hi to ${name}!`;

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <LiveWaveform
        active={call.connected}
        processing={call.connecting}
        getFrequencyData={call.speaking ? call.outputFrequency : call.inputFrequency}
        frequencyRange={VOICE_BINS}
        sensitivity={1.6}
        barWidth={4}
        barGap={3}
        barRadius={2}
        height={120}
        fadeWidth={48}
        className={cn("w-full max-w-sm transition-colors duration-300", call.speaking ? "text-ios-green" : "text-ios-blue")}
      />

      <div className="flex h-8 items-center">
        {tool && (
          <ToolChip
            key={tool.id}
            className="animate-in fade-in zoom-in-95"
            part={{ state: "output-available", toolName: tool.name, output: tool.failed ? { error: "failed" } : { ok: true } }}
          />
        )}
      </div>

      {/* Subtitles: the screen-reader text is the whole reply, so it isn't read out line by line */}
      <p className="sr-only" aria-live="polite">{lastAgentText}</p>
      <p
        aria-hidden="true"
        className={cn(
          "flex min-h-[4.5rem] max-w-xs items-center justify-center text-center font-rounded text-xl leading-snug font-bold text-balance transition-opacity",
          !subtitle && "font-semibold text-muted-foreground",
          subtitle && !call.speaking && "opacity-60"
        )}
      >
        <span key={subtitle || hint} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {subtitle || hint}
        </span>
      </p>
    </div>
  );
}
