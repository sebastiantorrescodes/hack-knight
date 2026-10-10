import { SignIn } from "@clerk/react";
import { CenteredScreen } from "../components/Mesh";

export default function SignInScreen() {
  return (
    <CenteredScreen>
      <div className="text-center">
        <div className="text-6xl" aria-hidden="true">🌱</div>
        <h1 className="mt-2 font-rounded text-4xl font-extrabold tracking-tight">Smart Garden</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">A plant that talks back, and saves water while it grows.</p>
      </div>
      <SignIn routing="hash" withSignUp />
    </CenteredScreen>
  );
}
