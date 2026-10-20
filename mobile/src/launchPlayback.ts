/** Start at zero only after the first frame and splash handoff are visible. */
export function createIntroPlayback(player: {pause(): void; play(): void; currentTime: number}) {
  let started = false;
  return {
    sync(canPlay: boolean) {
      if (!canPlay) { player.pause(); return; }
      if (!started) { player.currentTime = 0; started = true; }
      player.play();
    },
  };
}
