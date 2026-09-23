// TryggPuls — Sveriges Digitala Trygghetsplattform
// 100% Officiella Data · Polisen, BRÅ, OSRM, Nominatim, Domstolsverket

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readSavedPlaces(key) {
  try {
    const rows = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(rows) ? rows.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180 && Number.isFinite(p.radius) && p.radius > 0) : null;
  } catch { return null; }
}
function savePlaces(key, rows) {
  try { localStorage.setItem(key, JSON.stringify(rows)); }
  catch { showToast('Webbläsaren kunde inte spara. Platserna finns kvar tills sidan stängs.'); }
}
// ==================== APP STATE ====================
const state = {
  activeTab: 'nara',
  events: [],
  eventsAvailable: false,
  eventsStale: false,
  filteredEvents: [],
  selectedEventId: null,
  activeCategory: 'all',
  selectedRegion: '',
  periodHours: 24,
  searchQuery: '',
  userCoords: null,
  userAddress: null,
  braData: null,
  sources: [],
  policeAreas: null,
  showPoliceAreas: true,
  nearbyPoint: null,
  nearbyLabel: '',
  nearbyShelters: [],
  policeStations: [],
  routeFollowActive: false,
  routeFollowWatch: null,
  routeFollowTimer: null,
  followPosition: null,
  
  // Trygg Rutt
  routeFrom: null, // { name, lat, lon }
  routeTo: null,   // { name, lat, lon }
  currentRouteData: null,

  // Familj & Geozoner (Sparade i LocalStorage med verifierade svenska platser).
  // Förkonfigurerade zoner är EXEMPEL – de är inte riktiga övervakade platser.
  // Användaren kan skapa egna zoner genom att söka riktiga adresser.
  zones: readSavedPlaces('tryggpuls_zones') || [],

  // Företag / Arbetsplatser B2B.
  // Dessa är DEMO-exempel, inte riktiga kunddata eller faktiska arbetsplatser.
  workplaces: readSavedPlaces('tryggpuls_workplaces') || [
    { id: 'w1', name: 'Huvudkontor (Demoarbetsplats)', address: 'Klarabergsviadukten 70, Stockholm', lat: 59.3305, lon: 18.0570, radius: 1000, demo: true },
    { id: 'w2', name: 'Regionkontor Väst (Demoarbetsplats)', address: 'Nordstan, Göteborg', lat: 57.7089, lon: 11.9700, radius: 1000, demo: true },
    { id: 'w3', name: 'Butik Malmö City (Demoarbetsplats)', address: 'Södergatan, Malmö', lat: 55.6040, lon: 13.0010, radius: 800, demo: true }
  ]
};

// ==================== INITIALISERA LEAFLET KARTA ====================
const map = L.map('map', {
  zoomControl: false,
  attributionControl: true
}).setView([62.0, 15.0], 5);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Default fallback works without credentials; CARTO requests keep the key on the server.
const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  subdomains: 'abcd',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://www.openstreetmap.org/fixthemap">Förbättra kartan</a> | Rutter: FOSSGIS OSRM'
}).addTo(map);

fetch('/api/map-config').then(response => response.json()).then(config => {
  if (config.provider !== 'carto') return;
  const carto = L.tileLayer('/api/map-tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> | <a href="https://www.openstreetmap.org/fixthemap">Förbättra kartan</a> | Rutter: FOSSGIS OSRM'
  });
  let failed = false;
  carto.on('tileerror', () => {
    if (failed) return;
    failed = true; map.removeLayer(carto); tileLayer.addTo(map);
    showToast('CARTO svarar inte. Visar OpenStreetMap som reservkarta.');
  });
  // Keep OSM underneath until all CARTO tiles for this view are ready.
  carto.once('load', () => { if (!failed) map.removeLayer(tileLayer); });
  carto.addTo(map);
}).catch(() => {});

// Fallback till OpenStreetMap om CartoDB skulle blockeras.
// VIKTIGT: exakt EN GÅNG. Utan flagga skulle VARJE enskild tileerror lägga
// till ett helt nytt OSM-lager ovanpå kartan -> staplade lager och en
// tillfällig network-error bytte basunderlag permanent.
let basemapFallbackUsed = false;
tileLayer.on('tileerror', () => {
  if (basemapFallbackUsed) return;
  basemapFallbackUsed = true;
  showToast('Kartbakgrunden kunde inte hämtas. Händelser och information finns kvar i listan.');
});

// Säkerställ att kartans dimensioner ritas om så att inga tomma/grå rutor uppstår:
// 1) kort efter start, 2) vid fönster-resize, 3) när sidan är helt laddad
//    (tiles + paneller kan ändra layout efter init), 4) ResizeObserver på #map —
//    det starkaste skyddet, fångar ALLA layoutändringar (flikväxling, sidopanel
//    expanderas, responsive brytpunkter, dockade panels) även utan window-resize.
//    Leaflet är ett no-op-anrop när storleken ej ändrats, så kostnaden är minimal.
setTimeout(() => map.invalidateSize(), 150);
window.addEventListener('resize', () => map.invalidateSize());
window.addEventListener('load', () => map.invalidateSize());
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById('map'));
  new ResizeObserver(entries => {
    document.documentElement.style.setProperty('--header-height', `${entries[0].target.getBoundingClientRect().height}px`);
  }).observe(document.querySelector('body > header'));
}

// Kartlager
const policeAreasLayer = L.layerGroup().addTo(map);
const markersLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const zonesLayer = L.layerGroup().addTo(map);
const userLayer = L.layerGroup().addTo(map);
const nearbyLayer = L.layerGroup().addTo(map);

// Säkerhetskorridor (ruttanalys): halvgenomskinlig bård runt rutten.
// Referens hålls i ett var så att zoomend kan uppdatera bredden.
let corridorLine = null;

// Bredd i pixlar för vald buffert. Korridorn sträcker sig vald buffert PÅ VARJE
// SIDA av rutten, dvs total visuell bredd = 2 × buffert. Meter -> pixel via
// Web-Mercator: m/px = 156543.03392 * cos(lat) / 2^zoom (utvärderas i kartans centrum).
function corridorWidthPx() {
  const buffer = state.currentRouteData?.bufferMeters;
  if (!Number.isFinite(buffer) || buffer <= 0) return 0;
  const zoom = map.getZoom();
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  const lat = map.getCenter()?.lat ?? 0;
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  if (metersPerPixel <= 0) return 0;
  // Tak på 320 px så att extrem zoom-in inte skapar en ohanterlig bård
  return Math.min(320, Math.max(2, (2 * buffer) / metersPerPixel));
}

// Uppdatera korridorbredden när zoomnivån ändras (m/px ändras)
map.on('zoomend', () => {
  if (corridorLine) corridorLine.setStyle({ weight: corridorWidthPx() });
});

// Hjälpfunktioner för datum & tid
function formatSwedishTime(ts) {
  if (!Number.isFinite(ts)) return 'Tid saknas';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(ts);
}

// Haversine avståndsberäkning i meter
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==================== TOAST & NOTISER ====================
function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

// ==================== FLIKHANTERING ====================
function setActiveTab(tabKey, updateHistory = true) {
  if (tabKey.startsWith('familj-invite=')) tabKey = 'familj';
  if (!document.getElementById('panel-' + tabKey)) tabKey = 'nara';
  if (updateHistory && location.hash !== '#' + tabKey) history.pushState(null, '', '#' + tabKey);
  $('#sidebar').scrollTop = 0;
  setMobileView(tabKey === 'karta');
  state.activeTab = tabKey;
  if (tabKey === 'nara' && state.nearbyPoint) {
    map.setView([state.nearbyPoint.lat, state.nearbyPoint.lon], 13);
    renderNearbyMap(state.nearbyPoint, state.nearbyShelters);
  } else {
    nearbyLayer.clearLayers();
  }

  // Uppdatera nav-knappar
  $$('.nav-tab').forEach(tab => {
    const isActive = tab.dataset.tab === tabKey || (tab.id === 'btn-more' && ['information', 'foretag', 'bra', 'sos'].includes(tabKey));
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
    tab.tabIndex = isActive ? 0 : -1;
  });

  // Uppdatera sidopaneler
  $$('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tabKey}`);
  });

  // Uppdatera kartans flytande rubrik
  const bannerTitles = {
    information: { eyebrow: 'VÄDER & BEREDSKAP', title: 'Myndighetsinformation', sub: 'Varningar och råd för hela Sverige' },
    karta: { eyebrow: 'REALTIDSLÄGE', title: state.selectedRegion || 'Hela Sverige', sub: 'Visar aktuella polisnotiser från Polisen.se' },
    rutt: { eyebrow: 'TRYGG RUTT', title: 'Ruttanalys', sub: 'Visar planerad rutt och säkerhetskorridor' },
    familj: { eyebrow: 'FAMILJ & PLATSER', title: 'Familj & zoner', sub: 'Egna platser och frivilligt delade familjezoner' },
    foretag: { eyebrow: 'FÖRETAG B2B', title: 'Arbetsplatser & Verksamhet', sub: 'Incidentbevakning runt företagets anläggningar' },
    bra: { eyebrow: 'OFFICIELL STATISTIK', title: 'BRÅ Platsprofil', sub: 'Kriminalstatistik per 100 000 invånare' },
    sos: { eyebrow: 'NÖDLÄGE', title: 'SOS & Position', sub: 'Akut assistans och GPS-koordinater' }
  };

  const info = bannerTitles[tabKey] || bannerTitles.karta;
  $('#map-banner-eyebrow').textContent = info.eyebrow;
  $('#map-banner-title').textContent = info.title;
  $('#map-banner-subtitle').textContent = info.sub;

  // Anpassa kartlagren för aktiv flik
  updateMapLayersForTab();
  setTimeout(() => map.invalidateSize(), 50);
}

function updateMapLayersForTab() {
  $('#incident-detail').hidden = true;
  markersLayer.clearLayers(); routeLayer.clearLayers(); zonesLayer.clearLayers();
  renderPoliceAreasLayer();

  if (state.activeTab === 'karta') {
    renderMapIncidents();
  } else if (state.activeTab === 'rutt') {
    renderRouteOnMap();
  } else if (state.activeTab === 'familj') {
    renderFamilyZonesOnMap();
  } else if (state.activeTab === 'foretag') {
    renderWorkplacesOnMap();
  } else if (state.activeTab === 'bra') {
    renderMapIncidents();
  } else if (state.activeTab === 'sos') {
    renderUserGpsOnMap();
  }
}

// ==================== FLIK 1: KARTA & REALTID ====================
function filterIncidents() {
  const query = state.searchQuery.trim().toLowerCase();
  const region = state.selectedRegion;
  const category = state.activeCategory;
  const cutoffTime = state.periodHours ? Date.now() - state.periodHours * 3600000 : 0;

  state.filteredEvents = state.events.filter(event => {
    if (query) {
      const text = `${event.name} ${event.summary} ${event.location.name}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    if (region && event.location.name !== region) {
      return false;
    }
    if (category !== 'all' && event.category !== category) {
      return false;
    }
    if (cutoffTime && (event.ts || 0) < cutoffTime) {
      return false;
    }
    return true;
  });

  $('#karta-count').textContent = state.filteredEvents.length;
  $('#filter-summary').textContent = `${state.filteredEvents.length} av ${state.events.length} notiser · ${state.periodHours ? state.periodHours + ' timmar' : 'alla tider'}`;
  renderIncidentFeed();
  renderMapIncidents();
}

function renderIncidentFeed() {
  const feed = $('#karta-feed');
  if (!state.eventsAvailable) {
    feed.innerHTML = '<p class="feed-status">Händelsedata saknas ännu. Använd Uppdatera eller försök igen om en stund.</p>';
    return;
  }
  if (!state.filteredEvents.length) {
    feed.innerHTML = `
      <div style="padding: 24px 12px; text-align: center; color: var(--text-dim); font-size: 12px;">
        Inga händelser matchar ditt urval.<br>Prova att välja ett annat län eller öka tidsfönstret.
      </div>`;
    return;
  }

  const categoryIcons = {
    violence: '🚨',
    theft: '🔒',
    traffic: '🚗',
    fire: '🔥',
    other: '📍'
  };

  feed.innerHTML = state.filteredEvents.slice(0, 100).map(e => `
    <article tabindex="0" role="button" aria-label="${esc(e.name)}" class="incident-card ${state.selectedEventId === e.id ? 'selected' : ''}" data-id="${e.id}">
      <div class="card-icon ${e.category}">${categoryIcons[e.category] || '📍'}</div>
      <div class="card-content">
        <div class="card-meta">
          <span class="card-type">${esc(e.type)}</span>
          <span class="card-time">${formatSwedishTime(e.ts)}</span>
        </div>
        <h3 class="card-title">${esc(e.name)}</h3>
        <p class="card-summary">${esc(e.summary)}</p>
        <span class="card-location">⌖ ${esc(e.location.name)}</span>
      </div>
    </article>
  `).join('');
}

function renderMapIncidents() {
  markersLayer.clearLayers();
  if (state.activeTab !== 'karta' && state.activeTab !== 'bra') return;

  // Gruppera händelser som delar exakta koordinater
  const grouped = new Map();
  for (const event of state.filteredEvents) {
    if (!event.location || !event.location.gps) continue;
    const key = event.location.gps.join(',');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }

  for (const group of grouped.values()) {
    const first = group[0];
    const category = group.every(item => item.category === first.category) ? first.category : 'other';
    const count = group.length;

    const icon = L.divIcon({
      className: `custom-map-pin ${category}`,
      html: String(count),
      iconSize: [28, 28]
    });

    const marker = L.marker(first.location.gps, {
      icon,
      title: `${first.location.name} (${count} händelser)`
    }).addTo(markersLayer);

    marker.on('click', () => {
      showIncidentDetail(first.id);
      if (group.length > 1) {
        state.selectedRegion = first.location.name;
        $('#karta-region').value = first.location.name;
        filterIncidents();
      }
    });
  }
}

function showIncidentDetail(id) {
  setMobileView(true);
  const event = state.events.find(e => e.id === id);
  if (!event) return;

  state.selectedEventId = id;
  const detail = $('#incident-detail');

  const categoryLabels = {
    violence: 'Våld & Rån',
    theft: 'Stöld & Inbrott',
    traffic: 'Trafikhändelse',
    fire: 'Brand / Räddning',
    other: 'Övrig Polisinsats'
  };

  detail.innerHTML = `
    <button class="btn-close" id="btn-close-detail" aria-label="Stäng">×</button>
    <span class="card-type">${categoryLabels[event.category] || event.type}</span>
    <h3>${esc(event.name)}</h3>
    <p>${esc(event.summary)}</p>
    <div style="margin-top: 10px; font-size: 11px; color: var(--text-muted); line-height: 1.6;">
      <div><strong>Plats:</strong> ${esc(event.location.name)}</div>
      <div><strong>Tidpunkt:</strong> ${formatSwedishTime(event.ts)} (svensk tid)</div>
      <div><strong>Noggrannhet:</strong> ${event.location.gps ? 'Kommun- eller länscentrum' : 'Koordinater saknas'}</div>
    </div>
    <a href="${esc(event.url)}" target="_blank" rel="noopener" class="detail-source-link">
      Läs originalnotisen på Polisen.se ↗
    </a>
  `;

  detail.hidden = false;
  $('#btn-close-detail').onclick = () => {
    detail.hidden = true;
    state.selectedEventId = null;
    renderIncidentFeed();
  };

  if (event.location.gps) {
    map.flyTo(event.location.gps, Math.max(map.getZoom(), 8), { duration: 0.8 });
  }

  renderIncidentFeed();
}

// ==================== FLIK 2: TRYGG RUTT ====================
function setupRouteSearch() {
  const fromInput = $('#route-from');
  const toInput = $('#route-to');
  const fromSuggestions = $('#route-from-suggestions');
  const toSuggestions = $('#route-to-suggestions');

  setupPlaceSearch(fromInput, fromSuggestions, p => { state.routeFrom = p; invalidateRoute(); });
  setupPlaceSearch(toInput, toSuggestions, p => { state.routeTo = p; invalidateRoute(); });

  // GPS-knapp för startpunkt
  $('#btn-use-gps-start').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Din webbläsare stöder inte positionering.');
      return;
    }
    state.routeFrom = null; invalidateRoute();
    fromInput.value = 'Söker din enhetsposition...';
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        state.routeFrom = { name: 'Min aktuella enhetsposition', lat, lon };
        fromInput.value = 'Min aktuella enhetsposition';
        showToast('Startpunkt satt till din enhetsposition!');
      },
      () => {
        fromInput.value = '';
        showToast('Kunde inte läsa av position. Kontrollera behörigheter.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // Snabbtest-knappar
  $$('.btn-chip-demo').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.routeFrom = null; state.routeTo = null; invalidateRoute();
      const revision = routeRevision;
      fromInput.value = btn.dataset.from;
      toInput.value = btn.dataset.to;
      showToast(`Hämtar koordinater för ${btn.dataset.from} → ${btn.dataset.to}...`);

      try {
        const [rFrom, rTo] = await Promise.all([
          fetch(`/api/geocode?q=${encodeURIComponent(btn.dataset.from)}`).then(r => r.json()),
          fetch(`/api/geocode?q=${encodeURIComponent(btn.dataset.to)}`).then(r => r.json())
        ]);

        if (revision !== routeRevision) return;
        if (rFrom.results?.[0] && rTo.results?.[0]) {
          state.routeFrom = { name: btn.dataset.from, lat: rFrom.results[0].lat, lon: rFrom.results[0].lon };
          state.routeTo = { name: btn.dataset.to, lat: rTo.results[0].lat, lon: rTo.results[0].lon };
          calculateRoute();
        } else { showToast('Platserna kunde inte hittas. Sök start och mål manuellt.'); }
      } catch {
        showToast('Kunde inte hämta testkoordinater.');
      }
    });
  });

  $('#btn-calculate-route').addEventListener('click', calculateRoute);
  $('#btn-clear-route').addEventListener('click', clearRoute);
}

async function calculateRoute({ refresh = false } = {}) {
  if (!state.routeFrom || !state.routeTo) {
    showToast('Ange både startpunkt och destination för att beräkna rutt.');
    return;
  }

  if (!refresh) invalidateRoute();
  const revision = routeRevision;
  const calcBtn = $('#btn-calculate-route');
  calcBtn.disabled = true;
  calcBtn.textContent = refresh ? 'Uppdaterar källor…' : 'Beräknar rutt…';

  const mode = $('#route-mode').value;
  const buffer = $('#route-buffer').value;

  try {
    const url = `/api/route?fromLat=${state.routeFrom.lat}&fromLon=${state.routeFrom.lon}&toLat=${state.routeTo.lat}&toLon=${state.routeTo.lon}&mode=${mode}&buffer=${buffer}`;
    const res = await fetch(url);
    const data = await res.json();

    if (revision !== routeRevision) return;
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Kunde inte beräkna rutt');
    }

    state.currentRouteData = data;
    renderRouteResult(data);
    renderRouteOnMap();
    $('#btn-clear-route').hidden = false;
    $('#btn-route-follow').hidden = false;
    $('#btn-route-view-map').hidden = false;
    if (!refresh) showToast(`Rutt beräknad: ${data.distanceKm} km · ${data.durationMinutes} min.`);
  } catch (err) {
    if (revision === routeRevision) {
      if (refresh && state.currentRouteData) {
        const status = $('#route-source-status');
        status.textContent = `Källorna kunde inte uppdateras: ${err.message}. Visar senast hämtade uppgifter.`;
        status.classList.add('source-warning');
      } else showToast(`Fel vid ruttberäkning: ${err.message}`);
    }
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Beräkna rutt';
  }
}

function renderRouteResult(data) {
  const card = $('#route-result');
  card.hidden = false;

  const badge = $('#route-assessment-badge');
  badge.className = 'assessment-badge';
  badge.textContent = `${data.routeAreas?.length || 0} zonpassager · ${data.incidentsCount} områdesnotiser`;

  $('#route-dist-label').textContent = `${data.distanceKm} km`;
  $('#route-time-label').textContent = `${data.durationMinutes} min (${data.mode === 'driving' ? 'bil' : 'gång'})`;
  const assessment = $('#route-assessment-text');
  assessment.replaceChildren();
  const precision = document.createElement('p');
  precision.textContent = data.policeLocationPrecision || 'Polisnotiser anger ungefärligt område och kan vara fördröjda.';
  assessment.append(precision);
  // Ärlig markering om polisens händelsedata var cachelagd/föråldrad vid analysen
  if (data.eventsStale) {
    const note = document.createElement('p');
    note.className = 'route-stale-note';
    note.textContent = 'Obs: händelsedatan kan vara föråldrad' +
      (data.eventsFetchedAt ? ' (senast lyckad hämtning ' + formatSwedishTime(Date.parse(data.eventsFetchedAt)) + ')' : '') + '.';
    assessment.appendChild(note);
  }
  $('#route-incidents-count').textContent = data.incidentsCount;

  const list = $('#route-incidents-list');
  if (data.incidentsCount === 0) {
    list.innerHTML = '<p>Inga polisnotiser matchar det grova områdesurvalet just nu. Det betyder inte att rutten saknar risker.</p>';
  } else {
    list.innerHTML = data.incidentsNearRoute.map(e => `
      <div class="route-incident-item">
        <strong>${esc(e.type)} · ${esc(e.name)}</strong>
        <p>${esc(e.summary)}</p>
        <small>${esc(e.location?.name || 'Berört område')} · ${esc(formatSwedishTime(e.ts))} · ungefärlig områdespunkt</small>
        ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Öppna polisnotisen ↗</a>` : ''}
      </div>
    `).join('');
  }

  const routeAreas = data.routeAreas || [];
  $('#route-areas-list').innerHTML = routeAreas.length ? routeAreas.map(zone => `<article class="route-zone-item"><strong>${esc(zone.category)} · ${esc(zone.name)}</strong><p>${esc(zone.locality)}${zone.locality ? ' · ' : ''}${(zone.startMeters / 1000).toFixed(1)}–${(zone.endMeters / 1000).toFixed(1)} km längs rutten${zone.validTo ? ` · gilt till ${esc(formatSwedishTime(Date.parse(zone.validTo)))}` : ''}</p><a href="${esc(zone.sourceUrl)}" target="_blank" rel="noopener">${esc(zone.sourceTitle)} ↗</a></article>`).join('') : '<p>Inga zonpassager hittades i tillgängliga gränsdata.</p>';
  const traffic = data.trafficNearRoute || [];
  $('#route-traffic-list').innerHTML = traffic.length ? traffic.map(item => `<article class="route-zone-item"><strong>${esc(item.title)}</strong><p>${esc(item.description || item.location || '')}${item.road ? ` · ${esc(item.road)}` : ''}${item.severity ? ` · ${esc(item.severity)}` : ''}</p><small>${item.modifiedAt ? `Uppdaterad ${esc(formatSwedishTime(Date.parse(item.modifiedAt)))}` : 'Publicerad trafikinformation'} · kartläge kan vara ungefärligt</small><a href="${esc(item.source)}" target="_blank" rel="noopener">Trafikverket ↗</a></article>`).join('') : '<p>Inga matchande trafikstörningar hittades eller så saknas precis geometri i källan.</p>';
  const weather = data.weatherAlongRoute || [];
  $('#route-weather-list').innerHTML = weather.length ? weather.map(item => `<article class="route-zone-item"><strong>${esc(item.levelLabel)} · ${esc(item.title)}</strong><p>${esc(item.area || '')}${item.validTo ? ` · till ${esc(formatSwedishTime(Date.parse(item.validTo)))}` : ''}</p><a href="${esc(item.source)}" target="_blank" rel="noopener">Läs SMHI:s varning ↗</a></article>`).join('') : '<p>Inga geografiskt matchande SMHI-varningar hittades i aktuella data.</p>';
  const sourceRows = Object.entries(data.sourceStatus || {}).map(([source, status]) => `${source}: ${status.status}${status.fetchedAt ? ` (${formatSwedishTime(Date.parse(status.fetchedAt))})` : ''}`);
  $('#route-source-status').textContent = `Källkontroll ${formatSwedishTime(Date.parse(data.routeAnalysisUpdatedAt))}. ${sourceRows.join(' · ')}`;
  $('#route-source-status').classList.toggle('source-warning', Object.values(data.sourceStatus || {}).some(source => ['stale', 'unavailable', 'requires_key'].includes(source.status)));

  // Faktisk information — denna analys är INTE en trygghetsgaranti.
  const disclaimer = document.createElement('p');
  disclaimer.className = 'route-disclaimer';
  disclaimer.textContent = 'Det här är en sammanställning av publicerad information, ingen säkerhetsklassning eller garanti. Polisnotiser kan vara fördröjda och deras kartpunkter anger kommun eller län. Kontrollera alltid myndigheternas originalkälla.';
  assessment.appendChild(disclaimer);
}

function renderRouteOnMap() {
  routeLayer.clearLayers();
  routeFollowMarker = null;
  corridorLine = null;
  if (!state.currentRouteData || !state.currentRouteData.geometry) return;

  const coords = state.currentRouteData.geometry.coordinates.map(c => [c[1], c[0]]);

  // Rita säkerhetskorridorn FÖRST (renderas under ruttlinjen): bred, halvgenomskinlig
  // bård vars bredd motsvarar den valda bufferten (± buffert meter från rutten)
  if (coords.length > 1 && corridorWidthPx() > 0) {
    corridorLine = L.polyline(coords, {
      color: '#f59e0b',
      weight: corridorWidthPx(),
      opacity: 0.12,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false
    }).addTo(routeLayer);
  }

  // Rita själva ruttlinjen
  const routeLine = L.polyline(coords, {
    color: '#38bdf8',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(routeLayer);

  for (const zone of state.currentRouteData.routeAreas || []) {
    if (!Array.isArray(zone.line) || zone.line.length < 2) continue;
    const points = zone.line.map(([lon, lat]) => [lat, lon]);
    const color = zone.kind === 'security-zone' ? '#b42332' : zone.kind === 'organized-crime-area' ? '#7946a8' : '#c27a13';
    L.polyline(points, { color, weight: 11, opacity: 0.8, lineCap: 'round', lineJoin: 'round' })
      .bindPopup('<strong>' + esc(zone.category) + ' · ' + esc(zone.name) + '</strong><br>' + esc(zone.sourceTitle) + '<br><a href="' + esc(zone.sourceUrl) + '" target="_blank" rel="noopener">Öppna myndighetskällan ↗</a>')
      .addTo(routeLayer);
  }

  for (const item of state.currentRouteData.trafficNearRoute || []) {
    const geometry = item.geometry?.type === 'Feature' ? item.geometry : item.geometry?.type ? { type: 'Feature', geometry: item.geometry, properties: {} } : null;
    if (geometry && ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(geometry.geometry.type)) {
      L.geoJSON(geometry, { style: { color: '#dc6d25', weight: 4, fillOpacity: 0.12 }, pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 6, color: '#dc6d25', fillColor: '#fff', fillOpacity: 1, weight: 3 }) })
        .bindPopup('<strong>' + esc(item.title) + '</strong><br>' + esc(item.location || item.road || '') + '<br>Trafikverkets kartuppgift · <a href="' + esc(item.source) + '" target="_blank" rel="noopener">Öppna källa ↗</a>')
        .addTo(routeLayer);
    }
  }

  for (const item of state.currentRouteData.weatherAlongRoute || []) {
    const geometry = item.geometry?.type === 'Feature' ? item.geometry : item.geometry?.type ? { type: 'Feature', geometry: item.geometry, properties: {} } : null;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.geometry.type)) continue;
    const level = String(item.level || '').toUpperCase();
    const color = level === 'RED' ? '#b42332' : level === 'ORANGE' ? '#d45d20' : level === 'YELLOW' ? '#b27a13' : '#276fc0';
    L.geoJSON(geometry, { style: { color, weight: 2, fillColor: color, fillOpacity: 0.16 } })
      .bindPopup('<strong>' + esc(item.levelLabel || 'SMHI-varning') + ' · ' + esc(item.title) + '</strong><br>' + esc(item.area || '') + '<br><a href="' + esc(item.source) + '" target="_blank" rel="noopener">Öppna SMHI:s källa ↗</a>')
      .addTo(routeLayer);
  }

  // Start & Mål markörer
  if (coords.length) {
    L.circleMarker(coords[0], { radius: 7, color: '#10b981', fillColor: '#10b981', fillOpacity: 1 })
      .bindTooltip('Startpunkt', { permanent: false })
      .addTo(routeLayer);

    L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 })
      .bindTooltip('Destination', { permanent: false })
      .addTo(routeLayer);
  }

  // Rita ut incidentmarkörer längs rutten
  if (state.currentRouteData.incidentsNearRoute) {
    for (const inc of state.currentRouteData.incidentsNearRoute) {
      if (!inc.location?.gps) continue;
      L.circleMarker(inc.location.gps, {
        radius: 9,
        color: '#a34e32',
        fillColor: '#fff',
        fillOpacity: 1,
        weight: 3
      })
        .bindPopup('<b>' + esc(inc.type) + '</b><br>' + esc(inc.summary) + '<br><small>' + esc(inc.location.name || 'Berört område') + ' · kartpunkten är ungefärlig och kan visa kommunens eller länets mittpunkt.</small>')
        .addTo(routeLayer);
    }
  }

  if (state.followPosition) routeFollowMarker = L.circleMarker(state.followPosition, { radius: 8, color: '#156c58', fillColor: '#46c59c', fillOpacity: 1, weight: 3 }).bindTooltip('Din GPS-position').addTo(routeLayer);
  map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
}

let routeRevision = 0;
let routeFollowMarker = null;
function clientRoutePosition(lat, lon, coordinates) {
  let minimum = Infinity, nearestProgress = 0, routeDistance = 0;
  const yScale = 110540, xScale = 111320 * Math.cos(lat * Math.PI / 180);
  const px = lon * xScale, py = lat * yScale;
  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1], [lon2, lat2] = coordinates[i];
    const x1 = lon1 * xScale, y1 = lat1 * yScale, x2 = lon2 * xScale, y2 = lat2 * yScale;
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
    const segmentDistance = Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
    const segmentMeters = nearbyDistanceMeters({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 });
    if (segmentDistance < minimum) { minimum = segmentDistance; nearestProgress = routeDistance + segmentMeters * t; }
    routeDistance += segmentMeters;
  }
  return { distanceMeters: minimum, progressMeters: nearestProgress };
}

function startRouteFollow() {
  if (!state.currentRouteData?.geometry) { showToast('Beräkna en rutt innan du följer den.'); return; }
  if (!navigator.geolocation) { showToast('GPS stöds inte i den här webbläsaren.'); return; }
  state.routeFollowActive = true;
  $('#btn-route-follow').hidden = true;
  $('#btn-route-stop').hidden = false;
  $('#route-follow-status').hidden = false;
  $('#route-follow-status').textContent = 'Begär GPS. Positionen används medan den här sidan är öppen.';
  resumeRouteFollow();
}

function pauseRouteFollow() {
  if (state.routeFollowWatch !== null) navigator.geolocation?.clearWatch(state.routeFollowWatch);
  state.routeFollowWatch = null;
  clearInterval(state.routeFollowTimer);
  state.routeFollowTimer = null;
  if (state.routeFollowActive) $('#route-follow-status').textContent = 'GPS och källuppdatering pausade medan sidan inte är synlig.';
}

function resumeRouteFollow() {
  if (!state.routeFollowActive || document.hidden || !navigator.geolocation || state.routeFollowWatch !== null) return;
  state.routeFollowWatch = navigator.geolocation.watchPosition(position => {
    const { latitude, longitude, accuracy } = position.coords;
    state.followPosition = [latitude, longitude];
    const geometry = state.currentRouteData?.geometry?.coordinates || [];
    const positionOnRoute = geometry.length > 1 ? clientRoutePosition(latitude, longitude, geometry) : null;
    const offRoute = positionOnRoute && accuracy <= 200 && positionOnRoute.distanceMeters > Math.max(150, accuracy);
    $('#route-off-course').hidden = !offRoute;
    $('#btn-reroute-current').hidden = !offRoute;
    if (offRoute) $('#route-off-course').textContent = 'Du verkar ha lämnat rutten. Kontrollera läget och välj om du vill beräkna en ny rutt från din position.';
    const activeZone = (state.currentRouteData?.routeAreas || []).find(zone => positionOnRoute?.progressMeters >= zone.startMeters && positionOnRoute?.progressMeters <= zone.endMeters);
    const nextZone = (state.currentRouteData?.routeAreas || []).find(zone => zone.startMeters > (positionOnRoute?.progressMeters || 0));
    const zoneMessage = activeZone ? ` · nu passerar ${activeZone.name}` : nextZone ? ` · nästa zon ${nextZone.name} om cirka ${Math.max(0, (nextZone.startMeters - positionOnRoute.progressMeters) / 1000).toFixed(1)} km` : '';
    $('#route-follow-status').textContent = accuracy <= 200 ? `GPS aktiv · noggrannhet cirka ${Math.round(accuracy)} m${zoneMessage} · ${formatSwedishTime(position.timestamp)}` : 'GPS-signalen är osäker. Väntar på en bättre position.';
    if (routeFollowMarker) routeFollowMarker.setLatLng(state.followPosition);
    else if (state.currentRouteData) renderRouteOnMap();
  }, error => {
    $('#route-follow-status').textContent = error.code === 1 ? 'GPS-tillstånd saknas. Tillåt position i webbläsaren eller stoppa GPS.' : 'GPS-positionen kunde inte hämtas just nu.';
  }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 });
  state.routeFollowTimer = setInterval(() => calculateRoute({ refresh: true }), 60_000);
}

function stopRouteFollow() {
  pauseRouteFollow();
  state.routeFollowActive = false;
  state.followPosition = null;
  routeFollowMarker?.remove(); routeFollowMarker = null;
  $('#btn-route-stop').hidden = true;
  $('#btn-reroute-current').hidden = true;
  $('#btn-route-follow').hidden = !state.currentRouteData;
  $('#route-off-course').hidden = true;
  $('#route-follow-status').hidden = false;
  $('#route-follow-status').textContent = 'GPS-bevakningen är stoppad.';
}

function invalidateRoute() {
  if (state.routeFollowActive) stopRouteFollow();
  routeRevision++;
  state.currentRouteData = null;
  $('#route-result').hidden = true;
  $('#btn-clear-route').hidden = true;
  $('#btn-route-follow').hidden = true;
  $('#btn-route-stop').hidden = true;
  $('#btn-reroute-current').hidden = true;
  $('#btn-route-view-map').hidden = true;
  routeLayer.clearLayers();
  corridorLine = null;
}

function renderPoliceAreasLayer() {
  policeAreasLayer.clearLayers();
  if (!state.showPoliceAreas || !state.policeAreas || !['karta', 'familj'].includes(state.activeTab)) return;
  L.geoJSON(state.policeAreas, {
    style: feature => {
      const particularly = feature.properties.category === 'Särskilt utsatt område';
      return { color: particularly ? '#be4b36' : '#d1942c', weight: 2, fillColor: particularly ? '#be4b36' : '#e9b44c', fillOpacity: 0.18 };
    },
    onEachFeature: (feature, layer) => layer.bindPopup(`<strong>${esc(feature.properties.name)}</strong><br>${esc(feature.properties.locality)} · ${esc(feature.properties.category)}<br>Polisens lägesbild ${esc(state.policeAreas.year)}. Detta visar inte en pågående händelse.<br><a href="${esc(state.policeAreas.sourceUrl)}" target="_blank" rel="noopener">Öppna källan ↗</a>`)
  }).addTo(policeAreasLayer);
}

function setPoliceAreasVisible(visible) {
  state.showPoliceAreas = visible;
  $('#show-police-areas').checked = visible;
  $('#btn-police-areas').setAttribute('aria-pressed', String(visible));
  renderPoliceAreasLayer();
}

async function loadPoliceAreas() {
  try {
    const response = await fetch('/api/police-areas');
    if (!response.ok) throw new Error('Områdesdata saknas');
    const data = await response.json();
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Ogiltiga områdesdata');
    state.policeAreas = data;
    const jump = $('#police-area-jump');
    for (const feature of [...data.features].sort((a, b) => `${a.properties.locality} ${a.properties.name}`.localeCompare(`${b.properties.locality} ${b.properties.name}`, 'sv'))) {
      jump.add(new Option(`${feature.properties.locality} · ${feature.properties.name}`, feature.id));
    }
    jump.disabled = false;
    const stale = data.stale ? ' · senast sparade kopia; källkontrollen misslyckades' : '';
    $('#police-areas-status').textContent = `${data.features.length} områden · Polisens lägesbild ${data.year}${stale}`;
    renderPoliceAreasLayer();
  } catch {
    $('#police-areas-status').textContent = 'Områdesgränserna kunde inte hämtas just nu.';
  }
}

async function loadSecurityZoneNews() {
  const container = $('#security-zone-news');
  try {
    const response = await fetch('/api/security-zone-news');
    if (!response.ok) throw new Error('RSS saknas');
    const data = await response.json();
    const note = '<p>Polisens nyheter är inte en förteckning över aktiva zoner. Kontrollera beslutets giltighetstid och karta hos Polisen.</p>';
    container.innerHTML = data.items.length
      ? `<p>${data.stale ? 'Senast sparade artiklar; källan svarar inte nu.' : 'Senaste artiklarna från Polisens RSS:'}</p>${data.items.map(item => `<article class="security-zone-news-item"><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)} ↗</a><small>${esc(formatSwedishTime(Date.parse(item.publishedAt)))}</small><p>${esc(item.summary)}</p></article>`).join('')}${note}`
      : `<p>Inga artiklar om säkerhetszoner i Polisens senaste RSS-flöde. Det bevisar inte att ingen aktiv zon finns. <a href="https://polisen.se/aktuellt/rss/" target="_blank" rel="noopener">Om Polisens RSS ↗</a></p>${note}`;
  } catch {
    container.innerHTML = '<p>Polisens nyhetsflöde kunde inte kontrolleras nu. Öppna <a href="https://polisen.se/aktuellt/rss/" target="_blank" rel="noopener">Polisens RSS ↗</a>.</p>';
  }
}

function clearRoute() {
  invalidateRoute();
  state.currentRouteData = null;
  state.routeFrom = null;
  state.routeTo = null;
  $('#route-from').value = '';
  $('#route-to').value = '';
  $('#route-result').hidden = true;
  $('#btn-clear-route').hidden = true;
  routeLayer.clearLayers();
  corridorLine = null;
  showToast('Rutt rensad.');
}

// ==================== FLIK 3: FAMILJ & GEOZONER ====================
function renderFamilyZones() {
  const container = $('#family-zones-list');
  if (!state.zones.length) {
    container.innerHTML = '<div class="empty-state"><p style="color: var(--text-dim); font-size: 11px; text-align: center; padding: 24px 12px;">Inga zoner sparade ännu.<br>Lägg till hemmet eller barnens skola ovan.</p></div>';
    return;
  }

  container.innerHTML = state.zones.map(zone => {
    // Beräkna aktiva händelser inom zonen
    const incidentsInZone = state.events.filter(e => {
      if (!e.location?.gps) return false;
      const d = haversineMeters(zone.lat, zone.lon, e.location.gps[0], e.location.gps[1]);
      return d <= zone.radius;
    });

    const isSafe = incidentsInZone.length === 0;
    const typeIcons = { school: '🏫', home: '🏡', sport: '⚽', other: '📍' };
    const demoBadge = zone.demo ? ' <span class="demo-badge">Exempel</span>' : '';

    return `
      <div class="zone-item" data-id="${esc(zone.id)}">
        <div class="zone-info">
          <h4>${typeIcons[zone.type] || '📍'} ${esc(zone.name)}${demoBadge}</h4>
          <p>${esc(zone.address)} (Radie: ${zone.radius}m)</p>
          <span class="zone-status-badge ${isSafe && state.eventsAvailable && !state.eventsStale ? 'safe' : 'warning'}">
            ${!state.eventsAvailable ? 'Händelsedata saknas' : state.eventsStale ? 'Fördröjd händelsedata – kontrollera källan' : isSafe ? '✓ Inga rapporterade händelser i zonen' : `⚠️ ${incidentsInZone.length} rapporterad${incidentsInZone.length > 1 ? 'e händelser' : ' händelse'} i zonen`}
          </span>
        </div>
        <div class="zone-actions">
          <button class="btn-delete-zone" data-id="${esc(zone.id)}" title="Ta bort zon" aria-label="Ta bort zon ${esc(zone.name)}">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // Event listeners för zoner
  container.querySelectorAll('.zone-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.btn-delete-zone')) return;
      const zone = state.zones.find(z => z.id === item.dataset.id);
      if (zone) {
        map.flyTo([zone.lat, zone.lon], 14, { duration: 0.8 });
        showToast(`Visar zon: ${zone.name}`);
      }
    });
  });

  container.querySelectorAll('.btn-delete-zone').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      state.zones = state.zones.filter(z => z.id !== id);
      savePlaces('tryggpuls_zones', state.zones);
      renderFamilyZones();
      renderFamilyZonesOnMap();
      showToast('Zon borttagen.');
    });
  });
}

function renderFamilyZonesOnMap(fit = true) {
  zonesLayer.clearLayers();
  if (state.activeTab !== 'familj') return;

  const points = [];
  for (const zone of window.familySharedZones || []) {
    points.push([zone.lat, zone.lon]);
    L.circle([zone.lat, zone.lon], {
      radius: zone.radius, color: zone.kind === 'watch' ? '#ef4444' : '#2563eb',
      fillColor: zone.kind === 'watch' ? '#ef4444' : '#2563eb', fillOpacity: 0.12, weight: 2
    }).bindPopup(`<b>${esc(zone.name)}</b><br>${zone.kind === 'watch' ? 'Bevakad plats' : 'Trygg plats'} · delad familjezon`).addTo(zonesLayer);
  }
  for (const zone of state.zones) {
    points.push([zone.lat, zone.lon]);

    // Rita cirkel för radien
    L.circle([zone.lat, zone.lon], {
      radius: zone.radius,
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.15,
      weight: 2
    }).bindPopup(`<b>${esc(zone.name)}</b><br>${esc(zone.address)}<br>Säkerhetsradie: ${zone.radius}m`).addTo(zonesLayer);

    // Rita ikon i mitten
    L.circleMarker([zone.lat, zone.lon], {
      radius: 6,
      color: '#10b981',
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(zonesLayer);
  }

  if (fit && points.length) {
    map.fitBounds(points, { padding: [60, 60], maxZoom: 14 });
  }
}

function setupFamilyZoneCreator() {
  const addressInput = $('#zone-address');
  const suggestionsBox = $('#zone-address-suggestions');
  let selectedPoint = null;

  setupPlaceSearch(addressInput, suggestionsBox, p => { selectedPoint = p; });

  $('#btn-add-zone').addEventListener('click', () => {
    const name = $('#zone-name').value.trim();
    const type = $('#zone-type').value;
    const radius = Number($('#zone-radius').value) || 500;

    if (!name) {
      showToast('Vänligen ange ett namn för zonen.');
      return;
    }
    if (!selectedPoint) {
      showToast('Vänligen sök och välj en adress ur förslagslistan.');
      return;
    }

    const newZone = {
      id: `z_${Date.now()}`,
      name,
      address: selectedPoint.name,
      lat: selectedPoint.lat,
      lon: selectedPoint.lon,
      radius,
      type
    };

    state.zones.push(newZone);
    savePlaces('tryggpuls_zones', state.zones);

    $('#zone-name').value = '';
    addressInput.value = '';
    selectedPoint = null;

    renderFamilyZones();
    renderFamilyZonesOnMap();
    showToast(`Zonen "${name}" skapad och aktiv!`);
  });
}

// ==================== FLIK 4: FÖRETAG B2B ====================
function renderWorkplaces() {
  const container = $('#corp-workplaces-list');
  let totalThreats = 0;

  container.innerHTML = state.workplaces.map(wp => {
    const nearby = state.events.filter(e => {
      if (!e.location?.gps) return false;
      return haversineMeters(wp.lat, wp.lon, e.location.gps[0], e.location.gps[1]) <= wp.radius;
    });

    totalThreats += nearby.length;
    const isOk = nearby.length === 0;
    const demoBadge = wp.demo ? ' <span class="demo-badge">Exempeldata</span>' : '';

    return `
      <div class="workplace-card" data-id="${esc(wp.id)}">
        <div class="workplace-card-top">
          <strong>🏢 ${esc(wp.name)}${demoBadge}</strong>
          <span class="workplace-badge ${isOk && state.eventsAvailable && !state.eventsStale ? 'ok' : 'alert'}">
            ${!state.eventsAvailable ? 'Händelsedata saknas' : state.eventsStale ? 'Fördröjd händelsedata' : isOk ? '✓ Inga rapporterade händelser' : `⚠️ ${nearby.length} rapporterad${nearby.length > 1 ? 'e händelser' : ' händelse'}`}
          </span>
        </div>
        <p>${esc(wp.address)}</p>
        <small style="color: var(--text-dim); font-size: 10px;">Säkerhetsperimeter: ${wp.radius}m</small>
      </div>
    `;
  }).join('');

  $('#corp-workplaces-count').textContent = state.workplaces.length;
  const threatsEl = $('#corp-active-threats');
  threatsEl.textContent = state.eventsAvailable ? totalThreats : '–';
  threatsEl.className = `corp-stat-number ${totalThreats === 0 ? 'safe' : 'text-danger'}`;

  container.querySelectorAll('.workplace-card').forEach(card => {
    card.addEventListener('click', () => {
      const wp = state.workplaces.find(w => w.id === card.dataset.id);
      if (wp) {
        map.flyTo([wp.lat, wp.lon], 14, { duration: 0.8 });
        showToast(`Fokuserar på: ${wp.name}`);
      }
    });
  });
}

function renderWorkplacesOnMap() {
  zonesLayer.clearLayers();
  if (state.activeTab !== 'foretag') return;

  const points = [];
  for (const wp of state.workplaces) {
    points.push([wp.lat, wp.lon]);

    L.circle([wp.lat, wp.lon], {
      radius: wp.radius,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.12,
      weight: 2
    }).bindPopup(`<b>🏢 ${esc(wp.name)}</b><br>${esc(wp.address)}`).addTo(zonesLayer);

    L.circleMarker([wp.lat, wp.lon], {
      radius: 6,
      color: '#38bdf8',
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(zonesLayer);
  }

  if (points.length) {
    map.fitBounds(points, { padding: [60, 60], maxZoom: 13 });
  }
}

// ==================== FLIK 5: PLATSPROFIL & BRÅ ====================
async function loadBraStatistics() {
  try {
    const res = await fetch('/api/bra-stats');
    const data = await res.json();
    if (!res.ok || !data.regions?.length) throw new Error(data.error || 'Statistiken är inte tillgänglig');
    state.braData = data;
    populateBraRegions();
    renderBraProfile();
  } catch (err) {
    $('#bra-stats-container').innerHTML = '<p class="error-msg">BRÅ-statistiken kunde inte hämtas. <a href="https://bra.se/statistik" target="_blank" rel="noopener">Öppna BRÅ</a></p>';
  }
}

function populateBraRegions() {
  const select = $('#bra-region-select');
  if (!state.braData?.regions) return;

  select.innerHTML = state.braData.regions.map(r => `
    <option value="${esc(r.region)}">${esc(r.region)}</option>
  `).join('');

  select.addEventListener('change', () => {
    renderBraProfile();
  });
}

function renderBraProfile() {
  if (!state.braData?.regions?.length) return;
  const select = $('#bra-region-select');
  const regionName = select.value || (state.braData.regions && state.braData.regions[0] && state.braData.regions[0].region) || '';
  const region = state.braData.regions.find(r => r.region === regionName) || state.braData.regions[0];
  if (!region) return;

  const natAvg = state.braData.nationalAverage.totalPer100k;
  const diff = region.totalPer100k - natAvg;
  const diffPercent = Math.round((diff / natAvg) * 100);
  const diffSign = diff >= 0 ? `+${diffPercent}%` : `${diffPercent}%`;

  const levelLabel = state.braData.level === 'kommun' ? 'kommun' : (state.braData.level || 'region');
  const referenceYear = state.braData.referenceYear || 'okänt år';
  const fetchedAt = state.braData.fetchedAt ? formatSwedishTime(Date.parse(state.braData.fetchedAt)) : 'saknas';

  const container = $('#bra-stats-container');
  container.innerHTML = `
    <div class="bra-summary-card">
      <div class="bra-meta-row">
        <span class="source-badge">${esc(levelLabel)}-nivå</span>
        <span class="source-badge">År: ${esc(referenceYear)}</span>
      </div>
      <h3>${esc(region.region)}</h3>
      <div class="bra-rate-display">
        <span class="bra-rate-number">${region.totalPer100k.toLocaleString('sv-SE')}</span>
        <span class="bra-rate-compare">anmälda brott / 100 000 invånare (${diffSign} mot rikssnittet ${natAvg.toLocaleString('sv-SE')})</span>
      </div>
      <span class="source-badge">${esc(region.riskIndex)}</span>
      <p class="bra-analysis-text">
        <strong>Antal anmälda brott:</strong> ${region.total.toLocaleString('sv-SE')} st<br>
        <strong>Uppskattad befolkning:</strong> ${region.population ? region.population.toLocaleString('sv-SE') : 'saknas'} invånare<br>
        <strong>Rankning:</strong> ${region.rank || 'saknas'} av ${state.braData.regionCount || '?'} ${levelLabel}er (efter anmälda brott per 100 000)<br>
        <strong>Hämtad:</strong> ${fetchedAt}
      </p>
    </div>

    <div class="bra-source-card">
      <h4>Källa & metod</h4>
      <p>
        Data hämtas live från Brottsförebyggande rådets (BRÅ) officiella statistik
        över anmälda brott. Statistiken presenteras på <strong>${levelLabel}</strong>-nivå,
        vilket innebär att siffrorna avser hela kommunens anmälda brott, inte
        en specifik stadsdel eller gata.
      </p>
      <p>
        <strong>OBS — denna statistik visar inte:</strong> områdets faktiska trygghet.
        Anmälningsfrekvensen påverkas av många faktorer, bland annat polisens
        synlighet, anmälningsbenägenhet och befolkningstäthet. Ett område med många
        anmälningar kan ha en hög polisnärvaro, medan ett område med få anmälningar
        inte automatiskt är tryggast.
      </p>
      <p>
        Jämförelsen mot rikssnittet är befolkningsviktat och beräknas från samma
        datakälla. Rikssnittet är <strong>${natAvg.toLocaleString('sv-SE')}</strong>
        anmälda brott per 100 000 invånare.
      </p>
      <a href="${esc(state.braData.sourceUrl || 'https://bra.se/statistik')}" target="_blank" rel="noopener">
        Läs mer på BRÅ.se ↗
      </a>
    </div>
  `;
}

// ==================== FLIK 6: SOS & LARM ====================
function setupSosFeatures() {
  const coordsText = $('#sos-coords-text');
  const addressText = $('#sos-address-text');
  const shareBtn = $('#btn-share-sos');

  $('#btn-fetch-sos-gps').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Positionering stöds inte av denna webbläsare.');
      return;
    }

    coordsText.textContent = 'Läser av enhetsposition...';
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        state.userCoords = [lat, lon];

        coordsText.textContent = `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
        renderUserGpsOnMap();
        map.flyTo([lat, lon], 16, { duration: 1 });

        // Hämta gatuadress via Nominatim (backend-mediad, se server.mjs)
        try {
          const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
          const data = await res.json();
          if (data.address) {
            state.userAddress = data.address;
            addressText.textContent = data.address;
          } else {
            addressText.textContent = 'Adress kunde inte slås upp; koordinater är aktiva.';
          }
        } catch {
          addressText.textContent = 'Adress kunde inte slås upp; koordinater är aktiva.';
        }

        shareBtn.disabled = false;
        showToast('Position hämtad. Välj Dela för att skicka den till en kontakt.');
      },
      err => {
        coordsText.textContent = 'Kunde inte hämta position';
        showToast('Kunde inte läsa position. Kontrollera att platstjänster är aktiverade.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Dela via SMS
  shareBtn.addEventListener('click', () => {
    if (!state.userCoords) return;
    const [lat, lon] = state.userCoords;
    const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
    const message = `TRYGGPULS NÖDMEDDELANDE: Jag behöver hjälp. Min position är: ${mapsLink}`;
    
    // Testa om Web Share API är tillgängligt
    if (navigator.share) {
      navigator.share({
        title: 'Nödposition TryggPuls',
        text: message,
        url: mapsLink
      }).catch(() => {});
    } else {
      // Öppna sms: schema
      window.location.href = `sms:?body=${encodeURIComponent(message)}`;
    }
  });

  // Barnläge
  $('#btn-child-sos').addEventListener('click', () => {
    const parentPhone = prompt('Ange förälders/kontaktpersons telefonnummer att larma:', '');
    if (!parentPhone) return;
    if (!/^\+?[0-9 ()-]{5,25}$/.test(parentPhone)) { showToast('Ange ett giltigt telefonnummer.'); return; }

    if (state.userCoords) {
      const [lat, lon] = state.userCoords;
      const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
      const msg = `TRYGGPULS BARNLÄGE: Hej, jag känner mig otrygg och behöver hjälp! Min plats: ${mapsLink}`;
      window.location.href = `sms:${parentPhone}?body=${encodeURIComponent(msg)}`;
    } else {
      window.location.href = `tel:${parentPhone}`;
    }
  });
}

function renderUserGpsOnMap() {
  userLayer.clearLayers();
  if (!state.userCoords) return;

  L.circleMarker(state.userCoords, {
    radius: 9,
    color: '#38bdf8',
    fillColor: '#0284c7',
    fillOpacity: 0.9,
    weight: 3
  }).bindPopup('<b>📍 Min aktuella position</b>').addTo(userLayer);
}

// ==================== HÄMTA DATA FRÅN POLISEN ====================
let isFetching = false;
let isFetchingCrisis = false;
async function refreshCrisisUpdates() {
  if (isFetchingCrisis) return;
  isFetchingCrisis = true;
  const panel = $('.crisis-panel');
  panel?.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch('/api/crisis-updates');
    const data = await res.json();
    if (!res.ok && !data.fetchedAt) throw new Error(data.error || 'Krisinformation.se svarar inte just nu.');

    const vmas = Array.isArray(data.vmas) ? data.vmas : [];
    const notices = Array.isArray(data.notices) ? data.notices : [];
    const items = [
      ...vmas.map(item => ({ ...item, type: 'vma' })),
      ...notices.map(item => ({ ...item, type: 'notice' }))
    ];
    $('#crisis-count').textContent = data.stale && !items.length ? '–' : String(items.length);
    $('#crisis-updated').textContent = data.partialError
      ? 'Delvis uppdaterad'
      : data.stale ? 'Senaste sparade uppdateringarna'
      : data.fetchedAt ? `Uppdaterad ${formatSwedishTime(Date.parse(data.fetchedAt))}` : 'Ingen uppdatering ännu';

    if (!items.length) {
      $('#crisis-feed').innerHTML = `<p class="crisis-empty">${data.stale ? 'En del av myndighetsinformationen kunde inte hämtas. Kontrollera källan direkt vid behov.' : 'Inga aktiva VMA eller nya krisnotiser just nu.'}</p>`;
    } else {
      $('#crisis-feed').innerHTML = items.map(item => {
        const isVma = item.type === 'vma';
        const title = esc(item.title || (isVma ? 'Viktigt meddelande till allmänheten' : 'Uppdatering från Krisinformation'));
        const summary = esc(item.summary || 'Öppna Krisinformation.se för mer information.');
        const area = item.area ? `<span class="crisis-area">${esc(item.area)}</span>` : '';
        const published = item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))
          ? `<time>${esc(formatSwedishTime(Date.parse(item.publishedAt)))}</time>` : '';
        return `<article class="crisis-card ${isVma ? 'is-vma' : ''}">
          <div class="crisis-card-meta"><span class="crisis-kind">${isVma ? '⚠ VMA' : 'Krisnotis'}</span>${area}${published}</div>
          <h3>${title}</h3><p>${summary}</p>
          <a href="${esc(item.source)}" target="_blank" rel="noopener">Läs mer hos Krisinformation ↗</a>
        </article>`;
      }).join('');
    }
    if (data.stale) showToast('Krisinformationen kunde inte uppdateras. Senast hämtade uppgifter visas.');
  } catch (err) {
    $('#crisis-count').textContent = '–';
    $('#crisis-updated').textContent = 'Källan svarar inte';
    $('#crisis-feed').innerHTML = '<p class="crisis-empty">Myndighetsinformation kunde inte hämtas. Kontrollera Krisinformation.se direkt vid behov.</p>';
  } finally {
    panel?.setAttribute('aria-busy', 'false');
    isFetchingCrisis = false;
  }
}

async function refreshPoliceEvents() {
  if (isFetching) return;
  isFetching = true;
  $('#btn-refresh').disabled = true;

  try {
    const res = await fetch('/api/events');
    const data = await res.json();

    if (!res.ok || !data.fetchedAt) {
      throw new Error(data.error || 'Kunde inte hämta händelser');
    }

    state.events = data.events || [];
    state.eventsAvailable = true; state.eventsStale = Boolean(data.stale);
    $('#status-text').textContent = data.stale ? 'Fördröjt flöde' : 'Polisen Live';
    $('#status-dot').classList.toggle('stale', data.stale);
    $('#status-updated').textContent = `Synkad ${formatSwedishTime(Date.parse(data.fetchedAt))}`;

    // Fyll i länsväljare
    const regionSelect = $('#karta-region');
    const prevRegion = regionSelect.value;
    const uniqueRegions = [...new Set(state.events.map(e => e.location.name))].filter(Boolean).sort();
    
    regionSelect.innerHTML = '<option value="">Hela Sverige (alla platser)</option>' +
      uniqueRegions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    if (prevRegion && !uniqueRegions.includes(prevRegion)) regionSelect.insertAdjacentHTML('beforeend', `<option value="${esc(prevRegion)}">${esc(prevRegion)} (inga notiser)</option>`);
    regionSelect.value = prevRegion;

    filterIncidents();
    renderFamilyZones();
    renderWorkplaces();

    if (data.stale) {
      showToast('Polisens flöde är tillfälligt fördröjt. Senaste kända händelser visas.');
    }
  } catch (err) {
    state.eventsStale = true;
    if (!state.eventsAvailable) $('#karta-feed').innerHTML = '<p class="feed-status">Polisens flöde kunde inte hämtas. Använd ↻ Uppdatera eller försök igen senare.</p>';
    renderFamilyZones(); renderWorkplaces();
    $('#status-text').textContent = 'Källfel';
    $('#status-dot').classList.add('stale');
    showToast('Kunde inte ansluta till Polisens öppna data. Försöker igen automatiskt.');
  } finally {
    $('#karta-feed').setAttribute('aria-busy', 'false');
    isFetching = false;
    $('#btn-refresh').disabled = false;
  }
}

// ==================== MODALER: KÄLLOR & RÄTTSPRAXIS ====================
async function openSourcesModal() {
  const dialog = $('#sources-dialog');
  dialog.showModal();

  try {
    const res = await fetch('/api/sources');
    const data = await res.json();
    $('#sources-list').innerHTML = (data.sources || []).map(s => `
      <div class="source-card">
        <div class="source-card-header">
          <h4>${esc(s.name)}</h4>
          <span class="source-badge">${esc(s.provider)}</span>
        </div>
        <p>${esc(s.detail)}</p>
        <p class="source-status">${esc(sourceStatusLabels[s.status] || s.status)}${s.fetchedAt ? ' · ' + esc(formatSwedishTime(Date.parse(s.fetchedAt))) : ''}</p>
        <small>${esc(s.scope)} · Uppdateras: ${esc(s.refresh)}</small>
        <a href="${esc(s.url)}" target="_blank" rel="noopener">Öppna källa ↗</a>
      </div>
    `).join('');
  } catch {
    $('#sources-list').innerHTML = '<p>Kunde inte ladda källinformation.</p>';
  }
}

async function openLegalModal() {
  const dialog = $('#legal-dialog');
  dialog.showModal();

  try {
    const res = await fetch('/api/legal-updates');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Källan svarar inte');
    if (data.updates?.length) {
      $('#legal-list').innerHTML = (data.stale ? '<p class="data-note">Visar tidigare hämtad rättspraxis. Källan kunde inte uppdateras.</p>' : '') + data.updates.slice(0, 10).map(item => `
        <div class="legal-card">
          <div class="legal-card-header">
            <h4>${esc(item.court)}</h4>
            <small>${esc(item.date || 'Datum saknas')}</small>
          </div>
          <p>${esc(item.summary || 'Sammanfattning saknas.')}</p>
          <small>
            Målnummer: ${esc(item.caseNumbers.join(', ') || 'Saknas')} · 
            <a href="${esc(item.source)}" target="_blank" rel="noopener" style="color: var(--accent-emerald);">Öppna originalhandling ↗</a>
          </small>
        </div>
      `).join('');
    } else {
      $('#legal-list').innerHTML = '<p>Inga aktuella rättsuppdateringar tillgängliga just nu.</p>';
    }
  } catch {
    $('#legal-list').innerHTML = '<p>Kunde inte nå Domstolsverkets öppna API.</p>';
  }
}

// Explicit submission avoids autocomplete requests and stale selected coordinates.
function setupPlaceSearch(input, results, onSelect) {
  let revision = 0;
  const search = document.createElement('button');
  search.type = 'button'; search.className = 'btn-secondary place-search';
  search.textContent = 'Sök plats'; search.setAttribute('aria-label', `Sök plats för ${input.id === 'route-from' ? 'startpunkt' : input.id === 'route-to' ? 'destination' : 'zon'}`);
  input.insertAdjacentElement('afterend', search);
  input.setAttribute('aria-controls', results.id);
  input.setAttribute('aria-expanded', 'false');
  input.addEventListener('input', () => { revision++; onSelect(null); results.hidden = true; input.setAttribute('aria-expanded', 'false'); });
  const run = async () => {
    const query = input.value.trim(), version = ++revision;
    onSelect(null);
    if (query.length < 2) { showToast('Skriv minst två tecken och välj Sök plats.'); return; }
    search.disabled = true; search.textContent = 'Söker…';
    results.hidden = false; results.textContent = 'Hämtar platser…';
    input.setAttribute('aria-expanded', 'true');
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (revision !== version) return;
      if (!response.ok) throw new Error(data.error || 'Platsen kunde inte sökas');
      results.innerHTML = data.results?.length ? data.results.map(p => `<button type="button" class="suggestion-item" data-lat="${p.lat}" data-lon="${p.lon}" data-name="${esc(p.displayName)}">${esc(p.displayName)}</button>`).join('') : '<p>Ingen plats hittades. Lägg till ort eller kommun och försök igen.</p>';
    } catch (err) {
      if (revision === version) results.textContent = `${err.message}. Försök igen.`;
    } finally { search.disabled = false; search.textContent = 'Sök plats'; }
  };
  search.addEventListener('click', run);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); run(); }
    if (event.key === 'Escape') { revision++; results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
  });
  results.addEventListener('click', event => {
    const item = event.target.closest('.suggestion-item');
    if (!item) return;
    revision++;
    const point = { name: item.dataset.name, lat: Number(item.dataset.lat), lon: Number(item.dataset.lon) };
    input.value = point.name; results.hidden = true; input.setAttribute('aria-expanded', 'false');
    onSelect(point); input.focus();
  });
}

const sourceStatusLabels = { ok: 'Tillgänglig', stale: 'Fördröjd / delvis tillgänglig', unavailable: 'Källan svarar inte', not_checked: 'Inte hämtad ännu', on_demand: 'Hämtas vid sökning', requires_key: 'Ej ansluten · API-nyckel krävs' };
const informationData = {};
let informationPending = false;
async function refreshInformation() {
  if (informationPending) return;
  informationPending = true;
  $('#btn-refresh-information').disabled = true;
  await Promise.all([
    ['weather', '/api/weather-warnings'], ['news', '/api/crisis-news'], ['preparedness', '/api/preparedness']
  ].map(async ([key, url]) => {
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok && !data.fetchedAt) throw new Error(data.error || 'Källan svarar inte');
      informationData[key] = data;
    } catch (err) { informationData[key] = { ...(informationData[key] || { items: [] }), stale: true, error: err.message }; }
    renderInformation();
  }));
  informationPending = false;
  $('#btn-refresh-information').disabled = false;
}

function renderInformation() {
  const query = $('#information-search').value.trim().toLocaleLowerCase('sv');
  for (const key of ['weather', 'news', 'preparedness']) {
    const data = informationData[key];
    if (!data) continue;
    const openIds = new Set([...document.querySelectorAll(`#${key}-feed details[open]`)].map(node => node.dataset.itemId));
    const provider = key === 'weather' ? 'SMHI' : 'Krisinformation.se';
    const homepage = key === 'weather' ? 'https://www.smhi.se/vader/prognoser-och-varningar/varningar-och-meddelanden' : 'https://www.krisinformation.se/';
    const items = (data.items || []).filter(item => !query || `${item.title} ${item.area} ${item.summary || ''}`.toLocaleLowerCase('sv').includes(query));
    const status = data.stale ? `Kunde inte uppdatera. ${data.fetchedAt ? 'Tidigare hämtad information visas.' : 'Information saknas.'}` : `Hämtad ${formatSwedishTime(Date.parse(data.fetchedAt))}`;
    const empty = query ? 'Inga träffar. Prova en annan plats eller ett annat ämne.' : key === 'weather' ? 'Inga varningar eller meddelanden i SMHI:s aktuella svar.' : key === 'news' ? 'Inga publicerade krisnyheter den senaste veckan.' : 'Inga guider i källans svar.';
    $(`#${key}-feed`).innerHTML = `<p class="data-note ${data.stale ? 'source-warning' : ''}">${esc(status)} · <a href="${homepage}" target="_blank" rel="noopener">${provider} ↗</a></p>` +
      (items.length ? items.map(item => `<details data-item-id="${esc(item.id)}" ${openIds.has(String(item.id)) ? 'open' : ''} class="information-card ${key === 'weather' ? 'weather-' + esc(item.level.toLowerCase()) : ''}">
        <summary>${key === 'weather' ? `<span class="warning-level">${esc(item.levelLabel)}</span>` : ''}<strong>${esc(item.title)}</strong>${item.area ? `<span>${esc(item.area)}</span>` : ''}</summary>
        ${item.validFrom ? `<p class="data-note">Från ${esc(formatSwedishTime(Date.parse(item.validFrom)))}${item.validTo ? ' till ' + esc(formatSwedishTime(Date.parse(item.validTo))) : ' · tills vidare'}</p>` : ''}
        ${item.summary ? `<p>${esc(item.summary)}</p>` : ''}
        ${(item.descriptions || []).map(d => `<p><strong>${esc(d.title)}</strong><br>${esc(d.text)}</p>`).join('')}
        <a href="${esc(item.source)}" target="_blank" rel="noopener">Läs hos ${provider} ↗</a>
      </details>`).join('') : `<p class="data-note">${data.stale ? 'Kontrollera källan direkt för aktuell information.' : empty}</p>`);
  }
  const weather = informationData.weather;
  if (weather) $('#weather-shortcut').textContent = weather.stale ? '☁️ Väderdata fördröjd · kontrollera SMHI →' : `☁️ ${weather.items.length} vädervarningar & meddelanden · hela Sverige →`;
}

function setupNavigation() {
  const tabs = [...$$('.nav-tab[data-tab]')];
  tabs.forEach((tab, index) => {
    tab.id = 'tab-' + tab.dataset.tab;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'panel-' + tab.dataset.tab);
    const panel = document.getElementById('panel-' + tab.dataset.tab);
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); tabs[next].focus(); setActiveTab(tabs[next].dataset.tab); }
    });
  });
  setActiveTab(location.hash.slice(1) || 'nara', false);
  window.addEventListener('popstate', () => setActiveTab(location.hash.slice(1) || 'nara', false));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => { setActiveTab(button.dataset.go); $('#sidebar').focus(); $('#more-dialog')?.close(); }));
  $('#information-search').addEventListener('input', renderInformation);
  $('#btn-refresh-information').addEventListener('click', refreshInformation);
  $('#btn-clear-filters').addEventListener('click', () => {
    state.searchQuery = ''; state.selectedRegion = ''; state.periodHours = 24; state.activeCategory = 'all';
    $('#karta-search').value = ''; $('#karta-region').value = ''; $('#karta-period').value = '24';
    $$('#karta-categories .chip').forEach(c => { c.classList.toggle('active', c.dataset.category === 'all'); c.setAttribute('aria-pressed', c.dataset.category === 'all'); });
    filterIncidents();
  });
  $$('#karta-categories .chip').forEach(c => c.setAttribute('aria-pressed', c.classList.contains('active')));
  $('#karta-feed').addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.incident-card')) { event.preventDefault(); event.target.click(); }
  });
  for (const id of ['route-mode', 'route-buffer']) document.getElementById(id).addEventListener('change', invalidateRoute);
  $('#btn-route-follow').addEventListener('click', startRouteFollow);
  $('#btn-route-stop').addEventListener('click', stopRouteFollow);
  $('#btn-route-view-map').addEventListener('click', () => setMobileView(true));
  $('#btn-reroute-current').addEventListener('click', () => {
    if (!state.followPosition) return;
    state.routeFrom = { name: 'Min aktuella position', lat: state.followPosition[0], lon: state.followPosition[1] };
    $('#route-from').value = state.routeFrom.name;
    calculateRoute();
  });
  document.addEventListener('visibilitychange', () => {
    if (!state.routeFollowActive) return;
    if (document.hidden) pauseRouteFollow(); else resumeRouteFollow();
  });
  setupNearbySearch();
  $('#btn-view-content').addEventListener('click', () => setMobileView(false));
  $('#btn-view-map').addEventListener('click', () => setMobileView(true));
}

function setMobileView(showMap) {
  document.body.classList.toggle('mobile-map', showMap);
  $('#btn-view-content').setAttribute('aria-pressed', !showMap);
  $('#btn-view-map').setAttribute('aria-pressed', showMap);
  if (window.matchMedia('(max-width: 992px)').matches) window.scrollTo({ top: 0 });
  setTimeout(() => {
    map.invalidateSize();
    if (showMap && state.activeTab === 'rutt' && state.currentRouteData) renderRouteOnMap();
    if (showMap && state.activeTab === 'familj') renderFamilyZonesOnMap();
  }, 50);
}

// ==================== INITIALISERING ====================
function init() {
  setupNavigation();
  // Fliknavigering
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.id === 'btn-more') { $('#more-dialog').showModal(); return; }
      setActiveTab(tab.dataset.tab);
    });
  });

  // Filterevent för karta
  $('#karta-search').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    filterIncidents();
  });

  $('#karta-region').addEventListener('change', e => {
    state.selectedRegion = e.target.value;
    filterIncidents();
    if (state.selectedRegion) {
      const matched = state.filteredEvents.find(ev => ev.location.name === state.selectedRegion);
      if (matched && matched.location.gps) {
        map.flyTo(matched.location.gps, 8, { duration: 0.8 });
      }
    }
  });

  $('#karta-period').addEventListener('change', e => {
    state.periodHours = Number(e.target.value);
    filterIncidents();
  });

  $('#karta-categories').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $$('#karta-categories .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    $('#karta-categories .chip').forEach(c => c.setAttribute('aria-pressed', c === chip));
    state.activeCategory = chip.dataset.category;
    filterIncidents();
  });

  // Klick i händelselistan
  $('#karta-feed').addEventListener('click', e => {
    const card = e.target.closest('.incident-card');
    if (card) {
      showIncidentDetail(Number(card.dataset.id));
    }
  });

  // Kartkontroller
  $('#show-police-areas').addEventListener('change', event => setPoliceAreasVisible(event.target.checked));
  $('#btn-police-areas').addEventListener('click', () => setPoliceAreasVisible(!state.showPoliceAreas));
  $('#police-area-jump').addEventListener('change', event => {
    const feature = state.policeAreas?.features.find(item => item.id === event.target.value);
    if (!feature) return;
    setPoliceAreasVisible(true);
    map.fitBounds(L.geoJSON(feature).getBounds(), { padding: [50, 50], maxZoom: 14 });
    setMobileView(true);
  });
  $('#btn-refresh').addEventListener('click', () => { refreshPoliceEvents(); refreshCrisisUpdates(); refreshInformation(); });
  $('#btn-reset-map').addEventListener('click', () => {
    map.setView([62.0, 15.0], 5);
    state.selectedRegion = '';
    $('#karta-region').value = '';
    filterIncidents();
  });

  $('#btn-my-location').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('GPS stöds inte av din webbläsare.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        state.userCoords = [lat, lon];
        renderUserGpsOnMap();
        map.flyTo([lat, lon], 14, { duration: 0.8 });
        showToast('Centrerar kartan på din GPS-position!');
      },
      () => {
        showToast('Kunde inte läsa GPS-position.');
      }
    );
  });

  // Modalkontroller
  $('#btn-sources').addEventListener('click', openSourcesModal);
  $('#btn-close-sources').addEventListener('click', () => $('#sources-dialog').close());
  $('#btn-legal').addEventListener('click', openLegalModal);
  $('#btn-close-legal').addEventListener('click', () => $('#legal-dialog').close());
  $('#btn-close-more').addEventListener('click', () => $('#more-dialog').close());
  const savedTheme = localStorage.getItem('tryggpuls_theme') === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = savedTheme;
  $('#btn-theme-toggle').textContent = savedTheme === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema';
  $('#btn-theme-toggle').addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    localStorage.setItem('tryggpuls_theme', next);
    $('#btn-theme-toggle').textContent = next === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema';
  });
  for (const dialog of ['more-dialog', 'sources-dialog', 'legal-dialog']) document.getElementById(dialog).addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });

  // Initiera underfunktioner
  setupRouteSearch();
  setupFamilyZoneCreator();
  setupSosFeatures();
  loadBraStatistics();

  // Starta hämtning av Polisen data
  refreshPoliceEvents();
  loadPoliceAreas();
  loadSecurityZoneNews();
  refreshCrisisUpdates();
  refreshInformation();
  renderFamilyZones(); renderWorkplaces();
  setInterval(() => { if (!document.hidden) refreshInformation(); }, 65000);
  setInterval(refreshPoliceEvents, 65000);
  setInterval(refreshCrisisUpdates, 65000);
  setInterval(() => { if (!document.hidden) loadSecurityZoneNews(); }, 30 * 60_000);
}

// Kör init när DOM är laddad
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
function nearbyDistanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point.lat) !== (yj > point.lat) && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearbyGeometryContains(geometry, point) {
  if (!geometry) return false;
  if (geometry.type === 'Feature') return nearbyGeometryContains(geometry.geometry, point);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(rings => pointInRing(point, rings[0]) && !rings.slice(1).some(ring => pointInRing(point, ring)));
}

function setupNearbySearch() {
  const input = $('#nearby-query'), suggestions = $('#nearby-suggestions');
  $('#nearby-overview').addEventListener('click', loadStationHours);
  const saved = (() => { try { return JSON.parse(localStorage.getItem('tryggpuls_nearby_place') || 'null'); } catch { return null; } })();
  const choosePlace = (point, label, remember) => {
    state.nearbyPoint = point; state.nearbyLabel = label;
    if (state.activeTab === 'nara') {
      renderNearbyMap(point, state.nearbyShelters);
      map.setView([point.lat, point.lon], 13);
    }
    $('#nearby-place-label').textContent = `Vald plats: ${label}${point.gps ? ' · GPS, endast i den här sessionen' : ''}`;
    $('#btn-nearby-refresh').hidden = false;
    if (remember) { try { localStorage.setItem('tryggpuls_nearby_place', JSON.stringify({ lat: point.lat, lon: point.lon, name: label })); } catch {} }
    suggestions.hidden = true; refreshNearby();
  };
  const search = async () => {
    const query = input.value.trim();
    if (query.length < 2) { $('#nearby-place-label').textContent = 'Skriv minst två tecken för att söka en ort.'; return; }
    $('#btn-nearby-search').disabled = true; $('#btn-nearby-search').textContent = 'Söker…';
    suggestions.hidden = false; suggestions.textContent = 'Söker platser…';
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`), data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Platsökningen misslyckades');
      suggestions.innerHTML = (data.results || []).map((place, index) => `<button class="suggestion-item" type="button" data-index="${index}">${esc(place.displayName)}</button>`).join('') || '<p>Ingen plats hittades. Lägg till ort eller kommun och försök igen.</p>';
      suggestions._results = data.results || [];
    } catch (error) { suggestions.textContent = `${error.message}. Försök igen.`; }
    finally { $('#btn-nearby-search').disabled = false; $('#btn-nearby-search').textContent = 'Sök'; }
  };
  $('#btn-nearby-search').addEventListener('click', search);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); search(); } });
  suggestions.addEventListener('click', event => {
    const button = event.target.closest('[data-index]'); if (!button) return;
    const place = suggestions._results?.[Number(button.dataset.index)]; if (!place) return;
    input.value = place.displayName;
    choosePlace({ lat: place.lat, lon: place.lon, city: place.city }, place.displayName, true);
  });
  $('#btn-nearby-gps').addEventListener('click', () => {
    if (!navigator.geolocation) { $('#nearby-place-label').textContent = 'GPS stöds inte i webbläsaren. Sök en ort i stället.'; return; }
    $('#btn-nearby-gps').disabled = true; $('#btn-nearby-gps').textContent = 'Hämtar position…';
    navigator.geolocation.getCurrentPosition(async position => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude, gps: true };
      let label = 'Min aktuella position';
      try { const response = await fetch(`/api/reverse-geocode?lat=${point.lat}&lon=${point.lon}`); const data = await response.json(); if (data.address) label = data.address; } catch {}
      input.value = label; choosePlace(point, label, false);
      $('#btn-nearby-gps').disabled = false; $('#btn-nearby-gps').textContent = 'Använd min position';
    }, error => {
      $('#nearby-place-label').textContent = error.code === 1 ? 'Positionstillstånd avvisades. Du kan söka en ort utan GPS.' : 'Positionen kunde inte hämtas. Du kan söka en ort i stället.';
      $('#btn-nearby-gps').disabled = false; $('#btn-nearby-gps').textContent = 'Använd min position';
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
  });
  $('#btn-nearby-refresh').addEventListener('click', refreshNearby);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) && typeof saved.name === 'string') {
    input.value = saved.name; choosePlace({ lat: saved.lat, lon: saved.lon, city: saved.name }, saved.name, false);
  }
}

let nearbyPending = false;
async function refreshNearby() {
  if (!state.nearbyPoint || nearbyPending) return;
  nearbyPending = true;
  $('#nearby-overview').setAttribute('aria-busy', 'true');
  $('#nearby-overview').innerHTML = '<p>Hämtar relevanta myndighetskällor…</p>';
  const shelterUrl = `/api/shelters?lat=${encodeURIComponent(state.nearbyPoint.lat)}&lon=${encodeURIComponent(state.nearbyPoint.lon)}&radius=2000`;
  const urls = ['/api/events', '/api/weather-warnings', '/api/crisis-updates', '/api/traffic', '/api/police-stations', shelterUrl];
  const results = await Promise.allSettled(urls.map(async url => { const response = await fetch(url); const data = await response.json(); if (!response.ok && !data.fetchedAt) throw new Error(data.error || 'Källan svarar inte'); return data; }));
  const data = Object.fromEntries(urls.map((url, index) => [url, results[index].status === 'fulfilled' ? results[index].value : { items: [], stale: true, error: results[index].reason?.message }]));
  const point = state.nearbyPoint, label = state.nearbyLabel.toLocaleLowerCase('sv');
  const areaMatches = area => String(area || '').toLocaleLowerCase('sv').split(/[,;·]/).some(part => { const value = part.trim(); return value.length > 2 && (label.includes(value) || value.includes(label.split(',').at(-1)?.trim())); });
  const events = (data['/api/events'].events || []).filter(event => event.location?.gps && nearbyDistanceMeters(point, { lat: event.location.gps[0], lon: event.location.gps[1] }) < 18000).slice(0, 8);
  const warnings = (data['/api/weather-warnings'].items || []).filter(item => nearbyGeometryContains(item.geometry, point) || areaMatches(item.area));
  const crisis = [...(data['/api/crisis-updates'].vmas || []), ...(data['/api/crisis-updates'].notices || [])].filter(item => areaMatches(item.area));
  const traffic = (data['/api/traffic'].items || []).filter(item => {
    if (nearbyGeometryContains(item.geometry, point)) return true;
    const geometry = item.geometry?.type === 'Feature' ? item.geometry.geometry : item.geometry;
    const points = [];
    const walk = value => { if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') points.push(value); else if (Array.isArray(value)) value.forEach(walk); };
    walk(geometry?.coordinates);
    return points.some(([lon, lat]) => nearbyDistanceMeters(point, { lat, lon }) < 8000);
  }).slice(0, 6);
  const stationsData = data['/api/police-stations'];
  state.policeStations = (stationsData.items || []).map(station => ({ ...station, distance: nearbyDistanceMeters(point, { lat: station.lat, lon: station.lon }) })).sort((a, b) => a.distance - b.distance).slice(0, 3);
  const sheltersData = data[shelterUrl] || { items: [], stale: true, error: 'Skyddsrumsregistret kunde inte hämtas.' };
  const shelters = sheltersData.items || [];
  state.nearbyShelters = shelters;
  if (state.activeTab === 'nara') renderNearbyMap(point, shelters);
  const sourceLabels = { '/api/events': 'polisnotiser', '/api/weather-warnings': 'SMHI', '/api/crisis-updates': 'Krisinformation', '/api/traffic': 'Trafikverket', '/api/police-stations': 'polisstationer' };
  const sourceWarnings = urls.flatMap((url, index) => results[index].status === 'rejected' || data[url].stale ? [`${sourceLabels[url] || 'skyddsrum'}: informationen kan vara fördröjd`] : []);
  const eventCards = events.length ? events.map(event => `<article class="nearby-card"><strong>${esc(event.type)} · ${esc(event.name)}</strong><p>${esc(event.summary)}</p><small>${esc(event.location?.name || '')} · ${esc(formatSwedishTime(event.ts))} · kartpunkten anger ungefärligt område</small>${event.url ? `<a href="${esc(event.url)}" target="_blank" rel="noopener">Polisnotis ↗</a>` : ''}</article>`).join('') : '<p>Inga polisnotiser matchade den valda platsens grova område.</p>';
  const warningsHtml = warnings.length ? warnings.map(item => `<article class="nearby-card"><strong>${esc(item.levelLabel || 'Varning')} · ${esc(item.title)}</strong><p>${esc(item.area || '')}${item.validTo ? ` · gäller till ${esc(formatSwedishTime(Date.parse(item.validTo)))}` : ''}</p><a href="${esc(item.source)}" target="_blank" rel="noopener">SMHI ↗</a></article>`).join('') : '<p>Inga geografiskt matchande SMHI-varningar i den senast hämtade datan.</p>';
  const crisisHtml = crisis.length ? crisis.map(item => `<article class="nearby-card"><strong>${esc(item.type === 'vma' ? 'VMA' : 'Krisnotis')} · ${esc(item.title)}</strong><p>${esc(item.area || 'Område framgår inte av källan')}</p><a href="${esc(item.source)}" target="_blank" rel="noopener">Krisinformation ↗</a></article>`).join('') : '<p>Inga lokalt matchande VMA eller krisnotiser i källans svar.</p>';
  const trafficHtml = traffic.length ? traffic.map(item => `<article class="nearby-card"><strong>${esc(item.title)}</strong><p>${esc(item.description || item.location || '')}</p><small>${item.modifiedAt ? `Uppdaterad ${esc(formatSwedishTime(Date.parse(item.modifiedAt)))}` : 'Trafikverkets rapport'}</small></article>`).join('') : '<p>Inga matchande trafikstörningar med tillgänglig geometri.</p>';
  const stationsHtml = state.policeStations.length ? state.policeStations.map(station => `<article class="nearby-card"><strong>${esc(station.name)}</strong><p>${esc(station.address)} · ${station.distance < 1000 ? `${Math.round(station.distance)} m` : `${(station.distance / 1000).toFixed(1)} km`} från vald plats</p><details><summary>Tjänster och öppettider</summary><p>${(station.services || []).map(service => esc(service)).join(' · ')}</p><button class="btn-subtle station-hours" data-station="${esc(station.id)}">Hämta öppettider</button><div class="station-hours-result" id="station-hours-${esc(station.id)}"></div></details><a href="https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}" target="_blank" rel="noopener">Vägbeskrivning ↗</a> · <a href="${esc(station.url)}" target="_blank" rel="noopener">Polisens stationssida ↗</a></article>`).join('') : '<p>Polisens stationsregister kunde inte hämtas.</p>';
  const sheltersHtml = shelters.length ? shelters.map(shelter => `<article class="nearby-card"><strong>Skyddsrum ${esc(shelter.code || shelter.id)}</strong><p>${shelter.distanceMeters < 1000 ? `${shelter.distanceMeters} m` : `${(shelter.distanceMeters / 1000).toFixed(1)} km`} från vald plats${shelter.capacity ? ` · registrerad kapacitet ${shelter.capacity} personer` : ''}</p><a href="https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lon}" target="_blank" rel="noopener">Vägbeskrivning ↗</a></article>`).join('') : sheltersData.status === 'unavailable' ? `<p>${esc(sheltersData.error || 'Skyddsrumsregistret svarar inte just nu.')}</p>` : '<p>Inga registrerade skyddsrum hittades inom 2 km.</p>';
  const shelterNote = sheltersData.incomplete ? ' Resultatet kan vara begränsat av datakällan.' : '';
  const sourceWarningsFinal = [...new Set(sourceWarnings)];
  $('#nearby-overview').innerHTML = `<p class="nearby-updated">Källkontroll ${formatSwedishTime(Date.now())}${sourceWarningsFinal.length ? ` · ${esc(sourceWarningsFinal.join(' · '))}` : ''}</p><section><h2>Polisnotiser i närheten</h2>${eventCards}<p class="nearby-precision">Notiserna kan vara fördröjda. Polisen anger berörd kommun eller län, inte alltid exakt händelseplats.</p></section><section><h2>Vädervarningar</h2>${warningsHtml}</section><section><h2>VMA och krisnotiser</h2>${crisisHtml}</section><section><h2>Trafik</h2>${trafficHtml}</section><section><h2>Närmaste polisstationer</h2>${stationsHtml}</section><section><h2>Skyddsrum nära platsen</h2>${sheltersHtml}<p class="nearby-precision">Registerplats och angiven kapacitet från MCF${shelterNote}. Uppgifterna visar inte om skyddsrummet är öppet eller tillgängligt just nu. Kontrollera alltid myndighetens information.</p></section><p class="nearby-precision">Urvalet saknar garanti om full täckning. Kontrollera alltid informationen hos ansvarig myndighet.</p>`;
  $('#nearby-overview').setAttribute('aria-busy', 'false');
  nearbyPending = false;
}

function renderNearbyMap(point, shelters) {
  nearbyLayer.clearLayers();
  L.circleMarker([point.lat, point.lon], { radius: 8, color: '#195f50', fillColor: '#38a989', fillOpacity: 1, weight: 3 })
    .bindTooltip('Vald plats', { direction: 'top' }).addTo(nearbyLayer);
  for (const shelter of shelters) {
    L.circleMarker([shelter.lat, shelter.lon], { radius: 5, color: '#315c96', fillColor: '#fff', fillOpacity: 1, weight: 2 })
      .bindPopup(`<strong>Skyddsrum ${esc(shelter.code || shelter.id)}</strong><br>${shelter.distanceMeters} m från vald plats${shelter.capacity ? `<br>Registrerad kapacitet: ${shelter.capacity}` : ''}<br><a href="${esc(shelter.source)}" target="_blank" rel="noopener">Öppna MCF:s register ↗</a>`)
      .addTo(nearbyLayer);
  }
}

async function loadStationHours(event) {
  const button = event.target.closest('.station-hours');
  if (!button) return;
  const container = document.getElementById(`station-hours-${button.dataset.station}`);
  button.disabled = true; button.textContent = 'Hämtar…';
  try {
    const response = await fetch(`/api/police-stations/${encodeURIComponent(button.dataset.station)}`), data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Kunde inte hämta öppettider');
    container.innerHTML = data.services.map(service => `<p><strong>${esc(service.name)}</strong><br>${service.openingHours.map(day => `${esc(day.name)} ${day.isClosed ? 'stängt' : `${esc(day.from?.slice(11, 16) || '')}–${esc(day.to?.slice(11, 16) || '')}`}`).join('<br>')}</p>`).join('');
    button.hidden = true;
  } catch (error) { container.textContent = error.message; button.disabled = false; button.textContent = 'Försök igen'; }
}
