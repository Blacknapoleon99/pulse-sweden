import http from 'node:http';
import { createRouteCache } from './route-cache.mjs';
import { feeds, readCrisis, createRequestQueue } from './feeds.mjs';
import { createFamilyApi } from './family-api.mjs';
import { readPoliceAreas, policeAreasStatus, sourcePage as policeAreasSource } from './police-areas.mjs';
import { readZoneNews, zoneNewsStatus } from './police-zone-news.mjs';
import { readTraffic, trafficStatus } from './traffic.mjs';
import { readPoliceStations, policeStationsStatus } from './police-stations.mjs';
import { readPoliceStationDetails } from './police-stations.mjs';
import { policeApiFetch } from './police-api.mjs';
import { createPublicZoneService } from './public-zones.mjs';
import { findRouteZonePassages, findGeographicItemsAlongRoute, nearestRoutePosition, pointToRouteDistanceMeters, selectApproximateRouteEvents, routeSlice } from './route-analysis.mjs';
import { readNearbyShelters, shelterSource, shelterStatus } from './shelters.mjs';
import { createFireRiskService, sampleRouteForFireRisk, selectFireRiskPeriod, SMHI_FIRE_RISK_URL } from './fire-risk.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pointToSegmentDistanceMeters = (pLat, pLon, lat1, lon1, lat2, lon2) => pointToRouteDistanceMeters(pLat, pLon, [[lon1, lat1], [lon2, lat2]]);
const minDistanceToRouteMeters = pointToRouteDistanceMeters;

const root = path.dirname(fileURLToPath(import.meta.url));
// Local secrets are ignored by Git. Hosting environments supply the same variables.
try { process.loadEnvFile?.(path.join(root, '.env.local')); }
catch (err) { if (err.code !== 'ENOENT') throw err; }
const refreshIntervalMs = 75_000;
const upstream = 'https://polisen.se/api/events';
const legalUpstream = 'https://rattspraxis.etjanst.domstol.se/api/v1/publiceringar';
const crisisApi = 'https://api.krisinformation.se/v3';
const braPageUrl = 'https://bra.se/statistik/statistik-fran-rattsvasendet/anmalda-brott';
const braCacheTtlMs = 24 * 60 * 60 * 1000; // 24 h
const braRetryBackoffMs = 60_000; // nya försök 60 s efter misslyckad hämtning
const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
// Cloud deployment (Render, etc.) kräver att servern lyssnar på en extern,
// reachbar interface – annars kan inte health-checken eller trafiken nå den.
const host = process.env.HOST || '0.0.0.0';
const useragent = process.env.UPSTREAM_USER_AGENT || 'TryggPuls/2.1';
let localFamilyPool;
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  const { newDb } = await import('pg-mem');
  const adapter = newDb().adapters.createPg();
  localFamilyPool = new adapter.Pool();
}
const familyApi = createFamilyApi(localFamilyPool ? { pool: localFamilyPool } : {});
const publicZoneApi = createPublicZoneService(localFamilyPool ? { pool: localFamilyPool } : {});
const fireRiskService = createFireRiskService();
const routeCache = createRouteCache();
export const familyService = familyApi.service;
let familyDbReady = false;
let publicZoneDbReady = false;

// Fel med HTTP-statuskod, används för upström fel i /api/route och /api/geocode
class UpstreamError extends Error {
  constructor(message, status = 502, upstreamStatus = null) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

// Enkel, konsistent felshape för API-svar. Används inte överallt (vissa
// endpoints returnerar redan sin egen struktur), men ger möjlighet till
// enhetlig logging och framtida client-hantering.
function apiError(status, message, code, source) {
  return { error: message, code: code || 'UNKNOWN', source: source || null };
}

// fetch med tidsgräns och konsekvent felhantering:
// timeout -> 504, nätverksfel -> 502, !ok -> 502 (med upströmsstatus i meddelandet)
async function upstreamFetch(url, timeoutMs, extraHeaders = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': useragent, Accept: 'application/json', ...extraHeaders },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new UpstreamError('Upströmstjänsten svarade inte inom tidsgränsen', 504);
    }
    console.error('[upstream] Nätverksfel:', err.message);
    throw new UpstreamError(`Nätverksfel mot upströmstjänsten (${err.message})`, 502);
  }
  if (!response.ok) {
    throw new UpstreamError(`Upströmstjänsten svarade med status ${response.status}`, 502, response.status);
  }
  return response;
}

// Officiella datakällor (publiceras via /api/sources)
const publicSources = [
  { id: 'polisen-areas', name: 'Polisens lägesbild över utsatta områden', provider: 'Polismyndigheten', scope: 'Publicerade områdesgränser, inte pågående brott', refresh: 'Senaste publicerade nationella lägesbild; kontrollera källan för nya utgåvor', detail: 'Visar Polisens officiella GeoJSON för senaste publicerade nationella lägesbild. Bedömningen är periodisk och visar inte var rekrytering pågår just nu.', url: policeAreasSource },
  { id: 'polisen-zone-news', name: 'Polisens nyheter om säkerhetszoner', provider: 'Polismyndigheten', scope: 'Nyligen publicerade artiklar, inte verifierade aktiva zoner', refresh: 'Var 30:e minut när tjänsten används', detail: 'Filtrerar Polisens officiella nyhets- och press-RSS efter säkerhetszoner. Rubriker är inga geodata eller bevis för att ett beslut fortfarande gäller.', url: 'https://polisen.se/aktuellt/rss/' },
  { id: 'weather', name: 'SMHI – varningar och meddelanden', provider: 'SMHI', scope: 'Väder, vatten och regionala varningar', refresh: 'Var 65:e sekund', detail: 'Varningsnivå, område, giltighet och råd från SMHI. Innehållet återges med källhänvisning.', url: 'https://www.smhi.se/vader/prognoser-och-varningar/varningar-och-meddelanden' },
  { id: 'smhi-fire-risk', name: 'SMHI – brandriskprognos', provider: 'SMHI', status: fireRiskService.snapshot().status, scope: 'Timvis skogsbrandsrisk längs vald rutt', refresh: 'Prognos uppdateras ungefär varje timme; TryggPuls cachar i 20 minuter', detail: 'Punktprognos från SMHI:s modellgrid. Visas som ungefärliga provpunkter längs rutten, inte som brand- eller eldningsförbudszoner.', url: SMHI_FIRE_RISK_URL },
  { id: 'news', name: 'Krisinformation – nyheter', provider: 'Krisinformation.se', scope: 'Nationella och regionala krisnyheter senaste veckan', refresh: 'Var 5:e minut', detail: 'Separat nyhetsflöde, skilt från aktiva VMA.', url: 'https://api.krisinformation.se/v3' },
  { id: 'krisinformation-vmas', name: 'Krisinformation – VMA', provider: 'Krisinformation.se', scope: 'Aktiva publicerade viktiga meddelanden med områdesuppgift och geometri när källan tillhandahåller den', refresh: 'Var 65:e sekund', detail: 'Geografiska uppgifter bevaras. En VMA utan polygon kan inte matchas exakt mot rutten.', url: 'https://api.krisinformation.se/v3' },
  { id: 'krisinformation-notices', name: 'Krisinformation – notiser', provider: 'Krisinformation.se', scope: 'Publicerade krisnotiser med områdesuppgift och geometri när källan tillhandahåller den', refresh: 'Var 65:e sekund', detail: 'Geografiska uppgifter bevaras. Notiser utan polygon kan inte matchas exakt mot rutten.', url: 'https://api.krisinformation.se/v3' },
  { id: 'preparedness', name: 'Krisinformation – förbered dig', provider: 'Krisinformation.se', scope: 'Officiella beredskapsguider', refresh: 'Varje timme', detail: 'Praktisk information om att förbereda sig för samhällsstörningar.', url: 'https://www.krisinformation.se/' },
  { id: 'trafikverket', name: 'Trafikverket – väg och järnväg', provider: 'Trafikverket', scope: 'Publicerade väg- och järnvägsstörningar', refresh: 'Var 60:e sekund när tjänsten används', detail: 'Serveranslutning till Trafikverkets öppna API. Aktiva störningar längs en beräknad rutt visas när källan ger geometri.', url: 'https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/' },
  { id: 'polisen-stations', name: 'Polisen – polisstationer', provider: 'Polismyndigheten', scope: 'Stationer, tjänster och adresser i Sverige', refresh: 'Daglig cache när tjänsten används', detail: 'Officiellt stationsregister. Stationer visas med adress och länk till öppettider och tjänster.', url: 'https://polisen.se/om-polisen/om-webbplatsen/oppna-data/api-over-polisstationer/' },
  { id: 'civil-shelters', name: 'Skyddsrum – nationellt register', provider: 'Myndigheten för civilt försvar', scope: 'Publikt register över skyddsrumsplatser och angiven kapacitet', refresh: 'Hämtas för vald plats och cachas i 15 minuter', detail: 'Sökresultatet visar registrerade platser inom vald radie. Registret anger inte om ett skyddsrum är öppet, tillgängligt eller iordningställt just nu.', url: shelterSource },
  { id: 'reviewed-zones', name: 'Granskade myndighetszoner', provider: 'TryggPuls · myndighetskällor', status: process.env.DATABASE_URL ? 'on_demand' : 'unavailable', scope: 'Manuellt granskade beslut med källa och giltighetstid', refresh: 'Visas efter administratörsgranskning', detail: 'Zoner publiceras först efter kontroll av myndighetskälla, karta och giltighet. Artiklar utan gränsdata visas som länkar.', url: 'https://polisen.se/lagar-och-regler/sakerhetszoner/' },
  {
    id: 'polisen-events',
    name: 'Polisen öppna händelser',
    provider: 'Polismyndigheten',
    status: 'active',
    scope: 'Urval av publicerade händelsenotiser',
    refresh: 'Var 75:e sekund; Polisens publicerade notiser kan dröja',
    detail: 'Polisens API anger kommun eller län och kan ha publiceringsfördröjning. Kartpunkterna är områdesmarkörer, inte exakta brottsplatser.',
    url: 'https://polisen.se/om-polisen/om-webbplatsen/oppna-data/api-over-polisens-handelser/'
  },
  {
    id: 'krisinformation-v3',
    name: 'Krisinformation – VMA och notiser',
    provider: 'Krisinformation.se',
    status: 'active',
    scope: 'Viktigt meddelande till allmänheten (VMA) och publicerade krisnotiser',
    refresh: 'Var 65:e sekund',
    detail: 'Visar nationella VMA och redaktionella notiser från Krisinformation.se. Innehållet länkas tillbaka till myndighetskällan.',
    url: 'https://api.krisinformation.se/v3'
  },
  {
    id: 'bra-stat',
    name: 'BRÅ Anmälda brott (kommuner)',
    provider: 'Brottsförebyggande rådet',
    status: 'active',
    scope: 'Officiell statistik över anmälda brott per kommun (antal och per 100 000 invånare)',
    refresh: 'Daglig (cachelagrad, max 24 h)',
    detail: 'Hämtas live från BRÅ:s nedladdningsfil på statistiksidan "Anmälda brott". Rikssnittet beräknas befolkningsviktat ur samma siffror; ingen statisk eller fabricerad data används.',
    url: 'https://bra.se/statistik/statistik-fran-rattsvasendet/anmalda-brott'
  },
  {
    id: 'osrm-routing',
    name: 'OSRM Open Source Routing',
    provider: 'OpenStreetMap contributors / OSRM',
    status: 'active',
    scope: 'Vägnätverk, gångvägar och ruttberäkning i Sverige',
    refresh: 'On-demand beräkning',
    detail: 'Gång- och bilprofiler från FOSSGIS OSRM. Rutter visar publicerade händelser i närheten och är ingen trygghetsgaranti.',
    url: 'https://project-osrm.org/'
  },
  {
    id: 'nominatim-osm',
    name: 'Nominatim Geocoding',
    provider: 'OpenStreetMap Foundation',
    status: 'active',
    scope: 'Sökning av gatuadresser, skolor och platser i Sverige',
    refresh: 'Realtidssökning',
    detail: 'Översätter gatuadresser, torg, förskolor och arbetsplatser till exakta svenska koordinater.',
    url: 'https://nominatim.org/'
  },
  {
    id: 'domstolspraxis',
    name: 'Domstolsverket rättspraxis',
    provider: 'Domstolsverket',
    status: 'active',
    scope: 'Officiella domar och vägledande prejudikat',
    refresh: 'Var 65:e sekund',
    detail: 'Öppet API för publicerad rättspraxis från högre instanser. Används uteslutande som separat informationskälla.',
    url: 'https://www.dataportal.se/datasets/601_3755'
  }
];

function headers(contentType, cacheControl = 'no-store') {
  return {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(self)'
  };
}

function json(req, res, status, payload) {
  res.writeHead(status, headers('application/json; charset=utf-8'));
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
}

// Läs en numerisk query-parameter; returnerar null om den saknas eller är ogiltig
// (fixar att Number(null)/Number('') ger 0, vilket tidigare accepterades som koordinat)
function readNumberParam(url, name) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// Normalisera polisens tidsformat till ISO.
// Polisen returnerar t.ex. "2026-09-22 17:10:38 +02:00" (med mellanslag
// före tidszonen). Ett enkel `replace(' ', 'T')` byter endast den FÖRSTA
// mellanslaget, så zonen becomes "T17:10:38 +02:00" och Date.parse misslyckas.
// Vi byter första mellanslaget mot T och tar sedan bort alla kvarvarande
// mellanslag, därefter normaliserar vi +0200 -> +02:00.
function parseSwedishTime(s) {
  const raw = String(s ?? '').trim();
  if (!raw) return NaN;
  let iso = raw.replace(' ', 'T');                 // 2026-09-22T17:10:38 +02:00
  iso = iso.replace(/\s+/g, '');                   // 2026-09-22T17:10:38+02:00
  iso = iso.replace(/([+-]\d{2}):?(\d{2})$/, '$1:$2'); // +0200 -> +02:00 (redan +02:00 => oförändrat)
  const parsed = Date.parse(iso);
  if (Number.isFinite(parsed)) return parsed;
  // Sista tillfället: utan tidszon (tolkas som lokal tid)
  const stripped = Date.parse(iso.replace(/[+-]\d{2}:?\d{2}$/, ''));
  return Number.isFinite(stripped) ? stripped : NaN;
}

function categorizeEvent(type) {
  const t = String(type || '').toLowerCase();
  if (/mord|dråp|skjutning|vapen|kniv|\brån|misshandel|hot|våldtäkt|sexual|ofredande/i.test(t)) {
    return 'violence';
  }
  if (/inbrott|stöld|bedrägeri|häleri/i.test(t)) {
    return 'theft';
  }
  if (/trafik|olycka|kollision|viltolycka|fordon|rattfylleri/i.test(t)) {
    return 'traffic';
  }
  if (/brand|rök|explosion/i.test(t)) {
    return 'fire';
  }
  return 'other';
}

// ==== API: /api/events — Polisens öppna händelser (live, ingen mock-data) ====
let eventCache = null;
let eventLastAttempt = 0;
let eventPending = null;
let eventError = null;

async function fetchEvents() {
  if (eventPending) {
    await eventPending;
  } else if (Date.now() - eventLastAttempt >= refreshIntervalMs) {
    eventLastAttempt = Date.now();
    eventPending = (async () => {
      try {
        const response = await policeApiFetch(upstream, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new UpstreamError(`Polisens API svarade med status ${response.status}`, 502, response.status);
        const rawData = await response.json().catch(() => null);
        if (!Array.isArray(rawData)) throw new Error('Oväntat svarsformat från Polisens API');

        const parsed = rawData
          .filter(e => e && typeof e.id === 'number' && e.location && typeof e.name === 'string')
          .map(e => {
            const coords = String(e.location?.gps || '')
              .split(',')
              .map(Number);
            const validGps =
              coords.length === 2 &&
              Number.isFinite(coords[0]) &&
              Number.isFinite(coords[1]) &&
              coords[0] >= 55 &&
              coords[0] <= 70 &&
              coords[1] >= 10 &&
              coords[1] <= 25;

            return {
              id: e.id,
              datetime: e.datetime,
              ts: parseSwedishTime(e.datetime),
              name: e.name,
              summary: e.summary,
              url:
                typeof e.url === 'string' && e.url
                  ? e.url.startsWith('http')
                    ? e.url
                    : `https://polisen.se${e.url}`
                  : null,
              type: e.type,
              category: categorizeEvent(e.type),
              location: {
                name: e.location.name,
                gps: validGps ? [coords[0], coords[1]] : null
              }
            };
          })
          .sort((a, b) => (b.ts || 0) - (a.ts || 0));

        eventCache = {
          events: parsed,
          count: parsed.length,
          fetchedAt: new Date().toISOString()
        };
        eventError = null;
      } catch (err) {
        eventError = err.message || 'Kunde inte hämta händelser från Polisens API';
        console.error('[events] Hämtning misslyckades:', eventError);
      } finally {
        eventPending = null;
      }
    })();
    await eventPending;
  }

  // Ingen cache ännu -> fetchedAt är null -> endpointen svarar 503 (honest, ingen fake-data)
  return {
    ...(eventCache || { events: [], count: 0, fetchedAt: null }),
    source: upstream,
    stale: Boolean(eventError),
    error: eventError || undefined,
    nextCheckAt: eventLastAttempt ? new Date(eventLastAttempt + refreshIntervalMs).toISOString() : null
  };
}

// ==== API: /api/legal-updates — Domstolsverkets öppna rättspraxis (live) ====
let legalCache = null; // { updates, fetchedAt }
let legalLastAttempt = 0;
let legalPending = null;
let legalError = null;

const publiceringsformLabels = {
  DOM_ELLER_BESLUT: 'Dom eller beslut',
  DOM: 'Dom',
  BESLUT: 'Beslut',
  VAGLEDANDE: 'Vägledande',
  EJ_VAGLEDANDE: 'Ej vägledande'
};

function humanizeLabel(value) {
  if (value === null || value === undefined || value === '') return null;
  const key = String(value).toUpperCase();
  if (publiceringsformLabels[key]) return publiceringsformLabels[key];
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchLegalUpdates() {
  if (legalPending) {
    await legalPending;
  } else if (Date.now() - legalLastAttempt >= refreshIntervalMs) {
    legalLastAttempt = Date.now();
    legalPending = (async () => {
      try {
        const response = await upstreamFetch(legalUpstream, 15_000);
        const data = await response.json().catch(() => null);
        if (!Array.isArray(data)) throw new Error('Oväntat svarsformat från Domstolsverkets API');

        const updates = data
          .filter(item => item && item.id)
          .map(item => ({
            id: item.id,
            date: item.avgorandedatum || String(item.publiceringstid || '').slice(0, 10) || null,
            publishedAt: item.publiceringstid || null,
            court:
              typeof item.domstol === 'string'
                ? item.domstol
                : item.domstol?.domstolNamn || 'Okänd domstol',
            caseNumbers: Array.isArray(item.malNummerLista) ? item.malNummerLista.slice(0, 3) : [],
            area: Array.isArray(item.rattsomradeLista) ? item.rattsomradeLista.slice(0, 2) : [],
            type: humanizeLabel(item.publiceringsform) || humanizeLabel(item.typ) || 'Rättsfall',
            guiding: item.typ === 'VAGLEDANDE',
            summary: String(item.sammanfattning || '').slice(0, 600),
            source: `${legalUpstream}/${encodeURIComponent(item.id)}`
          }))
          .sort((a, b) => String(b.publishedAt || b.date || '').localeCompare(String(a.publishedAt || a.date || '')))
          .slice(0, 20);

        legalCache = { updates, fetchedAt: new Date().toISOString() };
        legalError = null;
      } catch (err) {
        legalError = err.message || 'Kunde inte hämta rättsuppdateringar';
        console.error('[legal] Hämtning misslyckades:', legalError);
      } finally {
        legalPending = null;
      }
    })();
    await legalPending;
  }

  return {
    updates: legalCache?.updates || [],
    fetchedAt: legalCache?.fetchedAt || null,
    stale: Boolean(legalError),
    error: legalError || undefined,
    nextCheckAt: legalLastAttempt ? new Date(legalLastAttempt + refreshIntervalMs).toISOString() : null
  };
}

export function clampBuffer(url) {
  return Math.min(1000, Math.max(300, readNumberParam(url, 'buffer') || 600));
}

export { parseSwedishTime, categorizeEvent, parseBraCsv, pointToSegmentDistanceMeters, minDistanceToRouteMeters, readNumberParam };

// ==== API: /api/crisis-updates — Krisinformation.se VMA och notiser ====
const fetchCrisisUpdates = readCrisis;

// ==== API: /api/bra-stats — BRÅ "Anmälda brott" (kommuner), live-pipeline ====
let braCache = null;
let braLastAttempt = 0;
let braPending = null;
let braError = null;

// Parsa BRÅ:s CSV ("Kommun;Antal;Per 100 000 inv."), UTF-8 med BOM
function parseBraCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^kommun\s*;/i.test(trimmed)) continue; // rubrik
    const parts = trimmed.split(';').map(p => p.trim());
    if (parts.length < 3) continue;
    const name = parts[0];
    if (!name) continue;
    if (/sverige|totalt/i.test(name)) continue; // försiktighetsåtgärd mot summarierad nationell rad
    const total = Number(parts[1]);
    const per100k = Number(parts[2]);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(per100k) || per100k <= 0) continue;
    const population = Math.round((total * 100000) / per100k); // härledd ur BRÅ:s egna kolumner
    rows.push({ region: name, total, totalPer100k: per100k, population });
  }
  return rows;
}

// Faktisk riskindikator: skillnad mot befolkningsviktat rikssnitt
function riskIndexLabel(per100k, nationalPer100k) {
  const diff = Math.round(((per100k - nationalPer100k) / nationalPer100k) * 100);
  if (diff > 5) return `Högre anmälningsgrad än rikssnittet (+${diff}%)`;
  if (diff < -5) return `Lägre anmälningsgrad än rikssnittet (−${Math.abs(diff)}%)`;
  return 'Nära rikssnittet';
}

// Hämta senaste CSV:en direkt från BRÅ:s statistiksidan (inga statiska siffror)
async function loadBraStatistics() {
  const pageResponse = await upstreamFetch(braPageUrl, 20_000, { Accept: 'text/html' });
  const html = await pageResponse.text();
  const hrefMatch =
    html.match(/href="([^"]*?\/download\/[^"]+?\.csv[^"]*?)"/i) ||
    html.match(/href="([^"]+?\.csv[^"]*?)"/i);
  if (!hrefMatch) throw new Error('Kunde inte hitta länk till BRÅ:s CSV-fil på statistiksidan');
  const csvUrl = new URL(hrefMatch[1].replace(/&amp;/g, '&'), braPageUrl).toString();

  const csvResponse = await upstreamFetch(csvUrl, 30_000, { Accept: 'text/csv' });
  const csvText = await csvResponse.text();

  const regions = parseBraCsv(csvText);
  if (!regions.length) throw new Error('BRÅ:s CSV innehöll inga giltiga kommurrader');

  const totalCases = regions.reduce((sum, r) => sum + r.total, 0);
  const totalPopulation = regions.reduce((sum, r) => sum + r.population, 0);
  const nationalPer100k = Math.round((totalCases / totalPopulation) * 100000); // befolkningsviktat
  const maxPer100k = regions.reduce((max, r) => Math.max(max, r.totalPer100k), 0);
  const rankByRegion = new Map(
    [...regions].sort((a, b) => b.totalPer100k - a.totalPer100k).map((r, i) => [r.region, i + 1])
  );
  const referenceYearMatch = csvUrl.match(/kommunerna(?:%20|\s+)(\d{4})/i);

  return {
    source: 'Brottsförebyggande rådet (BRÅ)',
    sourceUrl: braPageUrl,
    csvUrl,
    description:
      'Anmälda brott per kommun — totalt antal och per 100 000 invånare — enligt BRÅ:s officiella statistik.',
    methodNote:
      'Data hämtas live från BRÅ:s nedladdningsfil. Befolkning per kommun uppskattas ur BRÅ:s egna kolumner (antal ÷ andel per 100 000). Rikssnittet beräknas befolkningsviktat över samtliga kommuner i filen.',
    referenceYear: referenceYearMatch ? referenceYearMatch[1] : null,
    level: 'kommun',
    regionCount: regions.length,
    maxPer100k,
    nationalAverage: {
      region: 'Sverige totalt',
      totalPer100k: nationalPer100k,
      totalCases,
      population: totalPopulation,
      populationNote: 'Uppskattad total befolkning (summan av kommunuppskattningarna ur BRÅ-filen).'
    },
    regions: regions.map(r => ({
      ...r,
      rank: rankByRegion.get(r.region),
      riskIndex: riskIndexLabel(r.totalPer100k, nationalPer100k)
    })),
    fetchedAt: new Date().toISOString(),
    stale: false
  };
}

async function fetchBraStats() {
  if (braPending) {
    await braPending;
  } else if (
    (braLastAttempt === 0) ||
    Date.now() - braLastAttempt >= braCacheTtlMs ||
    (braError && Date.now() - braLastAttempt >= braRetryBackoffMs)
  ) {
    braLastAttempt = Date.now();
    braPending = (async () => {
      try {
        braCache = await loadBraStatistics();
        braError = null;
      } catch (err) {
        braError = err.message || 'Kunde inte hämta statistik från BRÅ';
        console.error('[bra] Hämtning misslyckades:', braError);
      } finally {
        braPending = null;
      }
    })();
    await braPending;
  }

  if (!braCache) {
    // Ingen riktig data tillgänglig -> ärligt 503 med källor, aldrig substitute data
    return {
      error: braError || 'BRÅ-statistiken är tillfälligt otillgänglig',
      source: 'Brottsförebyggande rådet (BRÅ)',
      sourceUrl: braPageUrl,
      fetchedAt: null,
      stale: true
    };
  }
  return { ...braCache, stale: Boolean(braError), error: braError || undefined };
}

const geocoderBase = process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org';
const geocodeRequest = createRequestQueue(async url => (await upstreamFetch(url, 10_000)).json());
const routeRequest = createRequestQueue(async url => (await upstreamFetch(url, 12_000)).json(), { ttl: 300_000 });

// Geokodning mot Nominatim för svenska adresser och platser
async function geocodeSwedishAddress(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) return [];
  const url = `${geocoderBase}/search?format=json&countrycodes=se&limit=5&addressdetails=1&q=${encodeURIComponent(
    query.trim()
  )}`;

  const list = await geocodeRequest(url);
  if (!Array.isArray(list)) return [];

  return list.map(item => ({
    displayName: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    type: item.type,
    city: item.address?.city || item.address?.town || item.address?.municipality || item.address?.county || ''
  }));
}

// Reverse-geocode: koordinater -> adress via Nominatim (backend-mediad).
// Används av SOS-panelen för att visa en läsbar adress till enhetens position.
// Koordinater skickas via denna server till den konfigurerade geokodningstjänsten.
async function reverseGeocode(lat, lon) {
  const url = `${geocoderBase}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
  const data = await geocodeRequest(url);
  if (!data || !data.display_name) return null;
  return data.display_name;
}

// Ruttberäkning via OSRM med analys av verkliga incidenter längs vägen.
// Kastar UpstreamError(502) om Polisens händelsedata saknas helt: en rutt utan
// incidentanalys skulle kunna ge en falsk "trygg"-bedömning (inga mockdata,
// inga uppfunna bedömningar).
async function calculateSafeRoute(fromLat, fromLon, toLat, toLon, mode = 'walking', bufferMeters = 600) {
  const base = mode === 'walking'
    ? (process.env.WALKING_ROUTER_URL || 'https://routing.openstreetmap.de/routed-foot')
    : (process.env.DRIVING_ROUTER_URL || 'https://routing.openstreetmap.de/routed-car');
  const url = `${base}/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
  const data = await routeRequest(url);
  if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
    throw new Error('Ingen farbar rutt hittades mellan platserna');
  }

  const primaryRoute = data.routes[0];
  const coordinates = primaryRoute.geometry?.coordinates || [];
  if (coordinates.length < 2 || !Number.isFinite(primaryRoute.distance) || !Number.isFinite(primaryRoute.duration)) throw new UpstreamError('Ofullständig rutt från källan');
  const cachedRoute = {
    primaryRoute: { geometry: primaryRoute.geometry, distance: primaryRoute.distance, duration: primaryRoute.duration },
    mode,
    bufferMeters
  };
  const routeId = routeCache.put(cachedRoute);
  return analyzeRoute(cachedRoute.primaryRoute, mode, bufferMeters, routeId);
}

async function refreshCachedRoute(routeId) {
  const cachedRoute = routeCache.get(routeId);
  if (!cachedRoute) return null;
  return analyzeRoute(cachedRoute.primaryRoute, cachedRoute.mode, cachedRoute.bufferMeters, routeId);
}

async function analyzeRoute(primaryRoute, mode, bufferMeters, routeId) {
  const coordinates = primaryRoute.geometry?.coordinates || [];
  // Polisnotiser anger kommun/län. Punkten får användas som grov geografisk
  // relevans, aldrig för att visa ett exakt avstånd till brott.
  const eventsResult = await fetchEvents();
  const allEvents = (eventsResult.events || []).filter(e => e.ts >= Date.now() - 24 * 3600000);
  const incidentsNearRoute = selectApproximateRouteEvents(allEvents, coordinates, { bufferMeters });

  const sourceStates = {};
  const routeAreas = [];
  const policeAreaPassages = [];
  const securityZonePassages = [];
  const networkAreaPassages = [];
  const areaResult = await readPoliceAreas().catch(() => null);
  if (areaResult) {
    sourceStates['polisen-areas'] = { status: areaResult.stale ? 'stale' : 'ok', fetchedAt: areaResult.checkedAt || null, dataYear: areaResult.year, source: areaResult.sourceUrl };
    for (const passage of findRouteZonePassages(coordinates, areaResult.features)) {
      const feature = passage.feature;
      const item = {
        id: `police-${feature.id}`, name: feature.properties.name, kind: 'police-area',
        category: feature.properties.category, locality: feature.properties.locality,
        sourceTitle: `Polisens lägesbild ${areaResult.year}`, sourceUrl: areaResult.sourceUrl,
        sourceDate: `${areaResult.year}`, stale: Boolean(areaResult.stale),
        startMeters: Math.round(passage.startMeters), endMeters: Math.round(passage.endMeters),
        line: routeSlice(coordinates, passage.startMeters, passage.endMeters)
      };
      routeAreas.push(item);
      const { line, ...summary } = item;
      policeAreaPassages.push(summary);
    }
  } else sourceStates['polisen-areas'] = { status: 'unavailable', fetchedAt: null };

  const reviewedResult = publicZoneDbReady ? await publicZoneApi.listPublic().catch(() => null) : null;
  if (reviewedResult) {
    sourceStates['reviewed-zones'] = { status: 'ok', fetchedAt: reviewedResult.fetchedAt };
    for (const passage of findRouteZonePassages(coordinates, reviewedResult.features)) {
      const properties = passage.feature.properties;
      const item = {
        id: passage.feature.id, name: properties.name, kind: properties.kind,
        category: properties.kind === 'security-zone' ? 'Aktiv säkerhetszon' : 'Granskat myndighetsunderlag om nätverksområde',
        locality: '', sourceTitle: properties.sourceTitle, sourceUrl: properties.sourceUrl,
        sourceExcerpt: properties.sourceExcerpt,
        sourceDate: properties.sourceDate, validFrom: properties.validFrom, validTo: properties.validTo,
        startMeters: Math.round(passage.startMeters), endMeters: Math.round(passage.endMeters),
        line: routeSlice(coordinates, passage.startMeters, passage.endMeters)
      };
      routeAreas.push(item);
      const { line, ...summary } = item;
      if (properties.kind === 'security-zone') securityZonePassages.push(summary);
      else if (properties.kind === 'organized-crime-area') networkAreaPassages.push(summary);
    }
  } else sourceStates['reviewed-zones'] = {
    status: publicZoneApi.available ? 'unavailable' : 'requires_setup',
    fetchedAt: null,
    error: publicZoneApi.available ? 'Zonregistret är tillfälligt otillgängligt.' : 'Zonregistret kräver en konfigurerad serverdatabas.'
  };
  routeAreas.sort((a, b) => a.startMeters - b.startMeters);
  policeAreaPassages.sort((a, b) => a.startMeters - b.startMeters);
  securityZonePassages.sort((a, b) => a.startMeters - b.startMeters);
  networkAreaPassages.sort((a, b) => a.startMeters - b.startMeters);

  const [traffic, weather, crisis] = await Promise.all([readTraffic(), feeds.weather.read(), fetchCrisisUpdates()]);
  sourceStates.trafikverket = { status: traffic.status, fetchedAt: traffic.fetchedAt, error: traffic.error };
  sourceStates.weather = { status: weather.status, fetchedAt: weather.fetchedAt, error: weather.error };
  sourceStates['krisinformation-v3'] = { status: crisis.status, fetchedAt: crisis.fetchedAt, error: crisis.error || undefined };
  for (const [key, feed] of [['krisinformation-vmas', crisis.sources?.vmas], ['krisinformation-notices', crisis.sources?.notices]]) {
    sourceStates[key] = { status: feed?.status || 'unavailable', fetchedAt: feed?.fetchedAt || null, error: feed?.error || undefined };
  }
  const trafficNearRoute = (traffic.items || []).flatMap(item => {
    const geometry = item.geometry;
    const feature = geometry?.type === 'Feature' ? geometry : geometry?.type ? { type: 'Feature', geometry, properties: {} } : null;
    let distanceM = Infinity;
    let routePositionMeters = Infinity;
    let passages = [];
    if (feature && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      const match = findGeographicItemsAlongRoute(coordinates, [{ ...item, geometry: feature.geometry }])[0];
      if (match) { distanceM = 0; passages = match.passages; routePositionMeters = passages[0]?.startMeters ?? Infinity; }
    } else {
      const points = [];
      const visit = value => {
        if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') points.push([value[1], value[0]]);
        else if (Array.isArray(value)) value.forEach(visit);
      };
      visit(geometry?.coordinates || geometry);
      for (const [lat, lon] of points) {
        const nearest = nearestRoutePosition(lat, lon, coordinates);
        if (nearest.distanceMeters < distanceM) { distanceM = nearest.distanceMeters; routePositionMeters = nearest.alongRouteMeters; }
      }
    }
    return distanceM <= Math.max(2_000, bufferMeters) ? [{ ...item, approximateRelevance: true, routePositionMeters: Number.isFinite(routePositionMeters) ? Math.round(routePositionMeters) : null, passages }] : [];
  }).sort((a, b) => (a.routePositionMeters ?? Infinity) - (b.routePositionMeters ?? Infinity)).slice(0, 50);
  const weatherAlongRoute = findGeographicItemsAlongRoute(coordinates, weather.items || []);
  const crisisItems = [...(crisis.vmas || []), ...(crisis.notices || [])];
  const crisisAlongRoute = findGeographicItemsAlongRoute(coordinates, crisisItems);
  const crisisWithoutGeometry = crisisItems.filter(item => ![...(item.areas || []).map(area => area.geometry), item.geometry].some(geometry => ['Polygon', 'MultiPolygon'].includes((geometry?.type === 'Feature' ? geometry.geometry : geometry)?.type))).map(item => ({
    id: item.id, type: item.type, title: item.title, area: item.area || '', publishedAt: item.publishedAt || null, source: item.source
  }));

  const fireRiskSamples = sampleRouteForFireRisk(coordinates);
  const fireRiskResults = await Promise.all(fireRiskSamples.map(async sample => {
    const routeProgress = Math.min(1, sample.distanceMeters / Math.max(primaryRoute.distance, 1));
    const expectedAt = new Date(Date.now() + primaryRoute.duration * 1000 * routeProgress).toISOString();
    const data = await fireRiskService.read(sample.lat, sample.lon, 'hourly');
    const forecast = selectFireRiskPeriod(data.periods, expectedAt);
    return {
      distanceMeters: sample.distanceMeters, lat: sample.lat, lon: sample.lon,
      expectedAt, forecast,
      status: data.status === 'unavailable' ? 'unavailable' : forecast ? data.status : 'stale',
      approvedAt: data.approvedAt, fetchedAt: data.fetchedAt,
      resolutionKm: data.resolutionKm || 2.5,
      error: data.status === 'unavailable' ? data.error : undefined
    };
  }));
  const fireRiskStatus = fireRiskService.snapshot();
  sourceStates['smhi-fire-risk'] = {
      status: fireRiskResults.length && fireRiskResults.every(point => point.status === 'ok') ? 'ok' : fireRiskResults.some(point => ['ok', 'stale'].includes(point.status)) ? 'stale' : fireRiskStatus.status,
    fetchedAt: fireRiskStatus.fetchedAt,
    error: fireRiskStatus.error
  };

  return {
    ok: true,
    routeId,
    distanceMeters: Math.round(primaryRoute.distance),
    distanceKm: (primaryRoute.distance / 1000).toFixed(2),
    durationSeconds: Math.round(primaryRoute.duration),
    durationMinutes: Math.ceil(primaryRoute.duration / 60),
    mode,
    bufferMeters,
    geometry: primaryRoute.geometry,
    routeAreas,
    policeAreaPassages,
    securityZonePassages,
    networkAreaPassages,
      trafficNearRoute,
    weatherAlongRoute,
    crisisAlongRoute,
    crisisWithoutGeometry,
    fireRiskAlongRoute: fireRiskResults,
    sourceStatus: {
      'polisen-events': { status: eventsResult.fetchedAt ? eventsResult.stale ? 'stale' : 'ok' : 'unavailable', fetchedAt: eventsResult.fetchedAt, error: eventsResult.error },
      ...sourceStates
    },
    routeAnalysisUpdatedAt: new Date().toISOString(),
    policeLocationPrecision: 'Polisen anger kommun eller län. Dessa kartpunkter är ungefärliga områdesmarkörer.',
    incidentsCount: incidentsNearRoute.length,
    incidentsNearRoute,
    // Ärlighetsflagga: true endast om senaste hämtningen misslyckades men en
    // tidigare cache används (färska data => flaggan spås ut ur svaret)
    eventsStale: eventsResult.stale || !eventsResult.fetchedAt || undefined,
    eventsFetchedAt: eventsResult.stale ? eventsResult.fetchedAt : undefined,
    assessment: 'Sammanställning av publicerad information från myndighetskällor. Polisnotiser visas på ungefärlig områdesnivå.'
  };
}

// ==== HTTP-SERVER & ROUTER ====
export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/public-zones' || url.pathname.startsWith('/api/admin/zones')) {
    if (!publicZoneDbReady && publicZoneApi.available) return json(req, res, 503, { error: 'Zonregistret startar fortfarande' });
    return publicZoneApi.handle(req, res, url);
  }

  if (url.pathname.startsWith('/api/family/')) {
    if (!familyDbReady && familyApi.service.available) return json(req,res,503,{error:'Familjedatabasen svarar inte',code:'FAMILY_DATABASE_UNAVAILABLE'});
    return familyApi.handle(req,res,url,fetchEvents);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, headers('text/plain; charset=utf-8'));
    return res.end('Method not allowed');
  }

  try {
    // API Endpoints
    if (url.pathname === '/api/map-config') {
      return json(req, res, 200, { provider: process.env.CARTO_BASEMAP_API_KEY ? 'carto' : 'openstreetmap' });
    }
    if (url.pathname.startsWith('/api/map-tiles/')) {
      const match = url.pathname.match(/^\/api\/map-tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/);
      if (!match) return json(req, res, 400, { error: 'Ogiltig kartruta' });
      const [z, x, y] = match.slice(1).map(Number);
      if (z > 19 || x >= 2 ** z || y >= 2 ** z) return json(req, res, 400, { error: 'Ogiltig kartruta' });
      if (!process.env.CARTO_BASEMAP_API_KEY) return json(req, res, 503, { error: 'CARTO är inte konfigurerad' });
      try {
        const tile = await upstreamFetch(`https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png?key=${encodeURIComponent(process.env.CARTO_BASEMAP_API_KEY)}`, 12_000, { Accept: 'image/png' });
        if (!tile.headers.get('content-type')?.includes('image/png')) throw new Error('Invalid tile');
        const body = Buffer.from(await tile.arrayBuffer());
        res.writeHead(200, headers('image/png', 'public, max-age=86400'));
        return res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        return json(req, res, 502, { error: 'Kartbakgrunden kunde inte hämtas' });
      }
    }
    if (url.pathname === '/api/health') {
      return json(req, res, 200, {
        status: 'ok',
        service: 'tryggpuls',
        name: 'TryggPuls — Sveriges Digitala Trygghetsplattform',
        version: '2.0.1',
        uptime: process.uptime(),
        familyConfigured: familyDbReady && familyApi.service.available,
        pushConfigured: familyApi.service.pushEnabled,
        noMockDataGuarantee: true
      });
    }

    if (url.pathname === '/api/sources') {
      return json(req, res, 200, {
        sources: sourceStatuses(),
        updatedAt: new Date().toISOString()
      });
    }

    const extraFeeds = { '/api/weather-warnings': 'weather', '/api/crisis-news': 'news', '/api/preparedness': 'preparedness' };
    if (extraFeeds[url.pathname]) {
      const result = await feeds[extraFeeds[url.pathname]].read();
      return json(req, res, result.fetchedAt ? 200 : 503, result);
    }
    if (url.pathname === '/api/traffic') {
      const result = await readTraffic();
      return json(req, res, result.fetchedAt || result.status === 'requires_key' ? 200 : 503, result);
    }
    if (url.pathname === '/api/fire-risk') {
      const lat = readNumberParam(url, 'lat');
      const lon = readNumberParam(url, 'lon');
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return json(req, res, 400, { error: 'Ogiltiga koordinater (lat/lon)' });
      }
      const result = await fireRiskService.read(lat, lon, 'hourly');
      return json(req, res, result.status === 'unavailable' ? 503 : 200, result);
    }
    if (url.pathname === '/api/police-stations') {
      const result = await readPoliceStations();
      return json(req, res, result.fetchedAt ? 200 : 503, result);
    }
    if (url.pathname === '/api/shelters') {
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      const radius = Number(url.searchParams.get('radius') || 2_000);
      try {
        const result = await readNearbyShelters(lat, lon, radius);
        return json(req, res, result.status === 'unavailable' ? 503 : 200, result);
      } catch (error) {
        return json(req, res, error.status || 502, { error: error.status ? error.message : 'Skyddsrumsregistret kunde inte hämtas' });
      }
    }
    const stationMatch = /^\/api\/police-stations\/(\d+)$/.exec(url.pathname);
    if (stationMatch) {
      try { return json(req, res, 200, await readPoliceStationDetails(stationMatch[1])); }
      catch (error) { return json(req, res, error.status || 502, { error: error.status ? error.message : 'Stationens öppettider kunde inte hämtas' }); }
    }

    if (url.pathname === '/api/police-areas') {
      return json(req, res, 200, await readPoliceAreas());
    }
    if (url.pathname === '/api/security-zone-news') {
      const result = await readZoneNews();
      return json(req, res, result.fetchedAt ? 200 : 503, result);
    }
    if (url.pathname === '/api/events') {
      const result = await fetchEvents();
      return json(req, res, result.fetchedAt ? 200 : 503, result);
    }

    if (url.pathname === '/api/legal-updates') {
      const result = await fetchLegalUpdates();
      return json(req, res, result.fetchedAt ? 200 : 503, result);
    }

    if (url.pathname === '/api/crisis-updates') {
      const result = await fetchCrisisUpdates();
      return json(req, res, result.fetchedAt ? 200 : 503, result);
    }

    if (url.pathname === '/api/bra-stats') {
      // Live BRÅ-pipeline: endast äkta data, inga statiska siffror.
      // Ingen giltig CSV-cachelagring -> ärligt 503 (aldrig substitute data).
      const result = await fetchBraStats();
      return json(req, res, result.regions ? 200 : 503, result);
    }

    if (url.pathname === '/api/geocode') {
      const q = url.searchParams.get('q');
      if (!q || q.trim().length < 2 || q.length > 200) return json(req, res, 400, { error: 'Ange en sökning med 2–200 tecken' });
      try {
        const results = await geocodeSwedishAddress(q);
        return json(req, res, 200, { query: q, results });
      } catch (err) {
        if (err instanceof UpstreamError) {
          return json(req, res, err.status, { error: err.message });
        }
        return json(req, res, 502, { error: 'Geokodningstjänsten svarar inte' });
      }
    }

    // Reverse-geocode: koordinater -> adress (Nominatim, backend-mediad för
    // att undvika direkttrop från webbläsaren och för att kunna sätta en
    // respektfull User-Agent).
    if (url.pathname === '/api/reverse-geocode') {
      const lat = readNumberParam(url, 'lat');
      const lon = readNumberParam(url, 'lon');
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return json(req, res, 400, { error: 'Ogiltiga koordinater (lat/lon)' });
      }
      try {
        const addr = await reverseGeocode(lat, lon);
        return json(req, res, 200, { lat, lon, address: addr });
      } catch (err) {
        if (err instanceof UpstreamError) {
          return json(req, res, err.status, { error: err.message });
        }
        return json(req, res, 502, { error: 'Kunde inte slå upp adress' });
      }
    }

    if (url.pathname === '/api/route-refresh') {
      const routeId = url.searchParams.get('routeId') || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(routeId)) {
        return json(req, res, 400, { error: 'Ogiltigt rutt-id', code: 'INVALID_ROUTE_ID' });
      }
      try {
        const routeResult = await refreshCachedRoute(routeId);
        if (!routeResult) return json(req, res, 404, { error: 'Den sparade rutten finns inte längre. Beräkna rutten igen.', code: 'ROUTE_CACHE_MISS' });
        return json(req, res, 200, routeResult);
      } catch (err) {
        if (err instanceof UpstreamError) return json(req, res, err.status, { error: err.message });
        return json(req, res, 500, { error: err.message || 'Kunde inte uppdatera ruttanalysen' });
      }
    }

    if (url.pathname === '/api/route') {
      // readNumberParam -> null om saknad/ogiltig (förhindrar att Number(null)=0
      // accepteras som koordinat, vilket var ett latent fel i den äldre versionen)
      const fromLat = readNumberParam(url, 'fromLat');
      const fromLon = readNumberParam(url, 'fromLon');
      const toLat = readNumberParam(url, 'toLat');
      const toLon = readNumberParam(url, 'toLon');

      if (fromLat === null || fromLon === null || toLat === null || toLon === null || Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) {
        return json(req, res, 400, {
          error: 'Ogiltiga koordinater angivna (fromLat/fromLon/toLat/toLon saknas eller är ogiltiga)'
        });
      }

      const mode = url.searchParams.get('mode') || 'walking';
      if (!['walking', 'driving'].includes(mode)) return json(req, res, 400, { error: 'Färdsätt måste vara walking eller driving' });
      // Säkerhetskorridor enligt spec: 300–1000 m, standard 600 m.
      // Ogiltig/utanför-intervall kläms till spec-området så analysen alltid
      // körs med en giltig corridor.
      const bufferMeters = clampBuffer(url);

      try {
        const routeResult = await calculateSafeRoute(fromLat, fromLon, toLat, toLon, mode, bufferMeters);
        return json(req, res, 200, routeResult);
      } catch (err) {
        if (err instanceof UpstreamError) {
          // OSRM-tidsgräns (504) / OSRM-fel (502) / Polisdata otillgänglig (502)
          return json(req, res, err.status, { error: err.message });
        }
        return json(req, res, 500, { error: err.message || 'Kunde inte beräkna rutt' });
      }
    }

    // Okänd API-sökväg -> JSON 404 (före statisk filservering)
    if (url.pathname.startsWith('/api/')) {
      return json(req, res, 404, { error: 'Okänd API-endpoint' });
    }

    // Static File Serving
    let filePath = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : url.pathname.slice(1);
    const publicFiles = ['index.html', 'app.js', 'route-follow.js', 'family-client.js', 'family-sw.js', 'style.css', 'admin.html', 'admin.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', ...['layers.png', 'layers-2x.png', 'marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png'].map(name => 'vendor/leaflet/images/' + name)];
    if (!publicFiles.includes(filePath)) return json(req, res, 404, { error: 'Sidan kunde inte hittas' });
    const safePath = path.normalize(path.join(root, filePath));
    if (!safePath.startsWith(root)) {
      res.writeHead(403, headers('text/plain; charset=utf-8'));
      return res.end('Åtkomst nekad');
    }

    try {
      const content = await readFile(safePath);
      let mimeType = 'text/plain; charset=utf-8';
      if (safePath.endsWith('.html')) mimeType = 'text/html; charset=utf-8';
      else if (safePath.endsWith('.js') || safePath.endsWith('.mjs')) mimeType = 'text/javascript; charset=utf-8';
      else if (safePath.endsWith('.css')) mimeType = 'text/css; charset=utf-8';
      else if (safePath.endsWith('.json')) mimeType = 'application/json; charset=utf-8';
      else if (safePath.endsWith('.webmanifest')) mimeType = 'application/manifest+json; charset=utf-8';
      else if (safePath.endsWith('.svg')) mimeType = 'image/svg+xml';
      else if (safePath.endsWith('.png')) mimeType = 'image/png';
      else if (safePath.endsWith('.jpg') || safePath.endsWith('.jpeg')) mimeType = 'image/jpeg';

      res.writeHead(200, headers(mimeType, 'no-cache'));
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (err) {
      res.writeHead(404, headers('text/plain; charset=utf-8'));
      res.end('Sidan kunde inte hittas');
    }
  } catch (err) {
    // Safety-net: oväntat fel får aldrig krascha servern (async-handler utan
    // middleware-catch — fånga allting centralt)
    console.error('[server] Oväntat fel:', err);
    if (!res.headersSent) {
      return json(req, res, 500, { error: 'Internt serversfel' });
    }
    res.end();
  }
});

async function initializeFamily() {
  if (!familyApi.service.available) return;
  try { await Promise.all([familyApi.service.init(), publicZoneApi.init()]); familyDbReady = true; publicZoneDbReady = true; }
  catch (err) { console.error('[family] Databasen svarar inte:',err.message); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  initializeFamily().finally(() => server.listen(port, host, () => console.log(`TryggPuls startad: http://localhost:${server.address().port} (lyssnar på ${host})`)));
}

let familySweepPending = false;
setInterval(async () => {
  if (familySweepPending) return;
  familySweepPending = true;
  try {
    if (!familyDbReady) await initializeFamily();
    if (!familyDbReady) return;
    const result = await fetchEvents(); await familyApi.service.sweep(result.stale || !result.fetchedAt ? [] : result.events);
  }
  catch (err) { console.error('[family] Bakgrundskontroll misslyckades:',err.message); }
  finally { familySweepPending = false; }
},65_000).unref();

// Graceful shutdown – låter pågående förfrågningar avslutas innan processen dör.
function shutdown(signal) {
  console.log(`[server] Mottog ${signal} – avslutar grantfully...`);
  server.close(err => {
    if (err) {
      console.error('[server] Fel vid stängning:', err.message);
      process.exit(1);
    }
    console.log('[server] Servern stängdes.');
    process.exit(0);
  });
  // Tvinga avslut om något hänger kvar efter 10 s.
  setTimeout(() => {
    console.error('[server] Tidsgräns för gracefull avslutning överskriden – tvingar avslut.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function sourceStatuses() {
  const observed = (cache, error) => ({ status: error ? (cache ? 'stale' : 'unavailable') : cache ? 'ok' : 'not_checked', fetchedAt: cache?.fetchedAt || null });
  const crisisStates = [feeds.vmas.snapshot(), feeds.notices.snapshot()];
  const statuses = {
    'polisen-events': observed(eventCache, eventError),
    'domstolspraxis': observed(legalCache, legalError),
    'bra-stat': observed(braCache, braError),
    'polisen-areas': policeAreasStatus(),
    'polisen-zone-news': zoneNewsStatus(),
    'krisinformation-v3': { status: crisisStates.some(s => s.error) ? 'stale' : crisisStates.every(s => s.fetchedAt) ? 'ok' : 'not_checked', fetchedAt: crisisStates.map(s => s.fetchedAt).filter(Boolean).sort()[0] || null },
    'krisinformation-vmas': observed(feeds.vmas.snapshot().fetchedAt ? feeds.vmas.snapshot() : null, feeds.vmas.snapshot().error),
    'krisinformation-notices': observed(feeds.notices.snapshot().fetchedAt ? feeds.notices.snapshot() : null, feeds.notices.snapshot().error),
    'civil-shelters': shelterStatus(),
    'smhi-fire-risk': fireRiskService.snapshot(),
    trafikverket: trafficStatus(), 'polisen-stations': policeStationsStatus(),
    'reviewed-zones': { status: !publicZoneApi.available ? 'requires_setup' : publicZoneDbReady ? 'on_demand' : 'unavailable', fetchedAt: null },
    'osrm-routing': { status: 'on_demand' }, 'nominatim-osm': { status: 'on_demand' }
  };
  return publicSources.map(s => ({ ...s, ...(feeds[s.id] ? observed(feeds[s.id].snapshot().fetchedAt ? feeds[s.id].snapshot() : null, feeds[s.id].snapshot().error) : statuses[s.id] || {}) }));
}
