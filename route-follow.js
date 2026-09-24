export function createRouteFollowController({
  geolocation,
  isVisible = () => true,
  onPosition = () => {},
  onError = () => {},
  onRefresh = () => {},
  onActiveChange = () => {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  let active = false;
  let watchId = null;
  let refreshTimer = null;
  let generation = 0;

  function clearResources() {
    generation++;
    if (watchId !== null) geolocation?.clearWatch(watchId);
    watchId = null;
    if (refreshTimer !== null) clearIntervalFn(refreshTimer);
    refreshTimer = null;
  }

  function stop(reason = 'user') {
    const wasActive = active;
    active = false;
    clearResources();
    if (wasActive) onActiveChange(false, reason);
    return wasActive;
  }

  function resume() {
    if (!active || !isVisible() || watchId !== null) return false;
    if (typeof geolocation?.watchPosition !== 'function') {
      onError({ code: 0, message: 'GPS stöds inte i den här webbläsaren.' });
      stop('unsupported');
      return false;
    }
    const requestGeneration = ++generation;
    try {
      const nextWatchId = geolocation.watchPosition(position => {
        if (requestGeneration === generation && active && isVisible()) onPosition(position);
      }, error => {
        if (requestGeneration !== generation) return;
        onError(error);
        if (error?.code === 1) stop('permission-denied');
      }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 });
      if (requestGeneration !== generation || !active) {
        if (nextWatchId !== null && nextWatchId !== undefined) geolocation.clearWatch(nextWatchId);
        return false;
      }
      watchId = nextWatchId;
      refreshTimer = setIntervalFn(() => {
        if (active && isVisible()) onRefresh();
      }, 60_000);
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  }

  function start() {
    if (active) return false;
    active = true;
    onActiveChange(true, 'start');
    resume();
    return true;
  }

  function pause() {
    const wasActive = active;
    clearResources();
    return wasActive;
  }

  return {
    start,
    pause,
    resume,
    stop,
    get active() { return active; },
    get watching() { return watchId !== null; },
    get refreshing() { return refreshTimer !== null; }
  };
}

export function bindRouteFollowPageHide(getController, target = globalThis.window) {
  if (typeof getController !== 'function' || typeof target?.addEventListener !== 'function') return () => {};
  const stopWhenPageHides = () => getController()?.stop('pagehide');
  target.addEventListener('pagehide', stopWhenPageHides);
  return () => target.removeEventListener?.('pagehide', stopWhenPageHides);
}
