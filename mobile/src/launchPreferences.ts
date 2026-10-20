export function readLaunchPreferences({readMotion, onMotion}: {
  readMotion: () => Promise<boolean>;
  onMotion: (reduce: boolean) => void;
}) {
  let alive = true, motionResolved = false;
  const fallback = setTimeout(() => {
    // A delayed bridge response is not an accessibility preference.
    if (alive && !motionResolved) onMotion(false);
  }, 1500);
  void readMotion().catch(() => false).then(reduce => {
    motionResolved = true;
    if (alive) onMotion(reduce);
  });
  return () => { alive = false; clearTimeout(fallback); };
}
