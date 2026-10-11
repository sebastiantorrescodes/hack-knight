import { createRoot } from "react-dom/client";
import PlantFace3D from "./src/components/PlantFace3D";
import "./src/styles.css";
const moods = ["happy", "okay", "thirsty", "soggy", "sleepy", "offline"];
createRoot(document.getElementById("root")).render(
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 300px)", gap: 8, padding: 8 }}>
    {moods.map((m) => <div key={m} style={{ background: "#fff", borderRadius: 16, textAlign: "center", font: "14px sans-serif" }}>{m}<PlantFace3D mood={m} className="w-[300px]" /></div>)}
  </div>
);
