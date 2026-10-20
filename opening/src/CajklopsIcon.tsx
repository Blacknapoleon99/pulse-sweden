import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { CartoonEmblem, CartoonLighting } from "./CartoonEmblem";
export function CajklopsIcon() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 45% 38%, #FFFFFF, #E8F2FF 75%)",
      }}
    >
      <ThreeCanvas
        width={480}
        height={480}
        camera={{ position: [0, 0.15, 6.35], fov: 42 }}
        gl={{
          alpha: true,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
        dpr={1}
      >
        <CartoonLighting />
        <CartoonEmblem frame={frame} variant="icon" />
      </ThreeCanvas>
    </AbsoluteFill>
  );
}
