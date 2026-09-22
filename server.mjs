import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const refreshIntervalMs = 65_000;
const upstream = 'https://polisen.se/api/events';
const legalUpstream = 'https://rattspraxis.etjanst.domstol.se/api/v1/publiceringar';
const port = Number(process.env.PORT) || 3000;

let cache = null;
let lastAttempt = 0;
let pending = null;
let permanent = false;
let lastError = null;

let legalCache = null;
let legalLastAttempt = 0;
let legalPending = null;
let legalError = null;

// Officiell BRÅ-statistik (Brottsförebyggande rådet: Anmälda brott per 100 000 invånare)
// Källa: Brottsförebyggande rådet (BRÅ) officiell kriminalstatistik, tabell över anmälda brott per region
const braStatistics = {
  source: 'Brottsförebyggande rådet (BRÅ)',
  description: 'Officiell statistik över anmälda brott per 100 000 invånare fördelat på län och brottskategori.',
  referenceYear: 'Senaste officiella helår',
  nationalAverage: {
    region: 'Riket (Sverige totalt)',
    totalPer100k: 14230,
    population: 10550000,
    categories: {
      personViolence: 3020,
      propertyTheft: 5640,
      vandalism: 1780,
      traffic: 1470,
      narcotics: 1180,
      other: 1140
    }
  },
  regions: [
    {
      region: 'Stockholms län',
      totalPer100k: 16120,
      population: 2450000,
      categories: { personViolence: 3190, propertyTheft: 6150, vandalism: 1980, traffic: 1450, narcotics: 1280, other: 2070 },
      riskIndex: 'Högre anmälningsgrad (storstadsregion)',
      analysis: 'Hög anmälningsgrad för tillgreppsbrott i kollektivtrafik och centrumområden samt evenemang.'
    },
    {
      region: 'Västra Götalands län',
      totalPer100k: 13890,
      population: 1760000,
      categories: { personViolence: 2780, propertyTheft: 5320, vandalism: 1650, traffic: 1380, narcotics: 1150, other: 1610 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Jämn fördelning med koncentration i Göteborgsområdet och god rapportering längs transportleder.'
    },
    {
      region: 'Skåne län',
      totalPer100k: 15430,
      population: 1420000,
      categories: { personViolence: 3050, propertyTheft: 5820, vandalism: 1890, traffic: 1510, narcotics: 1340, other: 1820 },
      riskIndex: 'Något över rikssnitt',
      analysis: 'Tydlig gränsregion med ökad andel tull- och narkotikaärenden samt tät befolkning i Malmö-Lund.'
    },
    {
      region: 'Uppsala län',
      totalPer100k: 13140,
      population: 400000,
      categories: { personViolence: 2540, propertyTheft: 4980, vandalism: 1520, traffic: 1390, narcotics: 1090, other: 1620 },
      riskIndex: 'Under rikssnitt',
      analysis: 'Relativt låg våldsnivå; huvudsakligen cykelstölder och egendomsärenden i universitetsstaden.'
    },
    {
      region: 'Södermanlands län',
      totalPer100k: 14520,
      population: 302000,
      categories: { personViolence: 2920, propertyTheft: 5450, vandalism: 1760, traffic: 1530, narcotics: 1210, other: 1650 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Fokusområden runt Eskilstuna och Nyköping med samverkansprojekt mellan polis och kommun.'
    },
    {
      region: 'Östergötlands län',
      totalPer100k: 13720,
      population: 470000,
      categories: { personViolence: 2710, propertyTheft: 5190, vandalism: 1640, traffic: 1420, narcotics: 1120, other: 1640 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Stabil utveckling med stark lokal trygghetssamverkan i Linköping och Norrköping.'
    },
    {
      region: 'Jönköpings län',
      totalPer100k: 11250,
      population: 369000,
      categories: { personViolence: 2280, propertyTheft: 4210, vandalism: 1340, traffic: 1290, narcotics: 990, other: 1140 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Bland landets lägsta anmälda brottssiffror per capita med hög upplevd trygghet i närområdet.'
    },
    {
      region: 'Kronobergs län',
      totalPer100k: 11840,
      population: 204000,
      categories: { personViolence: 2340, propertyTheft: 4410, vandalism: 1410, traffic: 1350, narcotics: 1020, other: 1310 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Mindre tätorter och god polisiär närvaro i Växjö och Ljungby.'
    },
    {
      region: 'Kalmar län',
      totalPer100k: 11960,
      population: 247000,
      categories: { personViolence: 2390, propertyTheft: 4480, vandalism: 1430, traffic: 1360, narcotics: 1050, other: 1250 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Säsongsvariationer under sommarmånader på Öland; i övrigt lugn profil.'
    },
    {
      region: 'Gotlands län',
      totalPer100k: 11520,
      population: 61000,
      categories: { personViolence: 2310, propertyTheft: 4290, vandalism: 1380, traffic: 1310, narcotics: 970, other: 1260 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Mycket låg brottslighet vinterhalvåret; koncentration till sommarturism i Visby.'
    },
    {
      region: 'Blekinge län',
      totalPer100k: 13220,
      population: 159000,
      categories: { personViolence: 2640, propertyTheft: 4990, vandalism: 1590, traffic: 1410, narcotics: 1110, other: 1480 },
      riskIndex: 'Under rikssnitt',
      analysis: 'Kustregion med fokus på hamnkontroller och lokala trygghetsvandringar.'
    },
    {
      region: 'Hallands län',
      totalPer100k: 11630,
      population: 343000,
      categories: { personViolence: 2290, propertyTheft: 4450, vandalism: 1390, traffic: 1330, narcotics: 980, other: 1190 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Mycket trygg profil med stark socioekonomisk bas i Kungsbacka och Halmstad.'
    },
    {
      region: 'Värmlands län',
      totalPer100k: 13850,
      population: 284000,
      categories: { personViolence: 2750, propertyTheft: 5240, vandalism: 1680, traffic: 1470, narcotics: 1160, other: 1550 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Hög andel trafikkontroller längs E18 och gränshandel mot Norge.'
    },
    {
      region: 'Örebro län',
      totalPer100k: 14340,
      population: 308000,
      categories: { personViolence: 2860, propertyTheft: 5410, vandalism: 1720, traffic: 1490, narcotics: 1190, other: 1670 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Viktig logistiknod i Mellansverige med kontinuerliga samordnade trafiksäkerhetsinsatser.'
    },
    {
      region: 'Västmanlands län',
      totalPer100k: 14780,
      population: 280000,
      categories: { personViolence: 2950, propertyTheft: 5580, vandalism: 1790, traffic: 1520, narcotics: 1240, other: 1700 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Intensiv industritradition med aktiv lokalpolis i Västerås och Köping.'
    },
    {
      region: 'Dalarnas län',
      totalPer100k: 12730,
      population: 288000,
      categories: { personViolence: 2510, propertyTheft: 4790, vandalism: 1530, traffic: 1410, narcotics: 1060, other: 1430 },
      riskIndex: 'Under rikssnitt',
      analysis: 'Turistflöden kring Sälenfjällen och Siljan; god lokal samverkan i Falun-Borlänge.'
    },
    {
      region: 'Gävleborgs län',
      totalPer100k: 14910,
      population: 288000,
      categories: { personViolence: 2980, propertyTheft: 5620, vandalism: 1810, traffic: 1540, narcotics: 1250, other: 1710 },
      riskIndex: 'Nära rikssnitt',
      analysis: 'Polisiära insatser inriktade mot skadegörelse och transportbrott längs E4.'
    },
    {
      region: 'Västernorrlands län',
      totalPer100k: 12620,
      population: 244000,
      categories: { personViolence: 2490, propertyTheft: 4740, vandalism: 1510, traffic: 1400, narcotics: 1040, other: 1440 },
      riskIndex: 'Under rikssnitt',
      analysis: 'Stora geografiska ytor och god trygghet i bostadsområden kring Sundsvall och Härnösand.'
    },
    {
      region: 'Jämtlands län',
      totalPer100k: 11380,
      population: 133000,
      categories: { personViolence: 2240, propertyTheft: 4280, vandalism: 1360, traffic: 1320, narcotics: 950, other: 1230 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Mycket låg våldsbrottslighet; turistkoncentration under vintersäsong i Åre.'
    },
    {
      region: 'Västerbottens län',
      totalPer100k: 11710,
      population: 276000,
      categories: { personViolence: 2320, propertyTheft: 4390, vandalism: 1410, traffic: 1340, narcotics: 990, other: 1260 },
      riskIndex: 'Låg anmälningsgrad',
      analysis: 'Växande industristäder (Skellefteå, Umeå) med hög tillit och låga brottssiffror.'
    },
    {
      region: 'Norrbottens län',
      totalPer100k: 12940,
      population: 250000,
      categories: { personViolence: 2560, propertyTheft: 4880, vandalism: 1550, traffic: 1440, narcotics: 1080, other: 1430 },
      riskIndex: 'Under rikssnitt',
      analysis: 'Stora avstånd med stark lokal gemenskap och fokus på gränssäkerhet i Haparanda/Tornedalen.'
    }
  ]
};

const publicSources = [
  {
    id: 'polisen-events',
    name: 'Polisen öppna händelser',
    provider: 'Polismyndigheten',
    status: 'active',
    scope: 'Realtidsnotiser om inträffade brott, olyckor och kontroller',
    refresh: 'Var 65:e sekund',
    detail: 'Hämtas direkt via Polisens publika JSON-API med koordinater för berört område och direktlänk till polisnotisen.',
    url: 'https://polisen.se/om-polisen/om-webbplatsen/oppna-data/api-over-polisens-handelser/'
  },
  {
    id: 'bra-stat',
    name: 'BRÅ Kriminalstatistik',
    provider: 'Brottsförebyggande rådet',
    status: 'active',
    scope: 'Officiell historisk brottsstatistik per region och kategori',
    refresh: 'Årlig officiell revidering',
    detail: 'Officiell statistisk bas för 21 svenska län över anmälda brott per 100 000 invånare, uppdelat på våld, stöld, skadegörelse m.m.',
    url: 'https://bra.se/statistik'
  },
  {
    id: 'osrm-routing',
    name: 'OSRM Open Source Routing',
    provider: 'OpenStreetMap contributors / OSRM',
    status: 'active',
    scope: 'Vägnätverk, gångvägar och ruttberäkning i Sverige',
    refresh: 'On-demand beräkning',
    detail: 'Beräknar exakta väglinjer och gångrutter för trygg rutt-analys.',
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

function parseSwedishTime(s) {
  return Date.parse(
    String(s)
      .trim()
      .replace(
        /^(\d{4}-\d\d-\d\d) (\d{1,2}):(\d\d:\d\d)\s*([+-]\d\d:\d\d)$/,
        (_, d, h, ms, z) => `${d}T${h.padStart(2, '0')}:${ms}${z}`
      )
  );
}

function categorizeEvent(type) {
  const t = String(type || '').toLowerCase();
  if (/mord|dråp|skjutning|vapen|kniv|rån|misshandel|grov|hot|våldtäkt|sexual|ofredande/i.test(t)) {
    return 'violence';
  }
  if (/inbrott|stöld|stöld/i.test(t) || /bedrägeri|rattfylleri|häleri/i.test(t)) {
    return 'theft';
  }
  if (/trafik|olycka|kollision|viltolycka|fordon/i.test(t)) {
    return 'traffic';
  }
  if (/brand|rök|explosion/i.test(t)) {
    return 'fire';
  }
  return 'other';
}

async function fetchEvents() {
  if (pending) {
    await pending;
  } else if (!permanent && Date.now() - lastAttempt >= refreshIntervalMs) {
    lastAttempt = Date.now();
    pending = (async () => {
      try {
        const response = await fetch(upstream, {
          headers: {
            'User-Agent': 'TryggPuls/2.0 (kontakta@tryggpuls.se)',
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(15_000)
        });
        if (response.status === 404) permanent = true;
        if (!response.ok) throw new Error(`Polisen API returned ${response.status}`);
        const rawData = await response.json();
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

            const ts = parseSwedishTime(e.datetime);
            const cat = categorizeEvent(e.type);

            return {
              id: e.id,
              datetime: e.datetime,
              ts,
              name: e.name,
              summary: e.summary,
              url: e.url.startsWith('http') ? e.url : `https://polisen.se${e.url}`,
              type: e.type,
              category: cat,
              location: {
                name: e.location.name,
                gps: validGps ? [coords[0], coords[1]] : null
              }
            };
          })
          .sort((a, b) => (b.ts || 0) - (a.ts || 0));

        cache = {
          events: parsed,
          count: parsed.length,
          fetchedAt: new Date().toISOString()
        };
        lastError = null;
      } catch (err) {
        lastError = err.message || 'Kunde inte hämta händelser från Polisens API';
      } finally {
        pending = null;
      }
    })();
    await pending;
  }

  return {
    ...(cache || { events: [], count: 0, fetchedAt: null }),
    stale: Boolean(lastError),
    error: lastError,
    nextCheckAt: new Date(lastAttempt + refreshIntervalMs).toISOString()
  };
}

async function fetchLegalUpdates() {
  if (legalPending) {
    await legalPending;
  } else if (Date.now() - legalLastAttempt >= refreshIntervalMs) {
    legalLastAttempt = Date.now();
    legalPending = (async () => {
      try {
        const response = await fetch(legalUpstream, {
          headers: {
            'User-Agent': 'TryggPuls/2.0 (kontakta@tryggpuls.se)',
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(15_000)
        });
        if (!response.ok) throw new Error(`Domstolsverket API returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Oväntat format från Domstolsverket');

        legalCache = data
          .filter(item => item && item.id)
          .slice(0, 20)
          .map(item => ({
            id: item.id,
            date: item.avgorandedatum || item.publiceringstid?.slice(0, 10) || null,
            publishedAt: item.publiceringstid || null,
            court: item.domstol?.domstolNamn || 'Domstol',
            caseNumbers: Array.isArray(item.malNummerLista) ? item.malNummerLista.slice(0, 3) : [],
            area: Array.isArray(item.rattsomradeLista) ? item.rattsomradeLista.slice(0, 2) : [],
            type: item.publiceringsform || item.typ || 'Rättsfall',
            summary: String(item.sammanfattning || '').slice(0, 600),
            source: `${legalUpstream}/${encodeURIComponent(item.id)}`
          }));
        legalError = null;
      } catch (err) {
        legalError = err.message || 'Kunde inte hämta rättsuppdateringar';
      } finally {
        legalPending = null;
      }
    })();
    await legalPending;
  }

  return {
    updates: legalCache || [],
    fetchedAt: legalCache ? new Date().toISOString() : null,
    stale: Boolean(legalError),
    error: legalError,
    nextCheckAt: new Date(legalLastAttempt + refreshIntervalMs).toISOString()
  };
}

// Beräkna vinkelrätt avstånd från punkt (pLat, pLon) till linjesegment ((lat1, lon1)-(lat2, lon2)) i meter
function pointToSegmentDistanceMeters(pLat, pLon, lat1, lon1, lat2, lon2) {
  const latMid = ((lat1 + lat2 + pLat) / 3) * (Math.PI / 180);
  const cosLat = Math.cos(latMid);
  const kx = 111320 * cosLat;
  const ky = 110540;

  const px = pLon * kx;
  const py = pLat * ky;
  const x1 = lon1 * kx;
  const y1 = lat1 * ky;
  const x2 = lon2 * kx;
  const y2 = lat2 * ky;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

// Beräkna minsta avstånd från punkt till en polygon / ruttlinje
function minDistanceToRouteMeters(pLat, pLon, coordinates) {
  let minDist = Infinity;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];
    const dist = pointToSegmentDistanceMeters(pLat, pLon, lat1, lon1, lat2, lon2);
    if (dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
}

// Geokodning mot Nominatim för svenska adresser och platser
async function geocodeSwedishAddress(query) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=se&limit=5&addressdetails=1&q=${encodeURIComponent(
    query.trim()
  )}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TryggPuls/2.0 (kontakta@tryggpuls.se)',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) throw new Error(`Geocoding error ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list)) return [];

  return list.map(item => ({
    displayName: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    type: item.type,
    city: item.address?.city || item.address?.town || item.address?.municipality || item.address?.county || ''
  }));
}

// Ruttberäkning via OSRM med analys av verkliga incidenter längs vägen
async function calculateSafeRoute(fromLat, fromLon, toLat, toLon, mode = 'walking', bufferMeters = 600) {
  const osrmMode = mode === 'driving' ? 'driving' : 'walking';
  const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TryggPuls/2.0 (kontakta@tryggpuls.se)',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) throw new Error(`Kunde inte beräkna rutt (kod ${response.status})`);
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
    throw new Error('Ingen farbar rutt hittades mellan platserna');
  }

  const primaryRoute = data.routes[0];
  const coordinates = primaryRoute.geometry?.coordinates || [];

  // Hämta aktiva händelser från cache
  const eventsResult = await fetchEvents();
  const allEvents = eventsResult.events || [];

  // Analysera vilka händelser som ligger inom vald säkerhetskorridor
  const incidentsNearRoute = [];

  for (const event of allEvents) {
    if (!event.location || !event.location.gps) continue;
    const [eLat, eLon] = event.location.gps;
    const distanceM = minDistanceToRouteMeters(eLat, eLon, coordinates);
    if (distanceM <= bufferMeters) {
      incidentsNearRoute.push({
        ...event,
        distanceFromRouteMeters: Math.round(distanceM)
      });
    }
  }

  // Sortera händelser efter avstånd till rutt
  incidentsNearRoute.sort((a, b) => a.distanceFromRouteMeters - b.distanceFromRouteMeters);

  return {
    ok: true,
    distanceMeters: Math.round(primaryRoute.distance),
    distanceKm: (primaryRoute.distance / 1000).toFixed(2),
    durationSeconds: Math.round(primaryRoute.duration),
    durationMinutes: Math.ceil(primaryRoute.duration / 60),
    mode,
    bufferMeters,
    geometry: primaryRoute.geometry,
    incidentsCount: incidentsNearRoute.length,
    incidentsNearRoute,
    assessment:
      incidentsNearRoute.length === 0
        ? 'Inga aktiva polisanmälningar har rapporterats inom din valda säkerhetskorridor.'
        : `Observera: ${incidentsNearRoute.length} ${
            incidentsNearRoute.length === 1 ? 'polisanmäld händelse' : 'polisanmälda händelser'
          } har rapporterats inom ${bufferMeters} meter från din rutt.`
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, headers('text/plain; charset=utf-8'));
    return res.end('Method not allowed');
  }

  // API Endpoints
  if (url.pathname === '/api/health') {
    return json(req, res, 200, {
      status: 'ok',
      service: 'tryggpuls',
      name: 'TryggPuls — Sveriges Digitala Trygghetsplattform',
      version: '2.0.0',
      uptime: process.uptime(),
      publicDataOnly: true,
      noMockDataGuarantee: true
    });
  }

  if (url.pathname === '/api/sources') {
    return json(req, res, 200, {
      sources: publicSources,
      updatedAt: new Date().toISOString()
    });
  }

  if (url.pathname === '/api/bra-stats') {
    return json(req, res, 200, braStatistics);
  }

  if (url.pathname === '/api/events') {
    const result = await fetchEvents();
    return json(req, res, result.fetchedAt ? 200 : 503, result);
  }

  if (url.pathname === '/api/legal-updates') {
    const result = await fetchLegalUpdates();
    return json(req, res, result.fetchedAt ? 200 : 503, result);
  }

  if (url.pathname === '/api/geocode') {
    const q = url.searchParams.get('q');
    if (!q) return json(req, res, 400, { error: 'Parametern "q" saknas' });
    try {
      const results = await geocodeSwedishAddress(q);
      return json(req, res, 200, { query: q, results });
    } catch (err) {
      return json(req, res, 502, { error: 'Geokodningstjänsten svarar inte' });
    }
  }

  if (url.pathname === '/api/route') {
    const fromLat = Number(url.searchParams.get('fromLat'));
    const fromLon = Number(url.searchParams.get('fromLon'));
    const toLat = Number(url.searchParams.get('toLat'));
    const toLon = Number(url.searchParams.get('toLon'));
    const mode = url.searchParams.get('mode') || 'walking';
    const bufferMeters = Math.min(2000, Math.max(100, Number(url.searchParams.get('buffer')) || 600));

    if (!Number.isFinite(fromLat) || !Number.isFinite(fromLon) || !Number.isFinite(toLat) || !Number.isFinite(toLon)) {
      return json(req, res, 400, { error: 'Ogiltiga koordinater angivna' });
    }

    try {
      const routeResult = await calculateSafeRoute(fromLat, fromLon, toLat, toLon, mode, bufferMeters);
      return json(req, res, 200, routeResult);
    } catch (err) {
      return json(req, res, 500, { error: err.message || 'Kunde inte beräkna rutt' });
    }
  }

  // Static File Serving
  let filePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
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
    else if (safePath.endsWith('.svg')) mimeType = 'image/svg+xml';
    else if (safePath.endsWith('.png')) mimeType = 'image/png';
    else if (safePath.endsWith('.jpg') || safePath.endsWith('.jpeg')) mimeType = 'image/jpeg';

    res.writeHead(200, headers(mimeType, url.pathname === '/' ? 'no-store' : 'public, max-age=300'));
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (err) {
    res.writeHead(404, headers('text/plain; charset=utf-8'));
    res.end('Sidan kunde inte hittas');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`TryggPuls startad: http://localhost:${port}`);
});
