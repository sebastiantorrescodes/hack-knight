import { KeyRound } from "lucide-react";
import { CenteredScreen } from "../components/Mesh";

/** Shown when VITE_CLERK_PUBLISHABLE_KEY is missing, so a fresh checkout explains itself. */
export default function SetupNeeded() {
  return (
    <CenteredScreen>
      <section className="glass flex max-w-md flex-col gap-4 rounded-3xl p-7">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-ios-orange text-white shadow-sm">
          <KeyRound className="size-6" />
        </span>
        <h1 className="font-rounded text-2xl font-extrabold tracking-tight">Almost there: add your Clerk key</h1>
        <ol className="list-decimal space-y-2 pl-5 text-[15px] text-muted-foreground">
          <li>Create an application at dashboard.clerk.com.</li>
          <li>
            Copy its <strong className="text-foreground">publishable key</strong> (starts with <code>pk_</code>).
          </li>
          <li>
            Put it in <code>frontend/.env</code> as <code>VITE_CLERK_PUBLISHABLE_KEY</code> and in{" "}
            <code>backend/.env</code> as <code>CLERK_PUBLISHABLE_KEY</code>.
          </li>
          <li>Restart <code>npm run dev</code> and the backend.</li>
        </ol>
      </section>
    </CenteredScreen>
  );
}
