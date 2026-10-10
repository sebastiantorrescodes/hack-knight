import { SignIn } from "@clerk/react";
import { ChevronLeft } from "lucide-react";
import { CenteredScreen } from "../components/Mesh";
import { Button } from "@/components/ui/button";

export default function SignInScreen({ onBack }) {
  const back = () => {
    // Drop Clerk's #/... step so the landing page doesn't send us straight back here
    history.replaceState(null, "", window.location.pathname + window.location.search);
    onBack();
  };

  return (
    <CenteredScreen>
      {onBack && (
        <Button variant="secondary" className="glass fixed top-4 left-4 rounded-full" onClick={back}>
          <ChevronLeft /> Home
        </Button>
      )}
      <div className="text-center">
        <div className="text-6xl" aria-hidden="true">🌱</div>
        <h1 className="mt-2 font-rounded text-4xl font-extrabold tracking-tight">Smarty Plants</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Learn to grow with a plant that talks back.</p>
      </div>
      <SignIn routing="hash" withSignUp />
    </CenteredScreen>
  );
}
