import { Component, lazy, Suspense } from "react";
import PlantFace from "./PlantFace";

// three.js is large, so the 3D plant loads on demand; the flat SVG shows meanwhile
const PlantFace3D = lazy(() => import("./PlantFace3D"));

const webgl = (() => {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
})();

/** If the 3D scene throws (lost GL context, old driver), show the SVG instead of a broken box. */
class FallbackOnError extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The plant character: 3D where WebGL works, otherwise the SVG PlantFace. Takes PlantFace's props. */
export default function PlantAvatar(props) {
  const flat = <PlantFace {...props} />;
  if (!webgl) return flat;
  return (
    <FallbackOnError fallback={flat}>
      <Suspense fallback={flat}>
        <PlantFace3D {...props} />
      </Suspense>
    </FallbackOnError>
  );
}
