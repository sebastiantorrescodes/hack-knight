import { useState } from "react";
import { Check, ChevronLeft, Loader2, MapPin, Search } from "lucide-react";
import { claimPlant, saveProfile, searchPlaces } from "../api";
import { CenteredScreen } from "../components/Mesh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "parent", label: "Parent or guardian", emoji: "👪" },
  { value: "teacher", label: "Teacher", emoji: "🍎" },
  { value: "hobbyist", label: "Plant lover", emoji: "🪴" },
];
const KIDS_AGES = [
  { value: "under-6", label: "Under 6" },
  { value: "6-8", label: "6–8" },
  { value: "9-12", label: "9–12" },
  { value: "13+", label: "13+" },
  { value: "none", label: "No kids" },
];
const EXPERIENCE = [
  { value: "new", label: "First plant" },
  { value: "some", label: "A few plants" },
  { value: "expert", label: "Green thumb" },
];
const GOALS = [
  { value: "learn", label: "Learn how plants work" },
  { value: "save-water", label: "Save water" },
  { value: "away", label: "Keep it alive while I'm away" },
  { value: "science", label: "Science project" },
];
const SPECIES = ["Basil", "Mint", "Pothos", "Spider plant", "Snake plant", "Succulent", "Tomato", "Sunflower", "Fern"];
const PLANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function Chip({ selected, onClick, children, className }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-4 py-2 text-[15px] font-medium transition-all active:scale-[0.97]",
        selected ? "border-transparent bg-ios-green text-white shadow-md shadow-ios-green/25" : "bg-background/50 hover:bg-accent",
        className
      )}
    >
      {children}
    </button>
  );
}

function Question({ label, hint, children }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-[15px] font-semibold">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Steps({ step }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step} of 2`}>
      {[1, 2].map((n) => (
        <span key={n} className={cn("h-1.5 rounded-full transition-all", n === step ? "w-8 bg-ios-green" : "w-4 bg-muted-foreground/25")} />
      ))}
    </div>
  );
}

function AboutYou({ initial, onNext }) {
  const [role, setRole] = useState(initial?.role ?? null);
  const [kidsAges, setKidsAges] = useState(initial?.kids_ages ?? null);
  const [experience, setExperience] = useState(initial?.experience ?? null);
  const [goals, setGoals] = useState(initial?.goals ?? []);
  const ready = role && kidsAges && experience;
  const toggleGoal = (g) => setGoals((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));

  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onNext({ role, kids_ages: kidsAges, experience, goals });
      }}
    >
      <Question label="Who's setting this up?">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={role === r.value}
              onClick={() => setRole(r.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border p-4 text-[15px] font-semibold transition-all active:scale-[0.98]",
                role === r.value ? "border-ios-green bg-ios-green/10 ring-2 ring-ios-green" : "bg-background/50 hover:bg-accent"
              )}
            >
              <span className="text-3xl" aria-hidden="true">{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>
      </Question>

      <Question label="How old are the kids who'll talk to the plant?" hint="The plant adjusts how it explains things">
        <div className="flex flex-wrap gap-2">
          {KIDS_AGES.map((a) => (
            <Chip key={a.value} selected={kidsAges === a.value} onClick={() => setKidsAges(a.value)}>{a.label}</Chip>
          ))}
        </div>
      </Question>

      <Question label="Plant experience">
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE.map((x) => (
            <Chip key={x.value} selected={experience === x.value} onClick={() => setExperience(x.value)}>{x.label}</Chip>
          ))}
        </div>
      </Question>

      <Question label="What are you hoping for?" hint="Pick any">
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => {
            const on = goals.includes(g.value);
            return (
              <Chip key={g.value} selected={on} onClick={() => toggleGoal(g.value)}>
                {on && <Check className="size-4" />} {g.label}
              </Chip>
            );
          })}
        </div>
      </Question>

      <Button type="submit" disabled={!ready} className="h-12 rounded-full text-base font-semibold">
        Continue
      </Button>
    </form>
  );
}

function PlacePicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border bg-background/50 py-2 pr-2 pl-4">
        <span className="flex items-center gap-2 text-[15px]">
          <MapPin className="size-4 text-ios-red" /> {value.name}
        </span>
        <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Town or city"
          aria-label="Town or city"
          className="h-11 rounded-2xl bg-background/50 px-4 text-[15px]"
        />
        <Button type="button" variant="secondary" className="h-11 rounded-2xl" onClick={search} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />} Find
        </Button>
      </div>
      {error && <p className="text-sm text-ios-red">{error}</p>}
      {results?.length === 0 && <p className="text-sm text-muted-foreground">No places found. Try a nearby city.</p>}
      {results?.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border bg-background/50">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`} className="border-b last:border-b-0">
              <button type="button" onClick={() => onChange(r)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] hover:bg-accent">
                <MapPin className="size-4 text-muted-foreground" /> {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function YourPlant({ onBack, onSubmit, saving, error }) {
  const [name, setName] = useState("Sprout");
  const [species, setSpecies] = useState("");
  const [indoors, setIndoors] = useState(true);
  const [place, setPlace] = useState(null);
  const [deviceId, setDeviceId] = useState("plant-1");
  const validId = PLANT_ID.test(deviceId);
  const ready = name.trim() && validId && !saving;

  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSubmit({
          id: deviceId,
          name: name.trim(),
          species: species.trim() || null,
          indoors,
          location_name: place?.name ?? null,
          lat: place?.lat ?? null,
          lon: place?.lon ?? null,
        });
      }}
    >
      <Question label="What's your plant's name?">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          aria-label="Plant name"
          className="h-12 rounded-2xl bg-background/50 px-4 font-rounded text-xl font-bold md:text-xl"
        />
      </Question>

      <Question label="What kind of plant is it?" hint="Optional">
        <Input
          value={species}
          onChange={(e) => setSpecies(e.target.value)}
          maxLength={60}
          placeholder="e.g. Basil"
          aria-label="Kind of plant"
          className="h-11 rounded-2xl bg-background/50 px-4 text-[15px]"
        />
        <div className="flex flex-wrap gap-1.5">
          {SPECIES.map((s) => (
            <Chip key={s} selected={species === s} onClick={() => setSpecies(s)} className="px-3 py-1 text-[13px]">{s}</Chip>
          ))}
        </div>
      </Question>

      <Question label="Where does it live?">
        <div className="flex gap-2">
          <Chip selected={indoors} onClick={() => setIndoors(true)}>🏠 Indoors</Chip>
          <Chip selected={!indoors} onClick={() => setIndoors(false)}>🌳 Outdoors</Chip>
        </div>
      </Question>

      <Question label="Nearest town" hint="So the plant can check for rain">
        <PlacePicker value={place} onChange={setPlace} />
      </Question>

      <Question label="Device ID" hint="PLANT_ID in the Pi's .env">
        <Input
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value.trim())}
          aria-label="Device ID"
          aria-invalid={!validId}
          className="h-11 rounded-2xl bg-background/50 px-4 font-mono text-[15px]"
        />
        {!validId && <p className="text-sm text-ios-red">Letters, numbers, - and _ only.</p>}
      </Question>

      {error && <p className="rounded-2xl bg-ios-red/10 px-4 py-2.5 text-sm text-ios-red">{error}</p>}

      <div className="flex gap-2">
        {onBack && (
          <Button type="button" variant="secondary" className="h-12 rounded-full px-5" onClick={onBack} aria-label="Back">
            <ChevronLeft />
          </Button>
        )}
        <Button type="submit" disabled={!ready} className="h-12 flex-1 rounded-full text-base font-semibold">
          {saving && <Loader2 className="animate-spin" />} Meet {name.trim() || "your plant"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The intake form: "About you" (stored on the user), then "Your plant" (claims the Pi's plant id).
 * `user` is /me's user row; people who already answered step 1 start at step 2 (e.g. adding a plant).
 */
export default function Onboarding({ user, onDone, onCancel }) {
  const onboarded = !!user?.onboarded_at;
  const [step, setStep] = useState(onboarded ? 2 : 1);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const finish = async (plant) => {
    setSaving(true);
    setError(null);
    try {
      if (profile) await saveProfile(profile);
      onDone(await claimPlant(plant));
    } catch (e) {
      setError(e.status === 409 ? `"${plant.id}" is already connected to another account. Check the device ID.` : e.message);
      setSaving(false);
    }
  };

  return (
    <CenteredScreen>
      <section className="glass flex w-full max-w-xl flex-col gap-6 rounded-[28px] p-6 sm:p-8">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            {onboarded ? <span /> : <Steps step={step} />}
            {onCancel && (
              <Button variant="ghost" size="sm" className="rounded-full" onClick={onCancel}>Cancel</Button>
            )}
          </div>
          <h1 className="font-rounded text-3xl font-extrabold tracking-tight">
            {step === 1 ? "Welcome to Smarty Plants 🌱" : onboarded ? "Add a plant" : "Now, your plant"}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {step === 1
              ? "A few quick questions so your plant knows who it's talking to."
              : "Give it a name and tell us a bit about where it grows."}
          </p>
        </header>

        {step === 1 ? (
          <AboutYou
            initial={profile ?? user}
            onNext={(p) => {
              setProfile(p);
              setStep(2);
            }}
          />
        ) : (
          <YourPlant onBack={onboarded ? null : () => setStep(1)} onSubmit={finish} saving={saving} error={error} />
        )}
      </section>
    </CenteredScreen>
  );
}
