import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { ConversationProvider } from "@elevenlabs/react";
import { ArrowUp, Mic, MicOff, Phone, PhoneOff, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { clearChatHistory, getChatHistory, signedUrl } from "../api";
import { timeAgo } from "../analytics/ranges";
import { PlantChatTransport } from "./transport";
import { useVoiceCall } from "./useVoiceCall";
import { playWithVoice } from "../voice";
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

/** Stored agent runs (from /agent/chat/history) as useChat messages, shaped like the ones the transport streams. */
function runsToMessages(runs) {
  return runs.flatMap((run) => {
    const assistant = {
      id: `run-${run.id}`,
      role: "assistant",
      metadata: run.trigger === "check" ? { checkIn: run.ts } : undefined,
      parts: [
        ...run.actions.map((a, i) => ({
          type: "dynamic-tool",
          toolCallId: `run-${run.id}-${i}`,
          toolName: a.tool,
          state: "output-available",
          input: a.args,
          output: a.result,
        })),
        { type: "text", text: run.reply },
      ],
    };
    // A check-in has no question: the plant did it on its own
    if (run.trigger === "check") return [assistant];
    return [{ id: `run-${run.id}-q`, role: "user", parts: [{ type: "text", text: run.prompt }] }, assistant];
  });
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

let currentAudio = null; // the reply being read aloud, so the sound toggle can cut it off

function stopSpeaking() {
  currentAudio?.pause();
  currentAudio = null;
}

async function speak(text, stillWanted) {
  stopSpeaking(); // a new reply replaces the old one instead of talking over it
  const audio = new Audio();
  currentAudio = audio;
  audio.crossOrigin = "anonymous"; // lets playWithVoice read the loudness for the plant's mouth
  audio.src = await signedUrl(`/tts?${new URLSearchParams({ text: text.slice(0, 600) })}`);
  // Sound was switched off (or a newer reply started) while the audio URL was loading
  if (currentAudio !== audio || !stillWanted()) return;
  playWithVoice(audio).catch(() => {}); // no voice configured or autoplay blocked: the text is still on screen
}

/** Hook that wires up the browser's SpeechRecognition API. */
function useSpeech({ onResult, onSend }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const supported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!supported || listening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    recRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      onResult(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        onSend(transcript);
        rec.stop();
      }
    };
    rec.start();
  }, [supported, listening, onResult, onSend]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  return { listening, supported, start, stop };
}

/** One line of the live call: who's talking now, plus mute and hang up. */
function CallBar({ name, call }) {
  const label = call.connecting ? `Calling ${name}…` : call.speaking ? `${name} is talking…` : "Listening… just talk!";
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-full bg-ios-green/12 py-1.5 pr-1.5 pl-4">
      <span className={cn("size-2.5 shrink-0 rounded-full bg-ios-green", !call.connecting && "animate-pulse")} />
      <span className="flex-1 truncate text-[14px] font-semibold text-ios-green" aria-live="polite">{label}</span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full"
        onClick={() => call.setMuted(!call.muted)}
        disabled={!call.connected}
        aria-pressed={call.muted}
        aria-label={call.muted ? "Unmute" : "Mute"}
        title={call.muted ? "Unmute" : "Mute"}
      >
        {call.muted ? <MicOff /> : <Mic />}
      </Button>
      <Button type="button" size="sm" variant="destructive" className="rounded-full" onClick={call.end}>
        <PhoneOff /> End
      </Button>
    </div>
  );
}

/** The panel lives inside ConversationProvider so the live voice call (ElevenLabs agent) can run in it. */
export default function ChatPanel(props) {
  return (
    <ConversationProvider>
      <ChatPanelBody {...props} />
    </ConversationProvider>
  );
}

function ChatPanelBody({ plantId, name, onClose }) {
  const transport = useMemo(() => new PlantChatTransport(plantId), [plantId]);
  const [voice, setVoice] = useState(true);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const { messages, setMessages, sendMessage, status, error, stop } = useChat({
    transport,
    onFinish: ({ message }) => {
      const text = message.parts.filter((p) => p.type === "text").map((p) => p.text).join("");
      if (voiceRef.current && text) speak(text, () => voiceRef.current).catch(() => {});
    },
  });

  useEffect(() => {
    if (!voice) stopSpeaking();
  }, [voice]);
  useEffect(() => stopSpeaking, []); // closing the chat stops the plant mid-sentence

  // Pick up where the last visit left off. Anything sent before the history arrives stays after it.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getChatHistory(plantId)
      .then((runs) => !cancelled && setMessages((current) => [...runsToMessages(runs), ...current]))
      .catch(() => {}) // no history is fine: the chat still works
      .finally(() => !cancelled && setHistoryLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [plantId, setMessages]);

  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  // Live call transcript, shown after the typed chat
  const [voiceTurns, setVoiceTurns] = useState([]);
  const addTurn = useCallback((turn) => setVoiceTurns((turns) => [...turns, { id: turns.length, ...turn }]), []);
  const call = useVoiceCall({ plantId, onTurn: addTurn, silent: !voice });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [voiceTurns]);

  const send = useCallback((text) => {
    const t = text.trim();
    if (!t) return;
    if (call.connected) {
      // Typing during a call goes to the voice agent, which answers out loud
      call.sendText(t);
      addTurn({ kind: "text", role: "user", text: t });
    } else if (!busy && !call.active) {
      sendMessage({ text: t });
    } else return;
    setInput("");
  }, [busy, sendMessage, call, addTurn]);

  const [clearError, setClearError] = useState(null);
  const clearChat = async () => {
    if (!window.confirm(`Clear your chat with ${name}? This deletes the messages for good.`)) return;
    try {
      await clearChatHistory(plantId);
      stopSpeaking();
      setMessages([]);
      setVoiceTurns([]);
      setClearError(null);
    } catch (err) {
      setClearError(err.message);
    }
  };

  const { listening, supported: micSupported, start: startMic, stop: stopMic } = useSpeech({
    onResult: (transcript) => setInput(transcript),
    onSend: (transcript) => send(transcript),
  });

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
            <p className="text-xs text-muted-foreground">{call.active ? "on a call" : busy ? "typing…" : "Your plant"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!call.active && (
            <Button
              size="sm"
              className="rounded-full bg-ios-green hover:bg-ios-green/90"
              onClick={call.start}
              disabled={busy}
              title={`Talk to ${name} out loud`}
            >
              <Phone /> Talk live
            </Button>
          )}
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
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={clearChat}
            disabled={busy || call.active || (messages.length === 0 && voiceTurns.length === 0)}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 />
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
          {historyLoaded && messages.length === 0 && voiceTurns.length === 0 && (
            <div className="my-auto flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <span className="text-5xl">🪴</span>
              <p className="max-w-60 text-[15px]">Hi! I'm {name}. Ask me how I'm doing, or tell me to pour some water!</p>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={cn("flex max-w-[85%] flex-col gap-1.5", mine ? "items-end self-end" : "items-start self-start")}>
                {m.metadata?.checkIn && (
                  <p className="px-1 text-xs font-semibold text-muted-foreground">
                    🌙 While you were away · {timeAgo(m.metadata.checkIn)}
                  </p>
                )}
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

          {voiceTurns.map((turn) => {
            if (turn.kind === "tool") {
              const part = {
                state: "output-available",
                toolName: turn.name,
                output: turn.failed ? { error: "failed" } : { ok: true },
              };
              return <div key={turn.id} className="self-start"><ToolChip part={part} /></div>;
            }
            const mine = turn.role === "user";
            return (
              <div
                key={turn.id}
                className={cn(
                  "max-w-[85%] rounded-[20px] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap",
                  mine ? "self-end rounded-br-md bg-ios-blue text-white" : "self-start rounded-bl-md bg-secondary"
                )}
              >
                {turn.text}
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
          {call.error && <div className="rounded-2xl bg-ios-red/10 px-3 py-2 text-sm text-ios-red">📞 {call.error}</div>}
          {clearError && <div className="rounded-2xl bg-ios-red/10 px-3 py-2 text-sm text-ios-red">🗑️ Couldn't clear the chat: {clearError}</div>}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {call.active ? (
        <CallBar name={name} call={call} />
      ) : (
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
      )}

      <form
        className="flex items-center gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {micSupported && !call.active && (
          <Button
            type="button"
            size="icon"
            variant={listening ? "destructive" : "ghost"}
            className={cn("shrink-0 rounded-full transition-all", listening && "animate-pulse")}
            onClick={listening ? stopMic : startMic}
            disabled={busy}
            aria-label={listening ? "Stop listening" : "Speak to plant"}
            title={listening ? "Stop listening" : "Speak to plant"}
          >
            {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </Button>
        )}
        <div className="flex flex-1 items-center rounded-full border bg-background/60 py-1 pr-1 pl-4 focus-within:ring-2 focus-within:ring-ring/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : call.connected ? "Or type, and I'll answer out loud" : `Message ${name}`}
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
