const INK = "#3b2a20";

const EYES = {
  happy: (
    <>
      <path d="M68 158 Q78 146 88 158" />
      <path d="M112 158 Q122 146 132 158" />
    </>
  ),
  okay: (
    <>
      <circle cx="78" cy="154" r="7" fill={INK} stroke="none" />
      <circle cx="122" cy="154" r="7" fill={INK} stroke="none" />
    </>
  ),
  thirsty: (
    <>
      <path d="M68 156 L88 156" />
      <path d="M112 156 L132 156" />
      <path d="M68 146 L86 150" />
      <path d="M132 146 L114 150" />
    </>
  ),
  soggy: (
    <>
      <path d="M70 148 L86 162 M86 148 L70 162" />
      <path d="M114 148 L130 162 M130 148 L114 162" />
    </>
  ),
  sleepy: (
    <>
      <path d="M68 154 Q78 162 88 154" />
      <path d="M112 154 Q122 162 132 154" />
    </>
  ),
  offline: (
    <>
      <circle cx="78" cy="154" r="5" fill={INK} stroke="none" />
      <circle cx="122" cy="154" r="5" fill={INK} stroke="none" />
    </>
  ),
};

const MOUTHS = {
  happy: <path d="M82 174 Q100 196 118 174 Z" fill="#c0392b" />,
  okay: <path d="M86 178 Q100 190 114 178" />,
  thirsty: <path d="M86 188 Q100 176 114 188" />,
  soggy: <path d="M80 184 q5 -7 10 0 q5 7 10 0 q5 -7 10 0 q5 7 10 0" />,
  sleepy: <circle cx="100" cy="182" r="5" fill={INK} stroke="none" />,
  offline: <path d="M88 182 L112 182" />,
};

/** The plant character: a pot with a face and leaves that change with its mood. */
export default function PlantFace({ mood }) {
  const droopy = mood === "thirsty";
  const leaf = droopy ? "#b5a642" : "#4caf50";
  const leafDark = droopy ? "#8f8233" : "#2e7d32";

  return (
    <svg className={`plant-face mood-${mood} h-auto w-[min(300px,80%)] drop-shadow-xl`} viewBox="0 0 200 230" role="img" aria-label={`The plant looks ${mood}`}>
      <g className="leaves" style={{ transformOrigin: "100px 108px" }}>
        <path d="M100 108 C100 80 100 60 100 40" stroke={leafDark} strokeWidth="6" fill="none" strokeLinecap="round" />
        <g className="leaf-left" style={{ transformOrigin: "100px 78px" }}>
          <ellipse cx="72" cy="70" rx="30" ry="15" fill={leaf} transform="rotate(-25 72 70)" />
        </g>
        <g className="leaf-right" style={{ transformOrigin: "100px 62px" }}>
          <ellipse cx="128" cy="54" rx="30" ry="15" fill={leaf} transform="rotate(25 128 54)" />
        </g>
        <ellipse cx="100" cy="32" rx="12" ry="20" fill={leaf} />
      </g>

      <rect x="28" y="104" width="144" height="24" rx="10" fill="#d4664a" />
      <path d="M40 126 L160 126 L148 218 Q147 224 140 224 L60 224 Q53 224 52 218 Z" fill="#e07a5f" />

      {(mood === "happy" || mood === "okay") && (
        <>
          <circle cx="62" cy="174" r="9" fill="#f4a3a3" opacity="0.8" />
          <circle cx="138" cy="174" r="9" fill="#f4a3a3" opacity="0.8" />
        </>
      )}
      <g stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none">
        {EYES[mood]}
        {MOUTHS[mood]}
      </g>

      {mood === "soggy" && <path className="sweat" d="M150 140 Q156 152 150 158 Q144 152 150 140 Z" fill="#4fc3f7" />}
      {mood === "sleepy" && (
        <text className="zzz" x="146" y="100" fontSize="22" fontWeight="700" fill="#5c6bc0">
          z<tspan dx="2" dy="-10" fontSize="16">z</tspan>
        </text>
      )}
      {mood === "offline" && (
        <text x="150" y="108" fontSize="30" fontWeight="700" fill="#9e9e9e">?</text>
      )}
    </svg>
  );
}
