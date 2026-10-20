import { createHash } from 'node:crypto';

const SOURCE_FIELDS = [
  'sourceId', 'title', 'area', 'level', 'levelLabel', 'publishedAt',
  'validFrom', 'validTo', 'sourceUrl', 'sourceText'
];
const SUMMARY_FIELDS = [
  'sourceId', 'contentVersion', 'summarySv', 'sourceUrl', 'sourceUpdatedAt',
  'sourceFetchedAt', 'generatedAt', 'modelVersion', 'reviewStatus'
];
const APPROVED_SOURCE_HOSTS = ['smhi.se', 'krisinformation.se'];
const EXPECTED_FOUNDRY_ORIGIN = 'https://shadow-lancer.usw-16.palantirfoundry.com';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;

function cleanString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeSourceRecord(record = {}) {
  const descriptions = Array.isArray(record.descriptions) ? record.descriptions : [];
  const sourceText = record.sourceText ?? descriptions.map((part) => {
    const title = cleanString(part?.title).trim();
    const text = cleanString(part?.text).trim();
    return [title, text].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n');

  return {
    sourceId: cleanString(record.sourceId ?? record.id),
    title: cleanString(record.title),
    area: cleanString(record.area),
    level: cleanString(record.level),
    levelLabel: cleanString(record.levelLabel),
    publishedAt: cleanString(record.publishedAt),
    validFrom: cleanString(record.validFrom),
    validTo: cleanString(record.validTo),
    sourceUrl: cleanString(record.sourceUrl ?? record.source),
    sourceText: cleanString(sourceText)
  };
}

/** Hash the same ordered fields used by the Foundry pilot transform. */
export function hashAlertSourceRecord(record) {
  const normalized = normalizeSourceRecord(record);
  const canonicalJson = JSON.stringify(SOURCE_FIELDS.map((field) => normalized[field]));
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

function parseCsv(csv) {
  const text = String(csv ?? '').replace(/^\uFEFF/, '');
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) records.push(row);
      row = [];
    } else field += char;
  }

  if (quoted) throw new Error('Foundry returned malformed CSV');
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) records.push(row);
  }
  if (!records.length) return [];

  const columns = records.shift().map((column) => column.trim());
  if (new Set(columns).size !== columns.length) throw new Error('Foundry returned duplicate CSV columns');
  return records.map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ''])));
}

function isAllowedSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && APPROVED_SOURCE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function parseSummary(row) {
  const summary = Object.fromEntries(SUMMARY_FIELDS.map((field) => [field, cleanString(row[field]).trim()]));
  if (!summary.sourceId || summary.sourceId.length > 160) return null;
  if (!/^[a-f0-9]{64}$/i.test(summary.contentVersion)) return null;
  if (!summary.summarySv || summary.summarySv.length > 800) return null;
  if (!isAllowedSourceUrl(summary.sourceUrl)) return null;
  if (!summary.modelVersion || summary.modelVersion.length > 160) return null;
  if (summary.reviewStatus.toLowerCase() !== 'approved') return null;
  for (const field of ['sourceUpdatedAt', 'sourceFetchedAt', 'generatedAt']) {
    if (!Number.isFinite(Date.parse(summary[field]))) return null;
  }
  return summary;
}

function freshTimestamp(value, now, maxAgeMs) {
  const timestamp = Date.parse(value);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= -5 * 60_000 && age <= maxAgeMs;
}

function tokenEndpoint(baseUrl) {
  return new URL('/multipass/api/oauth2/token', baseUrl).toString();
}

function datasetEndpoint(baseUrl, datasetRid, branchName) {
  const endpoint = new URL(`/api/v2/datasets/${encodeURIComponent(datasetRid)}/readTable`, baseUrl);
  endpoint.searchParams.set('branchName', branchName);
  endpoint.searchParams.set('format', 'CSV');
  endpoint.searchParams.set('rowLimit', String(MAX_ROWS));
  return endpoint.toString();
}

export function createFoundrySummaryReader({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  const baseUrl = cleanString(env.FOUNDRY_BASE_URL).replace(/\/+$/, '');
  const clientId = cleanString(env.FOUNDRY_CLIENT_ID);
  const clientSecret = cleanString(env.FOUNDRY_CLIENT_SECRET);
  const datasetRid = cleanString(env.FOUNDRY_SUMMARIES_DATASET_RID);
  const branchName = cleanString(env.FOUNDRY_SUMMARIES_BRANCH || 'master');
  const scope = 'api:datasets-read';
  const enabled = cleanString(env.FOUNDRY_SUMMARIES_ENABLED).toLowerCase() === 'true';
  const maxAgeCandidate = Number(env.FOUNDRY_SUMMARIES_MAX_AGE_MS);
  const maxAgeMs = Number.isFinite(maxAgeCandidate) && maxAgeCandidate > 0
    ? Math.min(maxAgeCandidate, 30 * 24 * 60 * 60 * 1000)
    : 6 * 60 * 60 * 1000;

  let accessToken = '';
  let tokenExpiresAt = 0;
  let cache = null;
  let cacheExpiresAt = 0;
  let pending = null;

  let baseUrlIsValid = false;
  try {
    const parsedBaseUrl = new URL(baseUrl);
    baseUrlIsValid = parsedBaseUrl.origin === EXPECTED_FOUNDRY_ORIGIN &&
      parsedBaseUrl.pathname === '/' && !parsedBaseUrl.username && !parsedBaseUrl.password &&
      !parsedBaseUrl.search && !parsedBaseUrl.hash;
  } catch { /* invalid or unapproved host */ }
  const datasetRidIsValid = /^ri\.foundry\.main\.dataset\.[A-Za-z0-9.-]+$/.test(datasetRid);
  const configured = baseUrlIsValid && clientId.length > 0 && clientSecret.length > 0 && datasetRidIsValid && branchName.length > 0;

  async function getAccessToken() {
    if (accessToken && tokenExpiresAt - now() > 30_000) return accessToken;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope
    });
    const response = await fetcher(tokenEndpoint(baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error('FOUNDRY_AUTH_FAILED');
    const tokenData = await response.json();
    if (typeof tokenData?.access_token !== 'string' || !tokenData.access_token) throw new Error('FOUNDRY_AUTH_FAILED');
    const expiresInMs = Math.max(60, Number(tokenData.expires_in) || 300) * 1000;
    accessToken = tokenData.access_token;
    tokenExpiresAt = now() + expiresInMs;
    return accessToken;
  }

  async function loadRows() {
    const token = await getAccessToken();
    const response = await fetcher(datasetEndpoint(baseUrl, datasetRid, branchName), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error('FOUNDRY_DATASET_READ_FAILED');
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('FOUNDRY_RESPONSE_TOO_LARGE');
    const csv = await response.text();
    if (Buffer.byteLength(csv, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('FOUNDRY_RESPONSE_TOO_LARGE');
    return parseCsv(csv).map(parseSummary).filter(Boolean);
  }

  async function readApprovedSummaries() {
    if (!configured || !enabled) return { status: 'disabled', items: [], fetchedAt: null };
    if (cache && cacheExpiresAt > now()) return cache;
    if (!pending) {
      pending = (async () => {
        try {
          const items = await loadRows();
          const result = { status: 'ok', items, fetchedAt: new Date(now()).toISOString() };
          cache = result;
          cacheExpiresAt = now() + 60_000;
          return result;
        } catch (error) {
          const code = ['FOUNDRY_AUTH_FAILED', 'FOUNDRY_DATASET_READ_FAILED', 'FOUNDRY_RESPONSE_TOO_LARGE'].includes(error?.message)
            ? error.message
            : 'FOUNDRY_UNAVAILABLE';
          return { status: 'unavailable', code, items: [], fetchedAt: null };
        }
      })().finally(() => { pending = null; });
    }
    return pending;
  }

  return {
    status() {
      return { configured, enabled, datasetConfigured: datasetRidIsValid };
    },
    readApprovedSummaries,
    async findForSourceRecord(sourceRecord) {
      const source = normalizeSourceRecord(sourceRecord);
      if (!source.sourceId) return null;
      const snapshot = await readApprovedSummaries();
      if (snapshot.status !== 'ok') return null;
      const version = hashAlertSourceRecord(source);
      const nowMs = now();
      return snapshot.items.find((item) =>
        item.sourceId === source.sourceId &&
        item.contentVersion.toLowerCase() === version &&
        freshTimestamp(item.sourceFetchedAt, nowMs, maxAgeMs) &&
        freshTimestamp(item.generatedAt, nowMs, maxAgeMs)
      ) || null;
    }
  };
}
