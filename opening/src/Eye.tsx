import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { diveProgress, eyePose, settleForDive, type OpeningVariant } from './timing';

const HALF = 1.65;
const RADIUS = 1.93;
const vertexShader = `
  varying vec3 p;
  varying vec3 worldNormal;
  varying vec3 worldPoint;
  void main() {
    p = position;
    worldNormal = normalize(mat3(modelMatrix) * normal);
    worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  uniform sampler2D iris;
  uniform sampler2D sclera;
  uniform float openness;
  uniform float immersion;
  uniform vec2 gaze;
  varying vec3 p;
  varying vec3 worldNormal;
  varying vec3 worldPoint;
  float hash(vec2 a) { return fract(sin(dot(a,vec2(127.1,311.7)))*43758.5453); }
  void main() {
    if (p.z < 0.0 || abs(p.x)>1.65) discard;
    float arch=pow(max(0.0,1.0-p.x*p.x/(1.65*1.65)),0.72);
    float seam=0.028*p.x-0.29*arch*(1.0-openness);
    float upper=seam+0.64*arch*openness;
    float lower=seam-0.46*arch*openness;
    if(p.y>upper || p.y<lower) discard;
    vec3 n=normalize(worldNormal);
    vec3 view=normalize(cameraPosition-worldPoint);
    float cy=cos(gaze.x),sy=sin(gaze.x),cx=cos(gaze.y),sx=sin(gaze.y);
    vec3 q=vec3(cy*p.x-sy*p.z,p.y,sy*p.x+cy*p.z);
    q=vec3(q.x,cx*q.y-sx*q.z,sx*q.y+cx*q.z);
    float r=length(q.xy);
    vec3 light=normalize(vec3(-0.55,0.85,1.4));
    float diffuse=max(dot(n,light),0.0);
    vec2 scleraUv=vec2(p.x/3.3+0.5,0.5-p.y/1.5);
    vec3 color=mix(vec3(0.80,0.79,0.73),texture2D(sclera,scleraUv).rgb,0.58);
    float corners=smoothstep(0.65,1.65,abs(p.x));
    color=mix(color,vec3(0.64,0.40,0.34),corners*0.045);
    if(r<0.67 && q.z>0.0) {
      vec2 uv=q.xy/1.34+0.5;
      uv.y=1.0-uv.y;
      // Texture's iris occupies 91% of its square; map the whole disc.
      uv=(uv-0.5)*0.91+0.5;
      color=texture2D(iris,uv).rgb;
      float luminance=dot(color,vec3(0.2126,0.7152,0.0722));
      color=mix(color,vec3(luminance),0.075);
      color=mix(color,vec3(0.015,0.02,0.014),smoothstep(0.59,0.67,r));
      float pupilRadius=0.198+immersion*0.017;
      color=mix(vec3(0.003,0.005,0.004),color,smoothstep(pupilRadius-0.003,pupilRadius+0.004,r));
    }
    float lidShadow=smoothstep(0.0,0.23,upper-p.y);
    float lowerShadow=smoothstep(0.0,0.065,p.y-lower);
    color*=0.61+0.39*lidShadow;
    color*=0.92+0.08*lowerShadow;
    color*=0.32+0.71*diffuse;
    float globeFalloff=pow(max(0.0,p.z/1.93),1.8);
    color*=0.79+0.21*globeFalloff;
    // Convex wet corneal reflections stay in light space while the iris rotates.
    vec3 h=normalize(light+view);
    float spec=pow(max(dot(n,h),0.0),150.0);
    float pin=pow(max(dot(n,normalize(vec3(0.36,-0.24,1.0))),0.0),420.0);
    float outsideCornea=1.0-smoothstep(0.35,0.62,immersion);
    color+=(vec3(0.94,0.90,0.78)*spec*0.52+vec3(0.7,0.83,0.8)*pin*0.12)*outsideCornea;
    // A softbox reflects around the curved surface as the viewing camera moves.
    vec3 reflected=reflect(-view,n);
    float reflection=(1.0-smoothstep(0.07,0.13,abs(reflected.x+0.36))) *
      (1.0-smoothstep(0.035,0.085,abs(reflected.y-0.53)));
    color=mix(color,vec3(0.90,0.94,0.91),reflection*0.60*outsideCornea);
    gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function rimPoint(x: number, open: number, upper: boolean) {
  const arch = Math.pow(Math.max(0, 1 - (x / HALF) ** 2), 0.72);
  const seam = 0.028 * x - 0.29 * arch * (1 - open);
  const y = seam + (upper ? 0.64 : -0.46) * arch * open;
  const z = Math.sqrt(Math.max(0.1, RADIUS ** 2 - x * x - y * y));
  return new THREE.Vector3(x, y, z + 0.017);
}

// A curved strip of skin folds over the convex eyeball during a blink.
function lidGeometry(open: number, upper: boolean) {
  const positions: number[] = [], uvs: number[] = [], lidCoordinates: number[] = [], indices: number[] = [];
  const nx = 84, ny = 14;
  for (let i = 0; i <= nx; i++) {
    const x = (i / nx * 2 - 1) * HALF;
    const rim = rimPoint(x, open, upper);
    const arch = Math.pow(Math.max(0, 1 - (x / HALF) ** 2), 0.6);
    for (let j = 0; j <= ny; j++) {
      const t = j / ny;
      // The outer fold stays anchored while the inner lid travels over the globe.
      const outerY = (upper ? 0.97 : -0.76) * arch + 0.028 * x;
      const y = rim.y * (1 - t) + outerY * t;
      const z = Math.sqrt(Math.max(0.1, RADIUS ** 2 - x * x - y * y))
        + 0.025 + Math.sin(t * Math.PI) * (upper ? 0.065 : 0.047) - t * 0.04;
      positions.push(x, y, z);
      // Sample skin in world proportions, without stretching a square over a thin lid.
      uvs.push((x + HALF) / 1.55, y / 1.55 + 0.52);
      lidCoordinates.push(i / nx, t);
      if (i < nx && j < ny) {
        const a = i * (ny + 1) + j, b = a + ny + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('lidCoord', new THREE.Float32BufferAttribute(lidCoordinates, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function taperedLash(curve: THREE.CatmullRomCurve3, radius: number) {
  const segments = 18, edges = 5;
  const geometry = new THREE.TubeGeometry(curve, segments, radius, edges, false);
  const points = geometry.getAttribute('position');
  for (let ring = 0; ring <= segments; ring++) {
    const center = curve.getPointAt(ring / segments);
    const taper = Math.max(0.012, Math.pow(1 - ring / segments, 1.15));
    for (let edge = 0; edge <= edges; edge++) {
      const index = ring * (edges + 1) + edge;
      const v = new THREE.Vector3().fromBufferAttribute(points, index);
      v.sub(center).multiplyScalar(taper).add(center);
      points.setXYZ(index, v.x, v.y, v.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function Lashes({ open, upper }: { open: number; upper: boolean }) {
  const geometries = useMemo(() => Array.from({ length: upper ? 128 : 64 }, (_, i) => {
    const count = upper ? 128 : 64;
    const rand = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const x = ((i + 0.5 + (rand(i + 12) - 0.5) * 0.75) / count * 2 - 1) * HALF * 0.95;
    const root = rimPoint(x, open, upper);
    const row = upper ? i % 3 : i % 2;
    root.y += (upper ? 1 : -1) * (0.010 + row * 0.006);
    root.z += 0.040 + row * 0.003;
    const fullness = Math.pow(Math.sin((i + 0.5) / count * Math.PI), 0.65);
    const length = (upper ? 0.10 + fullness * 0.23 : 0.038 + fullness * 0.072)
      * (0.67 + rand(i + 91) * 0.43) * (i % 7 === 0 ? 0.64 : 1);
    const sweep = x * (upper ? 0.125 : 0.085) + (rand(Math.floor(i / 3) + 26) - 0.5) * 0.065;
    // Fine hairs emerge in staggered rows, fan outward, and follow the blinking lid.
    const tipY = length * (upper ? open * 0.94 - (1 - open) * 0.24 : -1);
    const curl = upper ? 0.145 + (1 - open) * 0.085 : 0.085;
    const curve = new THREE.CatmullRomCurve3([
      root,
      root.clone().add(new THREE.Vector3(sweep * 0.12, tipY * 0.15, curl * 0.06)),
      root.clone().add(new THREE.Vector3(sweep * 0.42, tipY * 0.48, curl * 0.30)),
      root.clone().add(new THREE.Vector3(sweep * 0.78, tipY * 0.83, curl * 0.67)),
      root.clone().add(new THREE.Vector3(sweep, tipY, curl)),
    ]);
    return taperedLash(curve, (upper ? 0.0039 : 0.0025) * (0.65 + rand(i + 52) * 0.50));
  }), [open, upper]);
  const materials = useMemo(() => ['#1e140e', '#291d13', '#37271a'].map(color =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.66, clearcoat: 0.10, clearcoatRoughness: 0.65 })), []);
  useEffect(() => () => geometries.forEach(geometry => geometry.dispose()), [geometries]);
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials]);
  return <group>{geometries.map((geometry, i) => <mesh key={i} geometry={geometry} material={materials[i % materials.length]}/>)}</group>;
}

function Lid({ open, upper, skin }: { open: number; upper: boolean; skin: THREE.Texture }) {
  const geometry = useMemo(() => lidGeometry(open, upper), [open, upper]);
  const rim = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    Array.from({ length: 85 }, (_, i) => rimPoint((i / 84 * 2 - 1) * HALF, open, upper))),
  84, upper ? 0.012 : 0.009, 8, false), [open, upper]);
  const tearLine = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    Array.from({ length: 85 }, (_, i) => {
      const p = rimPoint((i / 84 * 2 - 1) * HALF, open, upper);
      p.y += upper ? -0.014 : 0.013; p.z += 0.006; return p;
    })), 84, upper ? 0.005 : 0.009, 8, false), [open, upper]);
  useEffect(() => () => { geometry.dispose(); rim.dispose(); tearLine.dispose(); }, [geometry, rim, tearLine]);
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: upper ? '#c4b6aa' : '#cdbeb3',
      map: skin, bumpMap: skin, bumpScale: 0.012,
      roughness: 0.66, clearcoat: 0.08, clearcoatRoughness: 0.55,
      sheen: 0.15, sheenColor: new THREE.Color('#c7afa2'),
      metalness: 0, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nattribute vec2 lidCoord; varying vec2 naturalLidUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nnaturalLidUv = lidCoord;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        varying vec2 naturalLidUv;
      `).replace('#include <color_fragment>', `
        #include <color_fragment>
        float fold=0.54+sin(naturalLidUv.x*3.14159)*0.10;
        float crease=exp(-pow((naturalLidUv.y-fold)*36.0,2.0));
        diffuseColor.rgb *= 1.0-crease*0.21;
        float rootShadow=exp(-naturalLidUv.y*44.0);
        diffuseColor.rgb *= 1.0-rootShadow*0.10;
        diffuseColor.a *= 1.0-smoothstep(0.56,1.0,naturalLidUv.y);
      `);
    };
    m.transparent = true;
    m.depthWrite = false;
    return m;
  }, [upper, skin]);
  useEffect(() => () => material.dispose(), [material]);
  return <group>
    <mesh geometry={geometry} material={material} />
    <mesh geometry={rim}><meshPhysicalMaterial color={upper ? '#9c6b59' : '#bd9582'}
      roughness={0.38} clearcoat={0.45} clearcoatRoughness={0.25} /></mesh>
    <mesh geometry={tearLine}><meshPhysicalMaterial color="#dcc3b4" roughness={0.10}
      clearcoat={1} clearcoatRoughness={0.08} transparent opacity={0.44} depthWrite={false}/></mesh>
    <Lashes open={open} upper={upper} />
  </group>;
}

export function Eye({ frame, iris, skin, sclera, variant }: { frame: number; iris: THREE.Texture; skin: THREE.Texture; sclera: THREE.Texture; variant: OpeningVariant }) {
  const { open, gazeX, gazeY } = eyePose(frame, variant);
  const immersion = diveProgress(frame, variant), settle = settleForDive(frame, variant);
  const uniforms = useMemo(() => ({ iris: { value: iris }, sclera: { value: sclera }, immersion: { value: immersion },
    openness: { value: open }, gaze: { value: new THREE.Vector2(gazeX, gazeY) } }),
  [iris, sclera, immersion, open, gazeX, gazeY]);
  const motionFrame = variant === 'icon' ? Math.sin(frame / 149 * Math.PI * 2) * 20 + 100 : frame;
  return <group rotation={[0.025 * Math.sin(motionFrame / 39) * settle, 0.04 * Math.sin(motionFrame / 47) * settle, -0.015 * settle]}
    position={[0.025 * Math.sin(motionFrame / 30) * settle, 0, 0]}>
    <mesh><sphereGeometry args={[RADIUS, 112, 80]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
    <Cornea open={open} gazeX={gazeX} gazeY={gazeY} immersion={immersion}/>
    <Lid open={open} upper skin={skin} />
    <Lid open={open} upper={false} skin={skin} />
    <mesh position={rimPoint(-1.60, open, false).add(new THREE.Vector3(0.017, 0.008, 0.027))}
      scale={[0.045, 0.010 + 0.010 * open, 0.024]}>
      <sphereGeometry args={[1, 24, 16]}/>
      <meshPhysicalMaterial color="#9c7166" roughness={0.48} clearcoat={0.35} clearcoatRoughness={0.25}/>
    </mesh>
  </group>;
}

function Cornea({ open, gazeX, gazeY, immersion }: { open: number; gazeX: number; gazeY: number; immersion: number }) {
  const geometry = useMemo(() => {
    const cap = new THREE.SphereGeometry(1.2, 72, 40, 0, Math.PI * 2, 0, Math.asin(0.70 / 1.2));
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 0, 0.84);
    cap.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-gazeY, gazeX, 0)));
    return cap;
  }, [gazeX, gazeY]);
  const uniform = useMemo(() => ({ value: 1 }), []);
  uniform.value = open;
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#10130e', transparent: true, opacity: 0.085,
      roughness: 0.065, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.37, depthWrite: false });
    m.onBeforeCompile = shader => {
      shader.uniforms.openness = uniform;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 eyePoint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\neyePoint = transformed;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float openness; varying vec3 eyePoint;')
        .replace('#include <clipping_planes_fragment>', `
          #include <clipping_planes_fragment>
          float arch=pow(max(0.0,1.0-eyePoint.x*eyePoint.x/(1.65*1.65)),0.72);
          float seam=0.028*eyePoint.x-0.29*arch*(1.0-openness);
          if(eyePoint.y>seam+0.64*arch*openness || eyePoint.y<seam-0.46*arch*openness) discard;
        `);
    };
    return m;
  }, [uniform]);
  material.opacity = 0.085 * (1 - THREE.MathUtils.smoothstep(immersion, 0.35, 0.62));
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material}/>;
}
