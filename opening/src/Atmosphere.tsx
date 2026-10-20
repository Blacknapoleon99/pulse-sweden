import { interpolate } from 'remotion';
const noise = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export function Atmosphere({ frame }: { frame: number }) {
  return <>
    <div style={{ position: 'absolute', inset: -100,
      background: 'radial-gradient(ellipse at 28% 27%, #304e3d 0%, transparent 46%), radial-gradient(ellipse at 76% 60%, #283c32 0%, transparent 48%), linear-gradient(165deg, #101a14, #19241a 50%, #080d0c)',
      translate: `${Math.sin(frame / 90) * 12}px ${Math.cos(frame / 80) * 15}px` }}/>
    <svg width="720" height="1280" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <filter id="mist"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.005" numOctaves="3" seed="29"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0.40 0 0 0 0 0.52 0 0 0 0 0.41 0 0 0 0.38 0"/>
          <feGaussianBlur stdDeviation="15"/></filter>
        <filter id="glow"><feGaussianBlur stdDeviation="4"/></filter>
        <radialGradient id="shaft"><stop stopColor="#d7c48c" stopOpacity="0.15"/><stop offset="1" stopColor="#d7c48c" stopOpacity="0"/></radialGradient>
        <radialGradient id="hero-aura"><stop stopColor="#e5c88d" stopOpacity={0.22 + Math.sin(frame / 95) * 0.025}/>
          <stop offset="0.5" stopColor="#94bfa4" stopOpacity="0.09"/><stop offset="1" stopColor="#94bfa4" stopOpacity="0"/></radialGradient>
        <radialGradient id="vignette"><stop offset="0.48" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity="0.65"/></radialGradient>
      </defs>
      <ellipse cx="370" cy="523" rx="370" ry="470" fill="url(#hero-aura)"/>
      <g style={{ mixBlendMode: 'screen' }} opacity="0.55">
        <ellipse cx={205 + frame * 0.12} cy="375" rx="310" ry="470" fill="url(#shaft)" transform="rotate(-29 205 375)"/>
        <ellipse cx="595" cy="675" rx="100" ry="650" fill="url(#shaft)" transform="rotate(24 595 675)"/>
      </g>
      <g transform={`translate(${Math.sin(frame / 100) * 35} ${frame * 0.15})`} opacity="0.3">
        <rect x="-70" y="-90" width="860" height="1480" filter="url(#mist)"/>
      </g>
      <g fill="none" stroke="#90b9a2" strokeWidth="0.55" opacity="0.16" transform={`rotate(${frame * 0.012} 360 515)`}>
        <ellipse cx="360" cy="515" rx="320" ry="485"/>
        <ellipse cx="360" cy="515" rx="410" ry="255" transform="rotate(-29 360 515)"/>
        <ellipse cx="360" cy="515" rx="380" ry="115" transform="rotate(64 360 515)"/>
        <path d="M0 1050 Q310 745 720 1070 M0 198 Q370 422 720 99 M86 0 Q470 580 38 1280 M650 0 Q289 620 692 1280"/>
      </g>
      {Array.from({ length: 68 }, (_, i) => {
        const depth = noise(i + 81);
        const x = (noise(i + 1) * 850 + Math.sin(frame / (49 + i % 23) + i) * 13 + 850) % 850 - 65;
        const y = (noise(i + 13) * 1440 - frame * (0.13 + depth * 0.49) + 1440) % 1440 - 80;
        return <g key={i} opacity={(0.13 + depth * 0.49) * interpolate(frame, [0, 20], [0.5, 1], { extrapolateRight: 'clamp' })}>
          {depth > 0.78 && <circle cx={x} cy={y} r={3.4 + depth * 2.2} fill="#e4c58b" filter="url(#glow)"/>}
          <circle cx={x} cy={y} r={0.45 + depth * 1.65} fill={i % 5 ? '#d9be86' : '#a8dcc5'}/>
        </g>;
      })}
      <rect width="720" height="1280" fill="url(#vignette)"/>
      <g stroke="#ac9361" fill="none" opacity="0.37">
        <path d="M42 128 V73 H97 M623 73 H678 V128 M42 1140 V1207 H97 M623 1207 H678 V1140"/>
        <path d="M340 95 L360 76 L380 95 L360 114 Z M350 95 H370 M360 85 V105"/>
      </g>
    </svg>
  </>;
}
