// TryggPuls — Sveriges Digitala Trygghetsplattform
// 100% Officiella Data · Polisen, BRÅ, OSRM, Nominatim, Domstolsverket

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ==================== APP STATE ====================
const state = {
  activeTab: 'karta',
  events: [],
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
  
  // Trygg Rutt
  routeFrom: null, // { name, lat, lon }
  routeTo: null,   // { name, lat, lon }
  currentRouteData: null,

  // Familj & Geozoner (Sparade i LocalStorage med verifierade svenska platser).
  // Förkonfigurerade zoner är EXEMPEL – de är inte riktiga övervakade platser.
  // Användaren kan skapa egna zoner genom att söka riktiga adresser.
  zones: JSON.parse(localStorage.getItem('tryggpuls_zones') || 'null') || [
    { id: 'z1', name: 'Hemmet (Exempel)', address: 'Götgatan, Södermalm, Stockholm', lat: 59.3150, lon: 18.0730, radius: 500, type: 'home', demo: true },
    { id: 'z2', name: 'Skolan (Exempel)', address: 'Norra Real, Norrmalm, Stockholm', lat: 59.3450, lon: 18.0600, radius: 400, type: 'school', demo: true },
    { id: 'z3', name: 'Träningen (Exempel)', address: 'Eriksdalsbadet, Södermalm, Stockholm', lat: 59.3050, lon: 18.0750, radius: 500, type: 'sport', demo: true }
  ],

  // Företag / Arbetsplatser B2B.
  // Dessa är DEMO-exempel, inte riktiga kunddata eller faktiska arbetsplatser.
  workplaces: JSON.parse(localStorage.getItem('tryggpuls_workplaces') || 'null') || [
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

// Skarpa, infödda mörka kartrutor från CartoDB Dark Matter (inga CSS-filter som förstör plattorna)
const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  subdomains: 'abcd',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> | Polisen.se'
}).addTo(map);

// Fallback till OpenStreetMap om CartoDB skulle blockeras.
// VIKTIGT: exakt EN GÅNG. Utan flagga skulle VARJE enskild tileerror lägga
// till ett helt nytt OSM-lager ovanpå kartan -> staplade lager och en
// tillfällig network-error bytte basunderlag permanent.
let basemapFallbackUsed = false;
tileLayer.on('tileerror', () => {
  if (basemapFallbackUsed) return;
  basemapFallbackUsed = true;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
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
}

// Kartlager
const markersLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const zonesLayer = L.layerGroup().addTo(map);
const userLayer = L.layerGroup().addTo(map);

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
function setActiveTab(tabKey) {
  state.activeTab = tabKey;

  // Uppdatera nav-knappar
  $$('.nav-tab').forEach(tab => {
    const isActive = tab.dataset.tab === tabKey;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });

  // Uppdatera sidopaneler
  $$('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tabKey}`);
  });

  // Uppdatera kartans flytande rubrik
  const bannerTitles = {
    karta: { eyebrow: 'REALTIDSLÄGE', title: state.selectedRegion || 'Hela Sverige', sub: 'Visar aktuella polisanmälningar från Polisen.se' },
    rutt: { eyebrow: 'TRYGG RUTT', title: 'Ruttanalys', sub: 'Visar planerad rutt och säkerhetskorridor' },
    familj: { eyebrow: 'FAMILJ & BARN', title: 'Skyddszoner', sub: 'Visar övervakade zoner runt hem och skola' },
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
  renderIncidentFeed();
  renderMapIncidents();
}

function renderIncidentFeed() {
  const feed = $('#karta-feed');
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
    <article class="incident-card ${state.selectedEventId === e.id ? 'selected' : ''}" data-id="${e.id}">
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

  let debounceTimer = null;
  function handleInput(input, suggestionsBox, onSelect) {
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (query.length < 2) {
        suggestionsBox.hidden = true;
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (data.results && data.results.length) {
            suggestionsBox.innerHTML = data.results.map(r => `
              <div class="suggestion-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${esc(r.displayName)}">
                ${esc(r.displayName)}
              </div>
            `).join('');
            suggestionsBox.hidden = false;
          } else {
            suggestionsBox.hidden = true;
          }
        } catch {
          suggestionsBox.hidden = true;
        }
      }, 300);
    });

    suggestionsBox.addEventListener('click', e => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      const point = {
        name: item.dataset.name,
        lat: Number(item.dataset.lat),
        lon: Number(item.dataset.lon)
      };
      input.value = point.name;
      suggestionsBox.hidden = true;
      onSelect(point);
    });
  }

  handleInput(fromInput, fromSuggestions, p => { state.routeFrom = p; });
  handleInput(toInput, toSuggestions, p => { state.routeTo = p; });

  // GPS-knapp för startpunkt
  $('#btn-use-gps-start').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Din webbläsare stöder inte positionering.');
      return;
    }
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
      fromInput.value = btn.dataset.from;
      toInput.value = btn.dataset.to;
      showToast(`Hämtar koordinater för ${btn.dataset.from} → ${btn.dataset.to}...`);

      try {
        const [rFrom, rTo] = await Promise.all([
          fetch(`/api/geocode?q=${encodeURIComponent(btn.dataset.from)}`).then(r => r.json()),
          fetch(`/api/geocode?q=${encodeURIComponent(btn.dataset.to)}`).then(r => r.json())
        ]);

        if (rFrom.results?.[0] && rTo.results?.[0]) {
          state.routeFrom = { name: btn.dataset.from, lat: rFrom.results[0].lat, lon: rFrom.results[0].lon };
          state.routeTo = { name: btn.dataset.to, lat: rTo.results[0].lat, lon: rTo.results[0].lon };
          calculateRoute();
        }
      } catch {
        showToast('Kunde inte hämta testkoordinater.');
      }
    });
  });

  $('#btn-calculate-route').addEventListener('click', calculateRoute);
  $('#btn-clear-route').addEventListener('click', clearRoute);
}

async function calculateRoute() {
  if (!state.routeFrom || !state.routeTo) {
    showToast('Ange både startpunkt och destination för att beräkna rutt.');
    return;
  }

  const calcBtn = $('#btn-calculate-route');
  calcBtn.disabled = true;
  calcBtn.textContent = 'Analyserar rutt & säkerhetsläge...';

  const mode = $('#route-mode').value;
  const buffer = $('#route-buffer').value;

  try {
    const url = `/api/route?fromLat=${state.routeFrom.lat}&fromLon=${state.routeFrom.lon}&toLat=${state.routeTo.lat}&toLon=${state.routeTo.lon}&mode=${mode}&buffer=${buffer}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Kunde inte beräkna rutt');
    }

    state.currentRouteData = data;
    renderRouteResult(data);
    renderRouteOnMap();
    $('#btn-clear-route').hidden = false;
    showToast(`Rutt beräknad! ${data.distanceKm} km · ${data.durationMinutes} min.`);
  } catch (err) {
    showToast(`Fel vid ruttberäkning: ${err.message}`);
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = '🔍 Beräkna & Analysera Rutt';
  }
}

function renderRouteResult(data) {
  const card = $('#route-result');
  card.hidden = false;

  const badge = $('#route-assessment-badge');
  if (data.incidentsCount === 0) {
    badge.className = 'assessment-badge safe';
    badge.textContent = 'Inga rapporterade händelser i korridor';
  } else {
    badge.className = 'assessment-badge caution';
    badge.textContent = `${data.incidentsCount} händelse${data.incidentsCount > 1 ? 'r' : ''} nära rutten`;
  }

  $('#route-dist-label').textContent = `${data.distanceKm} km`;
  $('#route-time-label').textContent = `${data.durationMinutes} min (${data.mode === 'driving' ? 'bil' : 'gång'})`;
  $('#route-assessment-text').textContent = data.assessment;
  // Ärlig markering om polisens händelsedata var cachelagd/föråldrad vid analysen
  if (data.eventsStale) {
    const note = document.createElement('p');
    note.className = 'route-stale-note';
    note.textContent = 'Obs: händelsedatan kan vara föråldrad' +
      (data.eventsFetchedAt ? ' (senast lyckad hämtning ' + formatSwedishTime(Date.parse(data.eventsFetchedAt)) + ')' : '') + '.';
    $('#route-assessment-text').appendChild(note);
  }
  $('#route-incidents-count').textContent = data.incidentsCount;

  const list = $('#route-incidents-list');
  if (data.incidentsCount === 0) {
    list.innerHTML = `<p style="font-size: 11px; color: var(--text-dim); margin: 0;">Inga polisanmälningar inom din valda säkerhetskorridor (${data.bufferMeters}m).</p>`;
  } else {
    list.innerHTML = data.incidentsNearRoute.map(e => `
      <div class="route-incident-item">
        <strong>${esc(e.type)}: ${esc(e.name)}</strong>
        <p style="margin: 2px 0; color: var(--text-muted);">${esc(e.summary)}</p>
        <span class="route-incident-dist">⌖ Avstånd från rutt: ${e.distanceFromRouteMeters} meter</span>
      </div>
    `).join('');
  }

  // Faktisk information — denna analys är INTE en trygghetsgaranti.
  const disclaimer = document.createElement('p');
  disclaimer.className = 'route-disclaimer';
  disclaimer.textContent = 'Denna analys bygger på offentliga polisanmälningar och är endast informativ. Polisen publicerar inte varje enskild händelse, och avsaknad av händelser innebär inte att en sträcka är säker. Använd omdöme och förebyggande åtgärder.';
  $('#route-assessment-text').appendChild(disclaimer);
}

function renderRouteOnMap() {
  routeLayer.clearLayers();
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
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.8
      })
        .bindPopup(`<b>${esc(inc.type)}</b><br>${esc(inc.summary)}<br><small>${inc.distanceFromRouteMeters}m från rutt</small>`)
        .addTo(routeLayer);
    }
  }

  map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
}

function clearRoute() {
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
      <div class="zone-item" data-id="${zone.id}">
        <div class="zone-info">
          <h4>${typeIcons[zone.type] || '📍'} ${esc(zone.name)}${demoBadge}</h4>
          <p>${esc(zone.address)} (Radie: ${zone.radius}m)</p>
          <span class="zone-status-badge ${isSafe ? 'safe' : 'warning'}">
            ${isSafe ? '✓ Inga rapporterade händelser i zonen' : `⚠️ ${incidentsInZone.length} rapporterad${incidentsInZone.length > 1 ? 'e händelser' : ' händelse'} i zonen`}
          </span>
        </div>
        <div class="zone-actions">
          <button class="btn-delete-zone" data-id="${zone.id}" title="Ta bort zon">🗑️</button>
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
      localStorage.setItem('tryggpuls_zones', JSON.stringify(state.zones));
      renderFamilyZones();
      renderFamilyZonesOnMap();
      showToast('Zon borttagen.');
    });
  });
}

function renderFamilyZonesOnMap() {
  zonesLayer.clearLayers();
  if (state.activeTab !== 'familj') return;

  const points = [];
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

  if (points.length) {
    map.fitBounds(points, { padding: [60, 60], maxZoom: 14 });
  }
}

function setupFamilyZoneCreator() {
  const addressInput = $('#zone-address');
  const suggestionsBox = $('#zone-address-suggestions');
  let selectedPoint = null;

  let timer = null;
  addressInput.addEventListener('input', () => {
    clearTimeout(timer);
    const q = addressInput.value.trim();
    if (q.length < 2) {
      suggestionsBox.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.results?.length) {
          suggestionsBox.innerHTML = data.results.map(r => `
            <div class="suggestion-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${esc(r.displayName)}">
              ${esc(r.displayName)}
            </div>
          `).join('');
          suggestionsBox.hidden = false;
        } else {
          suggestionsBox.hidden = true;
        }
      } catch {
        suggestionsBox.hidden = true;
      }
    }, 300);
  });

  suggestionsBox.addEventListener('click', e => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    selectedPoint = {
      name: item.dataset.name,
      lat: Number(item.dataset.lat),
      lon: Number(item.dataset.lon)
    };
    addressInput.value = selectedPoint.name;
    suggestionsBox.hidden = true;
  });

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
    localStorage.setItem('tryggpuls_zones', JSON.stringify(state.zones));

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
      <div class="workplace-card" data-id="${wp.id}">
        <div class="workplace-card-top">
          <strong>🏢 ${esc(wp.name)}${demoBadge}</strong>
          <span class="workplace-badge ${isOk ? 'ok' : 'alert'}">
            ${isOk ? '✓ Inga rapporterade händelser' : `⚠️ ${nearby.length} rapporterad${nearby.length > 1 ? 'e händelser' : ' händelse'}`}
          </span>
        </div>
        <p>${esc(wp.address)}</p>
        <small style="color: var(--text-dim); font-size: 10px;">Säkerhetsperimeter: ${wp.radius}m</small>
      </div>
    `;
  }).join('');

  $('#corp-workplaces-count').textContent = state.workplaces.length;
  const threatsEl = $('#corp-active-threats');
  threatsEl.textContent = totalThreats;
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
    state.braData = await res.json();
    populateBraRegions();
    renderBraProfile();
  } catch (err) {
    $('#bra-stats-container').innerHTML = '<p class="error-msg">Kunde inte ladda BRÅ-statistik.</p>';
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
  if (!state.braData) return;
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
        showToast('Position hämtad — lagras endast lokalt i din enhet.');
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
    const parentPhone = prompt('Ange förälders/kontaktpersons telefonnummer att larma:', '0701234567');
    if (!parentPhone) return;

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
    $('#status-text').textContent = data.stale ? 'Fördröjt flöde' : 'Polisen Live';
    $('#status-dot').classList.toggle('stale', data.stale);
    $('#status-updated').textContent = `Synkad ${formatSwedishTime(Date.parse(data.fetchedAt))}`;

    // Fyll i länsväljare
    const regionSelect = $('#karta-region');
    const prevRegion = regionSelect.value;
    const uniqueRegions = [...new Set(state.events.map(e => e.location.name))].filter(Boolean).sort();
    
    regionSelect.innerHTML = '<option value="">Hela Sverige (Alla län)</option>' +
      uniqueRegions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    regionSelect.value = prevRegion;

    filterIncidents();
    renderFamilyZones();
    renderWorkplaces();

    if (data.stale) {
      showToast('Polisens flöde är tillfälligt fördröjt. Senaste kända händelser visas.');
    }
  } catch (err) {
    $('#status-text').textContent = 'Källfel';
    $('#status-dot').classList.add('stale');
    showToast('Kunde inte ansluta till Polisens öppna data. Försöker igen automatiskt.');
  } finally {
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
        <small>${esc(s.scope)} · Uppdateras: ${esc(s.refresh)}</small>
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
    if (data.updates?.length) {
      $('#legal-list').innerHTML = data.updates.slice(0, 10).map(item => `
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

// ==================== INITIALISERING ====================
function init() {
  // Fliknavigering
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
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
  $('#btn-refresh').addEventListener('click', refreshPoliceEvents);
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

  // Initiera underfunktioner
  setupRouteSearch();
  setupFamilyZoneCreator();
  setupSosFeatures();
  loadBraStatistics();

  // Starta hämtning av Polisen data
  refreshPoliceEvents();
  setInterval(refreshPoliceEvents, 65000);
}

// Kör init när DOM är laddad
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
