const HOUR_MS = 60 * 60_000;
const DEFAULT_USER_AGENT = process.env.UPSTREAM_USER_AGENT || 'TryggPuls/2.1';

// Polisen asks API clients to wait at least ten seconds between calls and to
// stay below 60 calls per hour. The shared queue applies those rules across
// the events and station APIs in this process.
export function createPoliceApiFetch({
  fetcher = fetch,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  spacingMs = 10_000,
  maxRequestsPerHour = 60,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  let tail = Promise.resolve();
  let nextStartAt = 0;
  const starts = [];

  return (input, options = {}) => {
    const request = tail.then(async () => {
      const initialTime = now();
      while (starts.length && starts[0] <= initialTime - HOUR_MS) starts.shift();
      if (starts.length >= maxRequestsPerHour) {
        throw Object.assign(new Error('Polisens anropsgräns är nådd. Försök igen senare.'), { status: 429, code: 'POLICE_RATE_LIMITED' });
      }

      const waitMs = nextStartAt - initialTime;
      if (waitMs > 0) await sleep(waitMs);
      const startedAt = now();
      while (starts.length && starts[0] <= startedAt - HOUR_MS) starts.shift();
      if (starts.length >= maxRequestsPerHour) {
        throw Object.assign(new Error('Polisens anropsgräns är nådd. Försök igen senare.'), { status: 429, code: 'POLICE_RATE_LIMITED' });
      }

      const headers = new Headers(options.headers || {});
      if (!headers.has('User-Agent')) headers.set('User-Agent', userAgent);
      starts.push(startedAt);
      nextStartAt = startedAt + spacingMs;
      return fetcher(input, { ...options, headers });
    });
    tail = request.catch(() => {});
    return request;
  };
}

export const policeApiFetch = createPoliceApiFetch();
