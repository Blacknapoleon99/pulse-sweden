import { useMemo } from 'react';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { interpolate } from 'remotion';
export function Wordmark({ font, frame }: { font: Font; frame: number }) {
  const geometry = useMemo(() => {
    const text = new TextGeometry('CAJKLOPS', { font, size: 1, depth: 0.12,
      bevelEnabled: true, bevelThickness: 0.017, bevelSize: 0.012, bevelSegments: 4, curveSegments: 12 });
    text.computeBoundingBox();
    const box = text.boundingBox!, factor = 6.6 / (box.max.x - box.min.x);
    text.translate(-(box.max.x + box.min.x) / 2, -(box.max.y + box.min.y) / 2, -0.06);
    text.scale(factor, factor, factor); return text;
  }, [font]);
  return <group rotation={[-0.065, interpolate(frame, [15, 52, 155], [-0.16, 0.025, -0.015], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  }), 0]}>
    <mesh geometry={geometry}>
      <meshPhysicalMaterial attach="material-0" color="#f1d99f" metalness={0.76} roughness={0.24}
        envMapIntensity={1.5} emissive="#4c3418" emissiveIntensity={0.10} clearcoat={0.9}/>
      <meshStandardMaterial attach="material-1" color="#8d683c" metalness={0.85} roughness={0.32}/>
    </mesh>
    <pointLight position={[interpolate(frame, [5, 65], [-3.5, 3.5], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}), 1.7, 2.2]}
      intensity={interpolate(frame, [0, 8, 56, 76], [2, 5, 5, 2], {extrapolateLeft:'clamp', extrapolateRight:'clamp'})}
      color="#fff1ca" distance={9}/>
  </group>;
}
