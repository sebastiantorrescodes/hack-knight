import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  CloudRain,
  Droplet,
  Droplets,
  GraduationCap,
  Heart,
  MessageCircle,
  ShieldCheck,
  Sprout,
  Sun,
  Video,
  Volume2,
} from "lucide-react";
import Mesh from "./components/Mesh";
import PlantFace from "./components/PlantFace";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: Sprout,
    iconClass: "bg-ios-green",
    title: "Sense",
    text: "A soil moisture sensor, a light sensor and a camera watch the plant around the clock and report back every few seconds.",
  },
  {
    icon: Brain,
    iconClass: "bg-ios-indigo",
    title: "Think",
    text: "An AI agent reads the sensors, looks at the plant's photos and checks the local weather forecast to work out what it needs.",
  },
  {
    icon: Droplets,
    iconClass: "bg-ios-blue",
    title: "Care",
    text: "When the soil is thirsty, a little robotic arm tips water into the pot, and the plant tells you all about it.",
  },
];

const FEATURES = [
  {
    icon: MessageCircle,
    iconClass: "bg-ios-green",
    title: "A plant that talks back",
    text: "Kids chat with their plant and it answers in its own personality: how it's feeling, what it needs, and why.",
  },
  {
    icon: Volume2,
    iconClass: "bg-ios-indigo",
    title: "With a real voice",
    text: "Tap the speaker and the plant reads its answers out loud, so even early readers can join in.",
  },
  {
    icon: Video,
    iconClass: "bg-ios-red",
    title: "Check in from anywhere",
    text: "At school, at grandma's or on vacation, a live camera and live readings show exactly how the plant is doing.",
  },
  {
    icon: Droplet,
    iconClass: "bg-ios-blue",
    title: "Water with one message",
    text: "Ask the plant for a drink and it pours itself one. If it's already had plenty, it explains why and asks if you're sure.",
  },
  {
    icon: CloudRain,
    iconClass: "bg-ios-teal",
    title: "Saves water",
    text: "The AI checks the forecast and skips watering when rain is coming, and a counter shows how much water was saved.",
  },
  {
    icon: BarChart3,
    iconClass: "bg-ios-orange",
    title: "Real science, real data",
    text: "Charts of moisture, sunlight and leaf growth over days and weeks turn plant care into a hands-on science project.",
  },
];

const LESSONS = [
  { icon: Droplet, text: "How roots drink, and why too much water hurts as much as too little" },
  { icon: Sun, text: "How sunlight feeds a plant through photosynthesis" },
  { icon: BarChart3, text: "How to read a chart and spot patterns in real data" },
  { icon: Heart, text: "Responsibility and patience from caring for something alive" },
];

function IconBadge({ icon: Icon, className }) {
  return (
    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm ${className}`}>
      <Icon className="size-5" />
    </span>
  );
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[13px] font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="mt-2 font-rounded text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-[17px] text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Public home page for signed-out visitors; onStart opens the sign-in screen. */
export default function Landing({ onStart }) {
  return (
    <>
      <Mesh />

      <header className="sticky top-0 z-10 px-4 pt-3">
        <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-full py-2 pr-2 pl-5">
          <span className="flex items-center gap-2 font-rounded text-xl font-extrabold tracking-tight">
            <span aria-hidden="true">🌱</span> Smarty Plants
          </span>
          <Button className="rounded-full" onClick={onStart}>Sign in</Button>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-12 sm:px-6 lg:min-h-[calc(100dvh-76px)] lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-8">
          <div className="text-center lg:text-left">
            <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-semibold">
              <GraduationCap className="size-4 text-primary" /> Learn to grow, powered by AI
            </span>
            <h1 className="mt-6 font-rounded text-[44px] leading-[1.02] font-extrabold tracking-tight sm:text-7xl xl:text-[88px]">
              Grow a plant that <span className="text-primary">talks back.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[18px] leading-relaxed text-muted-foreground sm:text-xl lg:mx-0">
              Smarty Plants turns any houseplant into a friendly, talking garden buddy. Kids learn how to grow and
              care for living things, and an AI keeps watch, even when nobody's home.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button size="lg" className="h-14 rounded-full px-8 text-[17px]" onClick={onStart}>
                Start growing <ArrowRight />
              </Button>
              <Button size="lg" variant="secondary" className="glass h-14 rounded-full px-8 text-[17px]" asChild>
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] pt-14 sm:pt-16">
            <div className="glass-strong absolute top-0 left-0 z-10 max-w-[260px] sm:-left-12 lg:-left-20 rounded-3xl rounded-bl-md px-5 py-3.5 text-[15px] font-medium shadow-lg sm:text-[17px]">
              Hi! My soil feels just right and I'm soaking up the sun ☀️
            </div>
            <div className="glass flex aspect-square w-full items-end justify-center rounded-[48px] px-6 pb-[8%]">
              <PlantFace mood="happy" className="w-[72%]" />
            </div>
            <div className="glass-strong absolute bottom-[30%] left-0 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold shadow-lg sm:-left-8 sm:text-[15px]">
              <Sun className="size-5 text-ios-orange" /> Sunshine: bright
            </div>
            <div className="glass-strong absolute right-0 bottom-[10%] flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold shadow-lg sm:-right-8 sm:text-[15px]">
              <Droplet className="size-5 text-ios-blue" /> Soil: just right
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-24 px-4 py-16">
          <SectionHeading eyebrow="How it works" title="Real sensors. A real robot. A really smart plant.">
            A small computer sits next to the pot, connecting the plant to an AI that understands what it needs.
          </SectionHeading>
          <ol className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="glass rounded-3xl p-6">
                <div className="flex items-center gap-3">
                  <IconBadge icon={s.icon} className={s.iconClass} />
                  <span className="text-[13px] font-semibold text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 font-rounded text-2xl font-extrabold">{s.title}</h3>
                <p className="mt-2 text-[15px] text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="px-4 py-16">
          <SectionHeading eyebrow="Features" title="Everything a young gardener needs">
            Fun enough that kids want to check in every day. Smart enough that the plant thrives while they're away.
          </SectionHeading>
          <div className="mx-auto mt-12 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="glass rounded-3xl p-6">
                <IconBadge icon={f.icon} className={f.iconClass} />
                <h3 className="mt-4 text-[18px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Learning */}
        <section className="px-4 py-16">
          <div className="glass mx-auto grid max-w-6xl gap-10 rounded-[36px] p-8 md:grid-cols-2 md:p-12">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-widest text-primary">Built for curious kids</p>
              <h2 className="mt-2 font-rounded text-3xl font-extrabold tracking-tight sm:text-4xl">
                Every day is a science lesson
              </h2>
              <p className="mt-3 text-[17px] text-muted-foreground">
                Instead of just reminding kids to water, Smarty Plants explains the why. Every reading becomes a
                question kids can ask, and every answer helps them understand how living things grow.
              </p>
              <div className="mt-6 flex flex-col gap-3 text-[15px]">
                <p className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span><strong>Grown-ups stay in charge.</strong> Secure sign-in, and the plant asks before it does anything it doesn't need.</span>
                </p>
                <p className="flex items-start gap-3">
                  <Bell className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span><strong>Phone alerts</strong> when the plant needs attention, so nothing gets forgotten.</span>
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              <li className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
                <BookOpen className="size-4" /> What kids learn
              </li>
              {LESSONS.map((l) => (
                <li key={l.text} className="glass-strong flex items-center gap-4 rounded-2xl p-4 text-[15px] font-medium">
                  <IconBadge icon={l.icon} className="bg-ios-green" />
                  {l.text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Call to action */}
        <section className="px-4 pt-8 pb-20 text-center">
          <div className="text-6xl" aria-hidden="true">🌻</div>
          <h2 className="mt-3 font-rounded text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to meet your plant?</h2>
          <p className="mx-auto mt-3 max-w-lg text-[17px] text-muted-foreground">
            Sign in, tell us about your plant, and say hello. It's been waiting to talk to you.
          </p>
          <Button size="lg" className="mt-7 h-12 rounded-full px-7 text-[16px]" onClick={onStart}>
            Start growing <ArrowRight />
          </Button>
        </section>
      </main>

      <footer className="px-4 pb-10 text-center text-[13px] text-muted-foreground">
        🌱 Smarty Plants · Made at Hack Knight 2026
      </footer>
    </>
  );
}
