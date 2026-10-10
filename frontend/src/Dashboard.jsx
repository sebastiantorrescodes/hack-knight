import { useEffect, useState } from "react";
import { UserButton } from "@clerk/react";
import { BarChart3, Check, ChevronDown, CloudRain, MessageCircle, Pencil, Plus, Sprout } from "lucide-react";
import { updatePlant } from "./api";
import { usePlant } from "./PlantContext";
import usePoll from "./usePoll";
import { explain, getMood } from "./plant";
import Mesh from "./components/Mesh";
import PlantFace from "./components/PlantFace";
import Meters from "./components/Meters";
import PlantCam from "./components/PlantCam";
import Analytics from "./analytics/Analytics";
import ChatPanel from "./chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EXPLAIN_MS = 12000;
const TABS = [
  { key: "plant", label: "Plant", icon: Sprout },
  { key: "data", label: "Garden data", icon: BarChart3 },
];

const MOOD_TAG = {
  happy: { text: "Happy", className: "bg-ios-green/15 text-ios-green" },
  okay: { text: "Doing fine", className: "bg-ios-teal/15 text-ios-teal" },
  thirsty: { text: "Thirsty", className: "bg-ios-orange/15 text-ios-orange" },
  soggy: { text: "Too wet", className: "bg-ios-blue/15 text-ios-blue" },
  sleepy: { text: "Resting", className: "bg-ios-indigo/15 text-ios-indigo" },
  offline: { text: "Offline", className: "bg-muted text-muted-foreground" },
};

const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

const tabFromHash = () => (window.location.hash === "#data" ? "data" : "plant");

function PlantView({ name, status, error }) {
  const mood = getMood(status, error);
  const tag = MOOD_TAG[mood.key];
  const [explanation, setExplanation] = useState(null);

  useEffect(() => {
    if (!explanation) return;
    const id = setTimeout(() => setExplanation(null), EXPLAIN_MS);
    return () => clearTimeout(id);
  }, [explanation]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <section className="glass relative flex flex-col items-center gap-4 rounded-3xl p-6">
          <span className={cn("absolute top-5 left-5 rounded-full px-3 py-1 text-xs font-semibold", tag.className)}>
            {tag.text}
          </span>
          <div
            aria-live="polite"
            className="glass-strong relative mt-8 max-w-sm rounded-[22px] px-5 py-3.5 text-center font-rounded text-lg leading-snug font-semibold"
          >
            {explanation || mood.line}
            <svg aria-hidden="true" viewBox="0 0 24 12" className="absolute top-full left-1/2 h-3 w-6 -translate-x-1/2">
              <path d="M0 0 H24 L14 10.5 Q12 12.5 10 10.5 Z" fill="var(--glass-bg-strong)" />
            </svg>
          </div>
          <PlantFace mood={mood.key} />
        </section>
        <PlantCam name={name} />
      </div>
      <Meters status={status} onExplain={(m) => setExplanation(explain(m, status))} />
    </div>
  );
}

function PlantName({ plant, onPlantChange }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  const rename = async (e) => {
    e.preventDefault();
    const next = e.target.elements.name.value.trim().slice(0, 20);
    if (!next || next === plant.name) return setEditing(false);
    try {
      onPlantChange(await updatePlant(plant.id, { name: next }));
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!editing) {
    return (
      <h1 className="flex items-center gap-2 font-rounded text-4xl font-extrabold tracking-tight sm:text-5xl">
        Meet {plant.name}
        <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground" onClick={() => setEditing(true)} aria-label="Rename the plant">
          <Pencil />
        </Button>
      </h1>
    );
  }
  return (
    <form onSubmit={rename} className="mt-1 flex flex-wrap items-center gap-2">
      <Input
        name="name"
        defaultValue={plant.name}
        autoFocus
        maxLength={20}
        aria-label="Plant name"
        className="glass h-12 w-56 rounded-2xl px-4 font-rounded text-2xl font-bold md:text-2xl"
      />
      <Button type="submit" size="icon-lg" className="rounded-full" aria-label="Save name">
        <Check />
      </Button>
      {error && <p className="w-full text-sm text-ios-red">{error}</p>}
    </form>
  );
}

function PlantSwitcher({ plants, current, onSelectPlant, onAddPlant }) {
  return (
    <div className="flex items-center gap-2">
      {plants.length > 1 && (
        <label className="glass relative flex h-11 items-center rounded-full pr-9 pl-4 text-[15px] font-medium">
          <span className="sr-only">Plant</span>
          <select
            value={current.id}
            onChange={(e) => onSelectPlant(e.target.value)}
            className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
          >
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          🪴 {current.name}
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
        </label>
      )}
      <Button variant="ghost" className="glass h-11 rounded-full" onClick={onAddPlant}>
        <Plus /> Add plant
      </Button>
    </div>
  );
}

export default function Dashboard({ plants, onSelectPlant, onAddPlant, onPlantChange }) {
  const { plant, api } = usePlant();
  const { data: status, error } = usePoll(api.getStatus, 5000);
  const [tab, setTab] = useState(tabFromHash);
  const [chatOpen, setChatOpen] = useState(false); // only matters on narrow screens

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const saved = status?.skipped_waterings ?? 0;

  return (
    <TooltipProvider>
      <Mesh />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 pt-8 pb-28 sm:px-6 lg:pb-10">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
                {today.format(new Date())}
              </p>
              <PlantName plant={plant} onPlantChange={onPlantChange} />
            </div>

            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="glass flex items-center gap-2 rounded-full py-2 pr-4 pl-2 text-sm">
                    <span className="flex size-7 items-center justify-center rounded-full bg-ios-blue text-white">
                      <CloudRain className="size-4" />
                    </span>
                    Saved <strong className="tabular-nums">{saved}</strong> {saved === 1 ? "cup" : "cups"} of water
                  </div>
                </TooltipTrigger>
                <TooltipContent>Times we waited for rain instead of watering</TooltipContent>
              </Tooltip>
              <UserButton appearance={{ elements: { avatarBox: "size-10! ring-2 ring-white/70 shadow-md" } }} />
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => (window.location.hash = v)}>
              <TabsList className="glass h-11 rounded-full p-1">
                {TABS.map(({ key, label, icon: Icon }) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="rounded-full px-5 text-[15px] data-[state=active]:bg-white data-[state=active]:shadow-md dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-white/15"
                  >
                    <Icon /> {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <PlantSwitcher plants={plants} current={plant} onSelectPlant={onSelectPlant} onAddPlant={onAddPlant} />
          </div>

          {tab === "data" ? <Analytics /> : <PlantView name={plant.name} status={status} error={error} />}
        </div>

        {/* One chat instance: a floating sidebar on wide screens, a bottom sheet on narrow ones */}
        <div
          aria-hidden="true"
          onClick={() => setChatOpen(false)}
          className={cn(
            "fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
            chatOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 h-[min(85dvh,700px)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            chatOpen ? "translate-y-0" : "translate-y-full",
            "lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-y-0 lg:p-4 lg:pl-0"
          )}
        >
          <ChatPanel plantId={plant.id} name={plant.name} onClose={() => setChatOpen(false)} />
        </div>
      </div>

      <Button
        onClick={() => setChatOpen(true)}
        aria-label={`Chat with ${plant.name}`}
        className={cn(
          "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 h-14 rounded-full px-6 text-base font-semibold shadow-xl shadow-ios-green/30 transition-all lg:hidden",
          chatOpen && "pointer-events-none scale-90 opacity-0"
        )}
      >
        <MessageCircle className="size-5" /> Talk to {plant.name}
      </Button>
    </TooltipProvider>
  );
}
