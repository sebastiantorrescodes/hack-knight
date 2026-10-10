import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import SetupNeeded from "./auth/SetupNeeded";
import "./styles.css";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Clerk's sign-in and account UI: solid white cards in the iOS style, in light and dark mode alike
const appearance = {
  variables: {
    colorPrimary: "#34c759",
    colorBackground: "#ffffff",
    colorForeground: "#1c1c1e",
    colorMutedForeground: "#6e6e73",
    colorInput: "#f2f2f7",
    colorInputForeground: "#1c1c1e",
    colorNeutral: "#1c1c1e",
    borderRadius: "14px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI Variable Text", system-ui, sans-serif',
  },
  elements: {
    cardBox: "bg-white! rounded-[28px]! shadow-2xl! border-0!",
    card: "bg-white! shadow-none!",
    footer: "bg-white! bg-none!",
    userButtonPopoverCard: "bg-white!",
    userButtonPopoverFooter: "bg-white! bg-none!",
  },
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {CLERK_KEY ? (
      <ClerkProvider publishableKey={CLERK_KEY} appearance={appearance}>
        <App />
      </ClerkProvider>
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>
);
