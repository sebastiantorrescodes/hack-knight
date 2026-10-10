import { useCallback, useEffect, useState } from "react";
import { ClerkLoading, Show, SignOutButton } from "@clerk/react";
import { Loader2, RotateCw } from "lucide-react";
import { getMe } from "./api";
import { PlantProvider } from "./PlantContext";
import Dashboard from "./Dashboard";
import Onboarding from "./auth/Onboarding";
import SignInScreen from "./auth/SignInScreen";
import { CenteredScreen } from "./components/Mesh";
import { Button } from "@/components/ui/button";

function loadSelected() {
  try {
    return localStorage.getItem("plantId");
  } catch {
    return null;
  }
}

function saveSelected(id) {
  try {
    localStorage.setItem("plantId", id);
  } catch {
    // private mode etc.: the first plant is shown next time
  }
}

const Spinner = () => (
  <CenteredScreen>
    <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Loading" />
  </CenteredScreen>
);

/** Signed in: load the person and their plants, then onboarding or the dashboard. */
function Home() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState(loadSelected);

  const load = useCallback(() => {
    setError(null);
    return getMe().then(setMe, setError);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const select = (id) => {
    setSelectedId(id);
    saveSelected(id);
  };

  if (error) {
    return (
      <CenteredScreen>
        <section className="glass flex max-w-md flex-col items-center gap-3 rounded-3xl p-7 text-center">
          <span className="text-5xl" aria-hidden="true">🥀</span>
          <h1 className="font-rounded text-2xl font-extrabold">Can't reach the garden</h1>
          <p className="text-[15px] text-muted-foreground">{error.message}</p>
          <div className="flex gap-2">
            <Button className="rounded-full" onClick={load}><RotateCw /> Try again</Button>
            <SignOutButton>
              <Button variant="secondary" className="rounded-full">Sign out</Button>
            </SignOutButton>
          </div>
        </section>
      </CenteredScreen>
    );
  }
  if (!me) return <Spinner />;

  if (!me.user.onboarded_at || me.plants.length === 0 || adding) {
    return (
      <Onboarding
        user={me.user}
        onCancel={adding ? () => setAdding(false) : undefined}
        onDone={(plant) => {
          select(plant.id);
          setAdding(false);
          load();
        }}
      />
    );
  }

  const plant = me.plants.find((p) => p.id === selectedId) ?? me.plants[0];
  return (
    <PlantProvider key={plant.id} plant={plant}>
      <Dashboard
        plants={me.plants}
        onSelectPlant={select}
        onAddPlant={() => setAdding(true)}
        onPlantChange={(updated) => setMe((m) => ({ ...m, plants: m.plants.map((p) => (p.id === updated.id ? updated : p)) }))}
      />
    </PlantProvider>
  );
}

export default function App() {
  return (
    <>
      <ClerkLoading>
        <Spinner />
      </ClerkLoading>
      <Show when="signed-out">
        <SignInScreen />
      </Show>
      <Show when="signed-in">
        <Home />
      </Show>
    </>
  );
}
