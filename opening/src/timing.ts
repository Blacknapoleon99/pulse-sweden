import { Easing, interpolate } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const smooth = { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) };

export type OpeningVariant = 'cinematic' | 'everyday' | 'icon';
export const ICON_FRAMES = 150;
export const OPENING_FRAMES = 201;
export const EVERYDAY_FRAMES = 60;
export const DIVE_START = 142;
export function diveProgress(frame: number, variant: OpeningVariant = 'cinematic') {
  if (variant !== 'cinematic') return 0;
  return interpolate(frame, [DIVE_START + 5, OPENING_FRAMES - 1], [0, 1], {
    ...clamp, easing: Easing.bezier(0.48, 0.08, 0.78, 0.63),
  });
}
export function settleForDive(frame: number, variant: OpeningVariant = 'cinematic') {
  if (variant !== 'cinematic') return 0.3;
  return interpolate(frame, [DIVE_START - 8, DIVE_START + 5], [1, 0], smooth);
}

// A relaxed aperture, one soft blink, and small, unhurried gaze changes.
export function eyePose(frame: number, variant: OpeningVariant = 'cinematic') {
  if (variant === 'icon') {
    return {
      open: interpolate(frame, [0, 39, 46, 48, 57, 149], [0.91, 0.91, 0.015, 0.015, 0.91, 0.91], smooth),
      gazeX: interpolate(frame, [0, 20, 40, 75, 103, 125, 149], [0, 0, -0.12, -0.12, 0.12, 0.12, 0], smooth),
      gazeY: Math.sin(frame / 149 * Math.PI * 2) * 0.015,
    };
  }
  if (variant === 'everyday') {
    const open = interpolate(frame, [0, 12, 28, 34, 36, 44, 59], [0.80, 0.91, 0.91, 0.015, 0.015, 0.91, 0.91], smooth);
    return { open, gazeX: interpolate(frame, [0, 14, 30, 47, 59], [0, -0.06, -0.06, 0, 0], smooth), gazeY: 0 };
  }
  const gazeX = interpolate(frame,
    [0, 18, 39, 71, 93, 113, 132, 200],
    [0, 0, -0.15, -0.15, 0.14, 0.14, 0, 0], smooth);
  const gazeY = interpolate(frame,
    [0, 43, 71, 93, 113, 132, 200],
    [0, -0.025, -0.025, 0.025, 0.025, 0, 0], smooth);
  const opening = interpolate(frame, [0, 2, 20], [0.05, 0.05, 0.91], smooth);
  const blink = interpolate(frame, [60, 66, 68, 77], [0.91, 0.015, 0.015, 0.91], smooth);
  return { gazeX, gazeY, open: Math.min(opening, blink) };
}
