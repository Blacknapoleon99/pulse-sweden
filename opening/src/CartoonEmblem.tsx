import { useMemo } from "react";
import * as THREE from "three";
import { eyePose, type OpeningVariant } from "./timing";
function Orb({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale?: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[1, 40, 32]} />
      <meshStandardMaterial color={color} roughness={0.24} metalness={0.04} />
    </mesh>
  );
}
export function CartoonLighting() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[-4, 6, 8]} intensity={3} />
      <directionalLight position={[5, -2, 5]} color="#9FD4FF" intensity={1.5} />
    </>
  );
}
export function CartoonEmblem({
  frame,
  variant = "icon",
}: {
  frame: number;
  variant?: OpeningVariant;
}) {
  const pose = eyePose(frame, variant);
  const triangle = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.95);
    shape.lineTo(-1.85, -1.3);
    shape.quadraticCurveTo(-1.97, -1.5, -1.7, -1.5);
    shape.lineTo(1.7, -1.5);
    shape.quadraticCurveTo(1.97, -1.5, 1.85, -1.3);
    shape.lineTo(0.16, 1.95);
    shape.quadraticCurveTo(0.08, 2.1, 0, 1.95);
    return shape;
  }, []);
  const outline = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(0, 2.02, 0.08),
          new THREE.Vector3(-1.9, -1.47, 0.08),
          new THREE.Vector3(1.9, -1.47, 0.08),
        ],
        true,
        "catmullrom",
        0.08,
      ),
    [],
  );
  const period = variant === "icon" ? 149 : 201,
    float = Math.sin((frame / period) * Math.PI * 2) * 0.045;
  return (
    <group
      position={[0, float, 0]}
      rotation={[0, Math.sin((frame / period) * Math.PI * 2) * 0.035, 0]}
    >
      <mesh position={[0, 0, -0.25]}>
        <extrudeGeometry
          args={[
            triangle,
            {
              depth: 0.2,
              bevelEnabled: true,
              bevelSize: 0.1,
              bevelThickness: 0.1,
              bevelSegments: 5,
              steps: 1,
            },
          ]}
        />
        <meshStandardMaterial
          color="#5AABF7"
          roughness={0.34}
          metalness={0.05}
        />
      </mesh>
      <mesh>
        <tubeGeometry args={[outline, 96, 0.105, 12, true]} />
        <meshStandardMaterial
          color="#F5CC71"
          roughness={0.25}
          metalness={0.28}
        />
      </mesh>
      <group
        position={[0, 0.05, 0.18]}
        scale={[1, Math.max(0.045, pose.open), 1]}
      >
        <Orb
          position={[0, 0, 0.04]}
          scale={[1.43, 0.79, 0.44]}
          color="#D5EAFF"
        />
        <Orb
          position={[0, 0.035, 0.12]}
          scale={[1.33, 0.71, 0.45]}
          color="#FFFFFF"
        />
        <group position={[pose.gazeX * 2.1, pose.gazeY * 1.5, 0.51]}>
          <Orb
            position={[0, 0, 0]}
            scale={[0.56, 0.58, 0.16]}
            color="#1E64BC"
          />
          <Orb
            position={[0, 0.015, 0.09]}
            scale={[0.43, 0.45, 0.09]}
            color="#39A4F5"
          />
          <Orb
            position={[0, 0.01, 0.16]}
            scale={[0.25, 0.3, 0.055]}
            color="#142942"
          />
          <Orb
            position={[-0.14, 0.2, 0.207]}
            scale={[0.105, 0.12, 0.025]}
            color="#FFFFFF"
          />
          <Orb
            position={[0.13, -0.11, 0.213]}
            scale={[0.04, 0.05, 0.02]}
            color="#C5EDFF"
          />
        </group>
      </group>
      <Orb
        position={[-0.66, 0.92, 0.28]}
        scale={[0.4, 0.055, 0.075]}
        color="#1A63B1"
      />
      <Orb
        position={[0.66, 0.92, 0.28]}
        scale={[0.4, 0.055, 0.075]}
        color="#1A63B1"
      />
      <Orb
        position={[-1.55, -1.24, 0.16]}
        scale={[0.16, 0.16, 0.16]}
        color="#FAD98B"
      />
      <Orb
        position={[1.55, -1.24, 0.16]}
        scale={[0.16, 0.16, 0.16]}
        color="#FAD98B"
      />
      <Orb
        position={[0, 1.72, 0.13]}
        scale={[0.16, 0.16, 0.16]}
        color="#FAD98B"
      />
    </group>
  );
}
