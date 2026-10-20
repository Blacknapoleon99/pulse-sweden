import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { CartoonEmblem, CartoonLighting } from "./CartoonEmblem";
import { OPENING_FRAMES, type OpeningVariant } from "./timing";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export function CajklopsOpening({
  variant = "cinematic",
}: {
  variant?: OpeningVariant;
}) {
  const frame = useCurrentFrame(),
    everyday = variant === "everyday";
  const entrance = interpolate(frame, [0, 22], [0.85, 1], clamp),
    fade = everyday
      ? 1
      : interpolate(
          frame,
          [0, 12, OPENING_FRAMES - 16, OPENING_FRAMES - 1],
          [0, 1, 1, 0],
          clamp,
        );
  return (
    <AbsoluteFill
      style={{
        background: "#F8FAFD",
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          top: 175,
          left: 10,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, #D7EBFF 0%, #EAF4FF 48%, #F8FAFD 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 160,
          width: 720,
          height: 660,
          opacity: fade,
          transform: `translateY(${(1 - entrance) * 50}px) scale(${entrance})`,
        }}
      >
        <ThreeCanvas
          width={720}
          height={660}
          camera={{ position: [0, 0.1, 8.6], fov: 42 }}
          gl={{
            alpha: true,
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.25,
          }}
          dpr={1}
        >
          <CartoonLighting />
          <CartoonEmblem frame={frame} variant={variant} />
        </ThreeCanvas>
      </div>
      <div
        style={{
          position: "absolute",
          top: 830,
          width: 720,
          textAlign: "center",
          opacity: fade,
          transform: `translateY(${(1 - entrance) * 18}px)`,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: -2,
            color: "#142942",
          }}
        >
          Trygg<span style={{ color: "#176FE1" }}>Puls</span>
        </div>
        <div
          style={{
            marginTop: 17,
            fontSize: 25,
            fontWeight: 700,
            letterSpacing: 6,
            color: "#3884CB",
          }}
        >
          CAJKLOPS
        </div>
        <div style={{ marginTop: 34, fontSize: 22, color: "#64768D" }}>
          Din plats. Din familj. Din överblick.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 1100,
          left: 0,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: 10,
          opacity: fade,
        }}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#176FE1",
              opacity:
                0.3 + 0.7 * (0.5 + 0.5 * Math.sin(frame / 9 - index * 0.9)),
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}
