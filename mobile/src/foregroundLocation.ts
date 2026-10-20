import type { Point } from './api';

type Permission = { status: string };
type Sample = { coords: { latitude: number; longitude: number }; timestamp: number };
export type LocationDriver = {
  permission: () => Promise<Permission>;
  requestPermission: () => Promise<Permission>;
  servicesEnabled: () => Promise<boolean>;
  currentPosition: () => Promise<Sample>;
};
export class ForegroundLocationError extends Error {
  status: 'denied' | 'error';
  constructor(message: string, status: 'denied' | 'error' = 'error') { super(message); this.status=status; }
}

// Startup/resume reads existing permission; only an explicit user action prompts.
export async function readForegroundPosition(driver: LocationDriver, prompt = false, timeoutMs = 20_000): Promise<{ point: Point; timestamp: number } | null> {
  let permission = await driver.permission();
  if (permission.status !== 'granted' && prompt) permission = await driver.requestPermission();
  if (permission.status === 'denied') throw new ForegroundLocationError('Tillåt platsåtkomst i inställningarna för att se ditt närområde.', 'denied');
  if (permission.status !== 'granted') return null;
  if (!await driver.servicesEnabled()) throw new ForegroundLocationError('Slå på platstjänster på telefonen och försök igen.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sample = await Promise.race([
      driver.currentPosition(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ForegroundLocationError('Positionen tog för lång tid. Försök igen där GPS-signalen är bättre.')), timeoutMs); }),
    ]);
    const { latitude: lat, longitude: lon } = sample.coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(sample.timestamp)) throw new ForegroundLocationError('Telefonen kunde inte bestämma din position. Försök igen.');
    return { point: { lat, lon }, timestamp: sample.timestamp };
  } finally { if (timer) clearTimeout(timer); }
}
