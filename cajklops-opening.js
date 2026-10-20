const launch = document.querySelector('#cajklops-launch');
if (launch instanceof HTMLDialogElement) {
  const video = launch.querySelector('video');
  const poster = launch.querySelector('.cajklops-launch-poster');
  const status = launch.querySelector('[role="status"]');
  const skip = launch.querySelector('button');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const seenKey = 'cajklops.opening.seen.v1';
  let mode = 'everyday';
  try { mode = localStorage.getItem(seenKey) ? 'everyday' : 'cinematic'; } catch { /* Keep loading brief without storage. */ }
  launch.dataset.mode = mode;
  let ready = document.documentElement.dataset.cajklopsReady === 'true';
  let ended = false;
  let closing = false;
  let deadline;
  let release;
  const previousFocus = document.activeElement;
  const quietHold = () => {
    video.pause(); video.hidden = true; poster.hidden = false; status.hidden = ready;
  };
  const finish = (duration = mode === 'cinematic' ? 700 : 260) => {
    if (closing) return;
    closing = true;
    clearTimeout(deadline);
    try { localStorage.setItem(seenKey, '1'); } catch { /* Playback stays optional without persistence. */ }
    const fadeMs = motion.matches ? 0 : duration;
    launch.style.transitionDuration = `${fadeMs}ms`;
    launch.classList.add('cajklops-launch--closing');
    release = setTimeout(() => {
      video.pause(); launch.close();
      launch.remove();
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('cajklops:ready', onReady);
      if (previousFocus instanceof HTMLElement && previousFocus !== document.body) previousFocus.focus();
    }, fadeMs);
  };
  const maybeFinish = () => {
    if (!ready || closing) return;
    if (motion.matches || ended || video.currentTime >= (mode === 'cinematic' ? 5.9 : 0.8)) finish();
  };
  const onReady = () => { ready = true; status.hidden = true; maybeFinish(); };
  const onMotion = () => { if (motion.matches) { ended = true; quietHold(); maybeFinish(); } };
  const onVisibility = () => {
    if (document.hidden) video.pause();
    else if (!closing && !ended && !motion.matches) video.play().catch(onEnd);
  };
  const onEnd = () => {
    if (closing) return;
    ended = true;
    if (!ready) quietHold();
    maybeFinish();
  };
  launch.showModal();
  skip.addEventListener('click', () => finish(150));
  launch.addEventListener('cancel', event => { event.preventDefault(); finish(150); });
  video.addEventListener('timeupdate', maybeFinish);
  video.addEventListener('ended', onEnd);
  video.addEventListener('error', onEnd);
  motion.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('cajklops:ready', onReady);
  deadline = setTimeout(() => finish(180), 10000);
  if (motion.matches) { ended = true; quietHold(); maybeFinish(); }
  else {
    video.src = mode === 'cinematic' ? video.dataset.src : video.dataset.everydaySrc;
    video.play().catch(onEnd);
  }
  window.addEventListener('pagehide', () => {
    clearTimeout(deadline); clearTimeout(release);
    closing = true; video.pause(); launch.close(); launch.remove();
    motion.removeEventListener('change', onMotion);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('cajklops:ready', onReady);
  }, { once: true });
}
