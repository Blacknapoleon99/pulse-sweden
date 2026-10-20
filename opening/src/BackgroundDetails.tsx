import { useEffect, useMemo } from 'react';
import { Easing, interpolate } from 'remotion';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

const smooth = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) } as const;

function SurveillanceCamera({ frame, font }: { frame: number; font: Font }) {
  const geometry = useMemo(() => {
    const body = new RoundedBoxGeometry(0.54, 0.35, 0.61, 3, 0.045);
    const hood = new RoundedBoxGeometry(0.61, 0.068, 0.77, 3, 0.023);
    const label = new TextGeometry('POLIS', { font, size: 0.065, depth: 0.001, curveSegments: 4 });
    label.computeBoundingBox();
    const box = label.boundingBox!;
    label.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, 0);
    const labelScale = 0.36 / (box.max.x - box.min.x);
    label.scale(labelScale, labelScale, 1);
    return { body, hood, label };
  }, [font]);
  useEffect(() => () => { Object.values(geometry).forEach(g => g.dispose()); }, [geometry]);
  const yaw = interpolate(frame, [0, 30, 54, 78, 106, 131, 155], [-0.48, -0.48, 0.62, 0.62, -0.43, 0.04, 0.20], {
    ...smooth, easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  return <group position={[-2.12, interpolate(frame, [5, 36], [-1.35, 0.05], smooth), -1.50]}>
    <mesh position={[0, 0.3, 0]}>
      <cylinderGeometry args={[0.027, 0.041, 2.88, 20]}/>
      <meshStandardMaterial color="#8d9895" metalness={0.85} roughness={0.38}/>
    </mesh>
    <mesh position={[0, 1.59, 0]}>
      <cylinderGeometry args={[0.062, 0.062, 0.18, 24]}/>
      <meshStandardMaterial color="#293b3a" metalness={0.66} roughness={0.37}/>
    </mesh>
    <mesh position={[0, 0.40, 0]}>
      <cylinderGeometry args={[0.033, 0.033, 0.15, 20]}/>
      <meshStandardMaterial color="#0c4574" metalness={0.4} roughness={0.44}/>
    </mesh>
    <group position={[0, 1.80, 0.025]} rotation={[-0.045 + Math.sin(frame / 23) * 0.035, yaw, 0]}>
      <mesh position={[0, -0.16, -0.075]}>
        <sphereGeometry args={[0.07, 20, 16]}/>
        <meshStandardMaterial color="#3e514e" metalness={0.75} roughness={0.32}/>
      </mesh>
      <mesh geometry={geometry.body}>
        <meshPhysicalMaterial color="#aebdb6" metalness={0.27} roughness={0.39} clearcoat={0.35}/>
      </mesh>
      <mesh geometry={geometry.hood} position={[0, 0.186, 0.02]}>
        <meshPhysicalMaterial color="#c5cfc7" metalness={0.34} roughness={0.34} clearcoat={0.3}/>
      </mesh>
      <mesh position={[0, 0.009, 0.312]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.118, 0.118, 0.043, 36]}/>
        <meshStandardMaterial color="#1e2c2b" metalness={0.72} roughness={0.3}/>
      </mesh>
      <mesh position={[0, 0.009, 0.34]}>
        <torusGeometry args={[0.094, 0.009, 8, 32]}/>
        <meshStandardMaterial color="#849493" metalness={0.9} roughness={0.2}/>
      </mesh>
      <mesh position={[0, 0.009, 0.345]} scale={[1, 1, 0.28]}>
        <sphereGeometry args={[0.069, 24, 20]}/>
        <meshPhysicalMaterial color="#051821" metalness={0.25} roughness={0.06} clearcoat={1} clearcoatRoughness={0.025}/>
      </mesh>
      <mesh position={[-0.021, 0.032, 0.365]}>
        <sphereGeometry args={[0.013, 12, 8]}/>
        <meshBasicMaterial color="#a6d4da"/>
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = i / 8 * Math.PI * 2;
        return <mesh key={i} position={[Math.cos(angle) * 0.093, Math.sin(angle) * 0.093 + 0.009, 0.343]}>
          <sphereGeometry args={[0.008, 8, 6]}/>
          <meshStandardMaterial color="#bbc6bc" metalness={0.6} roughness={0.3}/>
        </mesh>;
      })}
      <mesh position={[0, -0.142, 0.308]}>
        <boxGeometry args={[0.44, 0.059, 0.012]}/>
        <meshStandardMaterial color="#084b7d" roughness={0.45}/>
      </mesh>
      <mesh geometry={geometry.label} position={[0, -0.142, 0.319]}>
        <meshBasicMaterial color="#f2d784"/>
      </mesh>
      <mesh position={[0.19, -0.066, 0.312]}>
        <sphereGeometry args={[0.012, 12, 8]}/>
        <meshBasicMaterial color="#89caa0"/>
      </mesh>
      <mesh position={[0.273, 0.01, -0.025]}>
        <boxGeometry args={[0.006, 0.045, 0.36]}/>
        <meshStandardMaterial color="#1a5283" roughness={0.4}/>
      </mesh>
      <mesh position={[0.277, 0.01, -0.025]}>
        <boxGeometry args={[0.008, 0.009, 0.36]}/>
        <meshBasicMaterial color="#d0ac47"/>
      </mesh>
    </group>
  </group>;
}

function SwedishFlag({ frame }: { frame: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#006aa7'; ctx.fillRect(0, 0, 1024, 640);
    ctx.fillStyle = '#fecc00';
    ctx.fillRect(1024 * 5 / 16, 0, 1024 * 2 / 16, 640);
    ctx.fillRect(0, 640 * 4 / 10, 1024, 640 * 2 / 10);
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    for (let y = 0; y < 640; y += 4) ctx.fillRect(0, y, 1024, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = 0; x < 1024; x += 4) ctx.fillRect(x, 0, 1, 640);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, []);
  const cloth = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.88, 0.55, 36, 22);
    const positions = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      const u = uv.getX(i), v = uv.getY(i), wave = u * 6.5 - frame * 0.09;
      positions.setXYZ(i, positions.getX(i) + 0.44,
        positions.getY(i) - u * 0.065 + Math.sin(wave + v * 2.5) * u * 0.018,
        Math.sin(wave + v * 1.6) * u * 0.13 + Math.sin(u * 14 - frame * 0.13) * u * 0.026);
    }
    g.computeVertexNormals(); return g;
  }, [frame]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => cloth.dispose(), [cloth]);
  return <group position={[1.93, interpolate(frame, [18, 52], [-1.02, 0], smooth), -1.35]} rotation={[0, -0.18, 0.014]}>
    <mesh position={[0, 0.25, 0]}>
      <cylinderGeometry args={[0.018, 0.027, 3.10, 16]}/>
      <meshStandardMaterial color="#a3ada4" metalness={0.87} roughness={0.31}/>
    </mesh>
    <mesh position={[0, 1.82, 0]}>
      <sphereGeometry args={[0.044, 16, 12]}/>
      <meshStandardMaterial color="#bfa56a" metalness={0.8} roughness={0.25}/>
    </mesh>
    <mesh geometry={cloth} position={[0.025, 1.47, 0.015]}>
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.86} metalness={0} envMapIntensity={0.35}/>
    </mesh>
    {[1.20, 1.72].map(y => <mesh key={y} position={[0, y, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[0.028, 0.006, 6, 16]}/>
      <meshStandardMaterial color="#cfccb1" metalness={0.7} roughness={0.4}/>
    </mesh>)}
  </group>;
}

export function BackgroundDetails({ frame, font }: { frame: number; font: Font }) {
  return <>
    <SurveillanceCamera frame={frame} font={font}/>
    <SwedishFlag frame={frame}/>
  </>;
}
