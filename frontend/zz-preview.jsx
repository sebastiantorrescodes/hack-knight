import { createRoot } from "react-dom/client";
import Onboarding from "./src/auth/Onboarding";
import SetupNeeded from "./src/auth/SetupNeeded";
import "./src/styles.css";
const which = location.hash;
createRoot(document.getElementById("root")).render(
  which === "#setup" ? <SetupNeeded /> : <Onboarding user={which === "#step2" ? { onboarded_at: "x" } : { onboarded_at: null }} onDone={() => {}} />
);
