import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Square, Volume2, VolumeX, X } from "lucide-react";
import { signedUrl } from "../api";
import { PlantChatTransport } from "./transport";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["💧 Pour some water", "Are you thirsty?", "Will it rain today?", "How do your leaves look?"];

/** Friendly label for each tool the agent can call, given its input and output. */
function describeTool(name, input, output) {
  const refused = output?.refused;
  switch (name) {
    case "water_plant":
      if (refused) return { icon: "🚫", text: `Didn't water: ${refused}`, tone: "warn" };
      if (output?.ok) return { icon: "💧", text: "Pouring water!", tone: "good" };
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

function ToolChip({ part }) {
  const done = part.state === "output-available";
  const { icon, text, tone } = describeTool(part.toolName, part.input, part.output);
  const error = part.output?.error;
  return (
    <div
      className={cn("rounded-full px-3 py-1 text-[13px] font-medium", CHIP_TONE[error ? "warn" : tone || "default"])}
      title={JSON.stringify(part.output ?? part.input)}
    >
      <span aria-hidden="true">{icon}</span> {error ? `${text} (failed)` : text}
      {!done && <span className="ml-1">…</span>}
    </div>
  );
}

async function speak(text) {
  const audio = new Audio(await signedUrl(`/tts?${new URLSearchParams({ text: text.slice(0, 600) })}`));
  audio.play().catch(() => {}); // no voice configured or autoplay blocked: the text is still on screen
}

export default function ChatPanel({ plantId, name, onClose }) {
  const transport = useMemo(() => new PlantChatTransport(plantId), [plantId]);
  const [voice, setVoice] = useState(true);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    onFinish: ({ message }) => {
      const text = message.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
      if (voiceRef.current && text) speak(text).catch(() => {});
    },
  });
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const send = (text) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <aside
      aria-label={`Chat with ${name}`}
      className="glass-strong flex h-full flex-col overflow-hidden rounded-t-[28px] lg:rounded-[28px]"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30 lg:hidden" aria-hidden="true" />
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-ios-green to-ios-teal text-xl shadow-sm">
            🪴
          </span>
          <div>
            <h2 className="font-rounded text-lg leading-tight font-bold">{name}</h2>
            <p className="text-xs text-muted-foreground">{busy ? "typing…" : "Your plant"}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => setVoice((v) => !v)}
            aria-pressed={voice}
            aria-label={voice ? "Voice on" : "Voice off"}
            title={voice ? "Voice on" : "Voice off"}
          >
            {voice ? <Volume2 /> : <VolumeX />}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="rounded-full lg:hidden" onClick={onClose} aria-label="Close chat">
              <X />
            </Button>
          )}
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col gap-2.5 p-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="my-auto flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <span className="text-5xl">🪴</span>
              <p className="max-w-60 text-[15px]">Hi! I'm {name}. Ask me how I'm doing, or tell me to pour some water!</p>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={cn("flex max-w-[85%] flex-col gap-1.5", mine ? "items-end self-end" : "items-start self-start")}>
                {m.parts.map((part, i) => {
                  if (part.type === "dynamic-tool") return <ToolChip key={i} part={part} />;
                  if (part.type === "text" && part.text)
                    return (
                      <div
                        key={i}
                        className={cn(
                          "rounded-[20px] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap",
                          mine ? "rounded-br-md bg-ios-blue text-white" : "rounded-bl-md bg-secondary"
                        )}
                      >
                        {part.text}
                      </div>
                    );
                  return null;
                })}
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="flex gap-1 self-start rounded-[20px] rounded-bl-md bg-secondary px-4 py-3.5" aria-label={`${name} is thinking`}>
              <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
              <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
              <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
            </div>
          )}
          {error && <div className="rounded-2xl bg-ios-red/10 px-3 py-2 text-sm text-ios-red">😵 {error.message}</div>}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2 overflow-x-auto px-4 pt-2 [scrollbar-width:none]">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={busy}
            className="shrink-0 rounded-full border bg-background/50 px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex flex-1 items-center rounded-full border bg-background/60 py-1 pr-1 pl-4 focus-within:ring-2 focus-within:ring-ring/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${name}`}
            aria-label="Message"
            maxLength={2000}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button type="button" size="icon-sm" variant="secondary" className="rounded-full" onClick={stop} aria-label="Stop">
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              className="rounded-full bg-ios-blue hover:bg-ios-blue/90"
              disabled={!input.trim()}
              aria-label="Send"
            >
              <ArrowUp className="size-[18px] stroke-[2.5]" />
            </Button>
          )}
        </div>
      </form>
    </aside>
  );
}
