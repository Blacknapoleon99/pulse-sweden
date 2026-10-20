import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { interpolate, Easing } from 'remotion';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Eye } from './Eye';
import { settleForDive, type OpeningVariant } from './timing';
export function StudioLighting() {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const generator = new THREE.PMREMGenerator(gl), room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.02);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.8;
    return () => { scene.environment = null; target.dispose(); room.dispose(); generator.dispose(); };
  }, [gl, scene]);
  return <>
    <ambientLight intensity={0.34}/>
    <directionalLight position={[-4, 5, 7]} intensity={2.7} color="#fff0d9"/>
    <directionalLight position={[4, -2, 3]} intensity={1.1} color="#a0c8b4"/>
    <pointLight position={[0, 3, 4]} intensity={6} color="#ffda9c" distance={12}/>
  </>;
}
function triangleShape(scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 2.54 * scale); s.lineTo(-2.58 * scale, -1.93 * scale); s.lineTo(2.58 * scale, -1.93 * scale); s.closePath();
  return s;
}
function Engravings() {
  const lines = useMemo(() => {
    const p: number[] = [];
    for (let i = 0; i < 37; i++) {
      const a = i / 37 * Math.PI * 2;
      const sideSlope = Math.sin(a) + Math.sqrt(3) * Math.abs(Math.cos(a));
      const limit = Math.min(2.85,
        Math.sin(a) < 0 ? -1.78 / Math.sin(a) : Infinity,
        sideSlope > 0 ? 2.28 / sideSlope : Infinity);
      for (let j = 0; j < 2; j++) {
        const r = j ? limit : 0.75;
        p.push(Math.cos(a) * r, Math.sin(a) * r + 0.02, 0.49);
      }
    }
    for (let row = 0; row < 5; row++) {
      const y = -1.25 - row * 0.11, w = 1.35 + row * 0.07; p.push(-w, y, 0.5, w, y, 0.5);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g;
  }, []);
  return <lineSegments geometry={lines}><lineBasicMaterial color="#c49b54" transparent opacity={0.37}/></lineSegments>;
}
function Halo({ frame }: { frame: number }) {
  return <group position={[0, 0.16, -0.9]} rotation={[0.16, -0.1, frame * 0.0017]}>
    {[2.88, 3.03, 3.22].map((r, i) => <mesh key={r}>
      <torusGeometry args={[r, i === 1 ? 0.019 : 0.006, 8, 192]}/>
      <meshStandardMaterial color={i === 1 ? '#b59a63' : '#617568'} metalness={0.83} roughness={0.27}/>
    </mesh>)}
    {Array.from({ length: 72 }, (_, i) => {
      const a = i / 72 * Math.PI * 2;
      return <mesh key={i} position={[Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0]} rotation={[0, 0, a - Math.PI / 2]}>
        <boxGeometry args={[i % 6 === 0 ? 0.017 : 0.009, i % 6 === 0 ? 0.17 : 0.065, 0.012]}/>
        <meshStandardMaterial color={i % 6 === 0 ? '#dcc68a' : '#697e6b'} metalness={0.65} roughness={0.4}/>
      </mesh>;
    })}
    {Array.from({ length: 12 }, (_, i) => {
      const a = i / 12 * Math.PI * 2;
      return <mesh key={i} position={[Math.cos(a) * 2.95, Math.sin(a) * 2.95, 0.02]} rotation={[0, 0, a + Math.PI / 4]}>
        <boxGeometry args={[0.038, 0.038, 0.015]}/><meshBasicMaterial color="#e5c382"/>
      </mesh>;
    })}
  </group>;
}
export function Emblem({ frame, iris, skin, sclera, variant }: { frame: number; iris: THREE.Texture; skin: THREE.Texture; sclera: THREE.Texture; variant: OpeningVariant }) {
  const gold = useMemo(() => new THREE.ExtrudeGeometry(triangleShape(), {
    depth: 0.30, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.065, bevelThickness: 0.065,
  }), []);
  const inset = useMemo(() => new THREE.ExtrudeGeometry(triangleShape(0.925), {
    depth: 0.055, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.034, bevelThickness: 0.034,
  }), []);
  const facets = useMemo(() => [-1, 1].map(side => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.30, 0, side * 2.32, -1.72, 0, 0, -0.6, 0.32], 3));
    g.computeVertexNormals(); return g;
  }), []);
  const corners = [[0, 2.54], [-2.58, -1.93], [2.58, -1.93]];
  const motionFrame = variant === 'icon' ? Math.sin(frame / 149 * Math.PI * 2) * 20 + 100 : frame;
  const yaw = variant === 'icon' ? Math.sin(frame / 149 * Math.PI * 2) * 0.12 : interpolate(frame, [0, 24, 62, 96, 130, 155], [-0.32, -0.08, 0.13, -0.1, 0.015, 0.035], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const settle = settleForDive(frame, variant);
  return <>
    <Halo frame={motionFrame}/>
    <group rotation={[(0.085 + Math.sin(motionFrame / 67) * 0.02) * settle, yaw * settle, -0.018 * settle]}
      position={[Math.sin(motionFrame / 53) * 0.07 * settle, Math.sin(motionFrame / 68) * 0.05 * settle, 0]}>
      <mesh geometry={gold} position={[0, 0, -0.08]}>
        <meshPhysicalMaterial color="#bb9350" metalness={0.94} roughness={0.23} clearcoat={0.7}/>
      </mesh>
      <mesh geometry={inset} position={[0, 0, 0.33]}>
        <meshPhysicalMaterial color="#122a23" metalness={0.66} roughness={0.28} clearcoat={1} clearcoatRoughness={0.15}/>
      </mesh>
      <Engravings/>
      {facets.map((g, i) => <mesh key={i} geometry={g} position={[0, 0, 0.45]}>
        <meshPhysicalMaterial color={i ? '#0c1b16' : '#214034'} metalness={0.55} roughness={0.31} side={THREE.DoubleSide}/>
      </mesh>)}
      {corners.map(([x, y], i) => <group key={i} position={[x, y, 0.27]}>
        <mesh><sphereGeometry args={[0.095, 24, 16]}/><meshPhysicalMaterial color="#efd28a" metalness={0.92} roughness={0.17}/></mesh>
        <mesh position={[0, 0, 0.071]}><sphereGeometry args={[0.030, 20, 12]}/><meshBasicMaterial color="#ffe6a5"/></mesh>
      </group>)}
      <group position={[0, 0.05, -0.20]}><Eye frame={frame} iris={iris} skin={skin} sclera={sclera} variant={variant}/></group>
      <mesh position={[0, -1.52, 0.57]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.135, 0.135, 0.07]}/><meshStandardMaterial color="#dbc48b" metalness={0.85} roughness={0.24}/>
      </mesh>
    </group>
  </>;
}
