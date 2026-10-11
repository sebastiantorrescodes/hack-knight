import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";

// The 3D version of PlantFace: same moods, same face. Faces are drawn in PlantFace's SVG coordinates
// (viewBox 200x230) and wrapped onto the front of the pot, so both versions keep the same expressions.

const INK = "#3b2a20";
const POT_HEIGHT = 1.3;
const POT_TOP_R = 1;
const POT_BOTTOM_R = 0.75;
const FACE_Y = -0.05; // pot-space height of SVG y=165, the middle of the face
const SVG_SCALE = 0.012; // SVG units -> world units
const STROKE_R = 0.032; // SVG strokeWidth 5, halved and scaled

const LEAF = { normal: "#4caf50", thirsty: "#b5a642", offline: "#9e9e9e" };
const STEM = { normal: "#2e7d32", thirsty: "#8f8233", offline: "#757575" };

const inkMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.4 });
const mouthMat = new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.5, side: THREE.DoubleSide });
const cheekMat = new THREE.MeshStandardMaterial({ color: "#f4a3a3", roughness: 0.8, transparent: true, opacity: 0.85 });

function potRadius(y) {
  return POT_BOTTOM_R + ((y + POT_HEIGHT / 2) / POT_HEIGHT) * (POT_TOP_R - POT_BOTTOM_R);
}

/** An SVG point on the face -> a point just above the pot's curved front. */
function onPot(x, y, lift = 0.02) {
  const X = (x - 100) * SVG_SCALE;
  const Y = -(y - 165) * SVG_SCALE + FACE_Y;
  const r = potRadius(Y) + lift;
  return new THREE.Vector3(X, Y, Math.sqrt(Math.max(r * r - X * X, 0)));
}

// Path helpers in SVG coordinates, sampled finely so strokes hug the curve of the pot
function line(x0, y0, x1, y1, n = 8) {
  return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
}
function quad(x0, y0, cx, cy, x1, y1, n = 14) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
  });
}

const stroke = (pts) => ({ type: "stroke", pts });
const dot = (x, y, r, material = inkMat) => ({ type: "dot", x, y, r, material });

// Mirrors EYES and MOUTHS in PlantFace.jsx
const EYES = {
  happy: [stroke(quad(68, 158, 78, 146, 88, 158)), stroke(quad(112, 158, 122, 146, 132, 158))],
  okay: [dot(78, 154, 7), dot(122, 154, 7)],
  thirsty: [
    stroke(line(68, 156, 88, 156)),
    stroke(line(112, 156, 132, 156)),
    stroke(line(68, 146, 86, 150)),
    stroke(line(132, 146, 114, 150)),
  ],
  soggy: [
    stroke(line(70, 148, 86, 162)),
    stroke(line(86, 148, 70, 162)),
    stroke(line(114, 148, 130, 162)),
    stroke(line(130, 148, 114, 162)),
  ],
  sleepy: [stroke(quad(68, 154, 78, 162, 88, 154)), stroke(quad(112, 154, 122, 162, 132, 154))],
  offline: [dot(78, 154, 5), dot(122, 154, 5)],
};

const MOUTHS = {
  happy: [{ type: "smile" }, stroke([...quad(82, 174, 100, 196, 118, 174), ...line(118, 174, 82, 174)])],
  okay: [stroke(quad(86, 178, 100, 190, 114, 178))],
  thirsty: [stroke(quad(86, 188, 100, 176, 114, 188))],
  soggy: [
    stroke([
      ...quad(80, 184, 85, 177, 90, 184),
      ...quad(90, 184, 95, 191, 100, 184),
      ...quad(100, 184, 105, 177, 110, 184),
      ...quad(110, 184, 115, 191, 120, 184),
    ]),
  ],
  sleepy: [dot(100, 182, 5)],
  offline: [stroke(line(88, 182, 112, 182))],
};

/** A round-capped tube through 3D points. */
function Tube({ points, radius = STROKE_R, material = inkMat }) {
  const geometry = useMemo(() => {
    const path = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++) {
      if (!points[i].equals(points[i - 1])) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    }
    return new THREE.TubeGeometry(path, points.length * 2, radius, 8, false);
  }, [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <>
      <mesh geometry={geometry} material={material} />
      {[points[0], points[points.length - 1]].map((p, i) => (
        <mesh key={i} position={p} material={material}>
          <sphereGeometry args={[radius, 10, 8]} />
        </mesh>
      ))}
    </>
  );
}

/** A filled disc lying flat on the pot, like an SVG circle. */
function Dot({ x, y, r, material }) {
  const p = onPot(x, y, 0.01);
  return (
    <mesh position={p} rotation={[0, Math.atan2(p.x, p.z), 0]} scale={[1, 1, 0.4]} material={material}>
      <sphereGeometry args={[r * SVG_SCALE, 20, 14]} />
    </mesh>
  );
}

/** The open happy mouth, a filled shape bent onto the pot. */
function Smile() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(82, 174);
    shape.quadraticCurveTo(100, 196, 118, 174);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape, 16);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = onPot(pos.getX(i), pos.getY(i), 0.012);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={mouthMat} />;
}

function Face({ mood }) {
  const parts = [...(EYES[mood] ?? EYES.okay), ...(MOUTHS[mood] ?? MOUTHS.okay)];
  const cheeks = mood === "happy" || mood === "okay";
  return (
    <group>
      {parts.map((part, i) => {
        if (part.type === "dot") return <Dot key={`${mood}-${i}`} {...part} />;
        if (part.type === "smile") return <Smile key={`${mood}-${i}`} />;
        return <Tube key={`${mood}-${i}`} points={part.pts.map(([x, y]) => onPot(x, y))} />;
      })}
      {cheeks && (
        <>
          <Dot x={62} y={174} r={9} material={cheekMat} />
          <Dot x={138} y={174} r={9} material={cheekMat} />
        </>
      )}
    </group>
  );
}

function Pot() {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[POT_TOP_R, POT_BOTTOM_R, POT_HEIGHT, 48]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.6} />
      </mesh>
      <mesh position={[0, POT_HEIGHT / 2 + 0.1, 0]} castShadow>
        <cylinderGeometry args={[1.12, 1.08, 0.32, 48]} />
        <meshStandardMaterial color="#d4664a" roughness={0.6} />
      </mesh>
      <mesh position={[0, POT_HEIGHT / 2 + 0.24, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.06, 48]} />
        <meshStandardMaterial color="#5d4037" roughness={1} />
      </mesh>
    </group>
  );
}

/** Stem and three leaves; leaves droop and fade to yellow when thirsty, grey when offline. */
function Leaves({ mood }) {
  const left = useRef();
  const right = useRef();
  const top = useRef();
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ color: LEAF.normal, roughness: 0.45 }), []);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STEM.normal, roughness: 0.6 }), []);
  useEffect(
    () => () => {
      leafMat.dispose();
      stemMat.dispose();
    },
    [leafMat, stemMat],
  );

  const tone = mood === "thirsty" || mood === "offline" ? mood : "normal";
  const leafColor = useMemo(() => new THREE.Color(LEAF[tone]), [tone]);
  const stemColor = useMemo(() => new THREE.Color(STEM[tone]), [tone]);
  const droop = mood === "thirsty" ? 1 : mood === "offline" ? 0.4 : 0;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-delta * 3); // frame-rate independent easing
    const flutter = mood === "happy" ? Math.sin(t * 3.5) * 0.08 : Math.sin(t * 1.3) * 0.03;
    left.current.rotation.z += (droop * 0.8 + flutter - left.current.rotation.z) * k;
    right.current.rotation.z += (-droop * 0.8 - flutter - right.current.rotation.z) * k;
    top.current.rotation.z += (droop * 0.5 + flutter * 0.5 - top.current.rotation.z) * k;
    leafMat.color.lerp(leafColor, k);
    stemMat.color.lerp(stemColor, k);
  });

  return (
    <group position={[0, POT_HEIGHT / 2 + 0.25, 0]}>
      <mesh position={[0, 0.6, 0]} material={stemMat} castShadow>
        <cylinderGeometry args={[0.045, 0.06, 1.2, 12]} />
      </mesh>
      <group ref={left} position={[0, 0.5, 0]}>
        <mesh position={[-0.4, 0.12, 0.02]} rotation={[0.15, 0, -0.45]} scale={[0.42, 0.2, 0.08]} material={leafMat} castShadow>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </group>
      <group ref={right} position={[0, 0.78, 0]}>
        <mesh position={[0.4, 0.12, 0.02]} rotation={[0.15, 0, 0.45]} scale={[0.42, 0.2, 0.08]} material={leafMat} castShadow>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </group>
      <group ref={top} position={[0, 1.15, 0]}>
        <mesh position={[0, 0.22, 0]} scale={[0.17, 0.3, 0.09]} material={leafMat} castShadow>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </group>
    </group>
  );
}

function SweatDrop() {
  const ref = useRef();
  useFrame((state) => {
    const t = (state.clock.elapsedTime % 1.6) / 1.6;
    ref.current.position.y = 0.35 - t * 0.5;
    ref.current.material.opacity = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
  });
  return (
    <mesh ref={ref} position={[0.82, 0.35, 0.55]} scale={[0.07, 0.1, 0.07]}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color="#4fc3f7" roughness={0.1} transparent />
    </mesh>
  );
}

const Z_POINTS = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
].map(([x, y]) => new THREE.Vector3(x, y, 0));

function Zzz() {
  const ref = useRef();
  const zMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5c6bc0", transparent: true }), []);
  useEffect(() => () => zMat.dispose(), [zMat]);
  useFrame((state) => {
    const t = (state.clock.elapsedTime % 2.5) / 2.5;
    ref.current.position.y = 1.0 + t * 0.4;
    zMat.opacity = Math.sin(t * Math.PI);
  });
  return (
    <group ref={ref} position={[0.95, 1.0, 0.3]}>
      <group scale={0.1}>
        <Tube points={Z_POINTS} radius={0.18} material={zMat} />
      </group>
      <group position={[0.22, 0.2, 0]} scale={0.07}>
        <Tube points={Z_POINTS} radius={0.18} material={zMat} />
      </group>
    </group>
  );
}

const QUESTION_POINTS = new THREE.CatmullRomCurve3(
  [
    [-0.12, 0.12],
    [-0.05, 0.24],
    [0.08, 0.23],
    [0.12, 0.12],
    [0.02, 0.02],
    [0, -0.08],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
).getPoints(24);

const greyMat = new THREE.MeshStandardMaterial({ color: "#9e9e9e", roughness: 0.5 });

function QuestionMark() {
  return (
    <group position={[0.95, 1.0, 0.3]}>
      <Tube points={QUESTION_POINTS} radius={0.035} material={greyMat} />
      <mesh position={[0, -0.2, 0]} material={greyMat}>
        <sphereGeometry args={[0.045, 12, 10]} />
      </mesh>
    </group>
  );
}

/** Whole-body motion per mood (the CSS animations of the SVG version), plus a slow turn toward the pointer. */
function Plant({ mood }) {
  const body = useRef();
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const g = body.current;
    const k = 1 - Math.exp(-delta * 4);
    let y = 0;
    let tilt = 0;
    let squash = 1;
    let shiver = 0;
    if (mood === "happy") y = Math.abs(Math.sin(t * 3.5)) * 0.15;
    if (mood === "okay") tilt = Math.sin(t * 1.6) * 0.04;
    if (mood === "thirsty") {
      tilt = Math.sin(t) * 0.03;
      y = -0.04;
    }
    if (mood === "soggy") shiver = Math.sin(t * 40) * 0.01;
    if (mood === "sleepy") {
      squash = 1 + Math.sin(t * 1.6) * 0.025;
      tilt = 0.06;
    }

    g.position.y += (y - g.position.y) * (mood === "happy" ? 1 : k);
    g.position.x = shiver;
    g.rotation.z += (tilt - g.rotation.z) * k;
    g.scale.y = squash;
    const turn = state.pointer.x * 0.45 + Math.sin(t * 0.5) * 0.12;
    g.rotation.y += (turn - g.rotation.y) * k;
  });

  return (
    <group ref={body}>
      <Pot />
      <Face mood={mood} />
      <Leaves mood={mood} />
      {mood === "soggy" && <SweatDrop />}
      {mood === "sleepy" && <Zzz />}
      {mood === "offline" && <QuestionMark />}
    </group>
  );
}

/** The plant character in 3D. Same props as PlantFace; load it through PlantAvatar, which falls back to the SVG. */
export default function PlantFace3D({ mood, className = "w-[min(300px,80%)]" }) {
  return (
    <div className={`aspect-[200/230] ${className}`} role="img" aria-label={`The plant looks ${mood}`}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0.9, 6.4], fov: 35 }} gl={{ antialias: true }}>
        <hemisphereLight args={["#fff8ee", "#c9b8a8", 1.1]} />
        <directionalLight position={[3, 5, 4]} intensity={1.8} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, -2]} intensity={0.5} color="#bcd7ff" />
        <group position={[0, -0.75, 0]}>
          <Plant mood={mood} />
          <ContactShadows position={[0, -POT_HEIGHT / 2 - 0.01, 0]} opacity={0.35} scale={4} blur={2.4} far={1.5} />
        </group>
      </Canvas>
    </div>
  );
}
