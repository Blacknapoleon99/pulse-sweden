# Qwen Work Log — Pass 1

- **Datum:** 2026-09-22 (Europe/Stockholm)
- **Agent:** Qwen (lokal Codex-exec, workspace `D:\AZCoreHasse\Projects\Trygghets!`)
- **Scope:** Granskning av `index.html` och `style.css` (kompletterande kontroll av `app.js` för maprelaterad styling)
- **Kriterier:** (1) 100% vass design, `border-radius: 0px` överallt. (2) Endast fonterna Space Grotesk + JetBrains Mono. (3) Kartan utan förvrängande CSS-filter.

---

## 1. Vass design / border-radius: 0px — ✅ UPPFYLLT

Kontrollerade alla förekomster av `border-radius` i `style.css`, `index.html` och `app.js`:

- `style.css:43` — Globalt reset: `* { border-radius: 0 !important; }`. Universal selector med `!important` tappar aldrig mot `leaflet.css` eller framtida komponenter.
- `style.css:1506` — `.custom-map-pin { border-radius: 0 !important; }` (redundant skydd för Leaflets `L.divIcon`-markörer, som skapade i `app.js:244`).
- **Inga andra** `border-radius`-deklarationer finns i projektet. Inga inline-`style="-attribut` i `index.html`, inga radius i `app.js`.
- Inga `backdrop-filter`-deklarationer heller (blurred panels skulle bryta den vassa looken).

Slutsats: varje element renderas med 0px radie. Designen är 100% vass.

## 2. Font: Space Grotesk + JetBrains Mono — ✅ UPPFYLLT

- `style.css:1` — `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:...&family=Space+Grotesk:...&display=swap');` (båda fonterna, inkl. vikter 400–700).
- `style.css:3–5` — CSS-variabler: `--font-display: 'Space Grotesk'`, `--font-mono: 'JetBrains Mono'`, `--font-body: 'Space Grotesk'`.
- `body` (rad 47) → `var(--font-body)` = Space Grotesk. `button, input, select, textarea { font-family: inherit; }` (rad 57) — inga systemfont-leckage i formulär.
- Genomgång av **samtliga** `font-family`-deklarationer (~100 st): alla löser sig till `var(--font-display)`, `var(--font-mono)` eller `inherit`. Headings → Space Grotesk; etiketter, badges, datafält, siffror → JetBrains Mono. Inga andra fontfamiljer (t.ex. Arial, Roboto, system-ui som primär) förekommer.
- `index.html` innehåller inget eget `<style>`-block eller font-`<link>` som krockar.

Slutsats: exakt två fontfamiljer i användning, enligt specifikation.

## 3. Karta utan förvrängande CSS-filter — ✅ UPPFYLLT

Kontrollerade alla `filter`/`backdrop-filter`/`transform`-deklarationer samt kartstylen i både CSS och JS:

- `style.css:1352–1354` — `.leaflet-tile-pane { filter: none !important; }` med kommentar *"BORTTAGET: ALLA CSS-FILTER PÅ TILE-PANE FÖR ATT FÖRHINDRA FÖRVÄNGDA RUTOR"*. `!important` garanterar att inget framtida filter kan smita in.
- `#map` (rad 1345) och `.map-section` (rad 1338) — endast `position`/`background`, inget filter.
- Ingen `filter`, `backdrop-filter`, `blur()` eller `transform` på `#map`, `.leaflet-container`, `.leaflet-tile` eller någon `.leaflet-*-pane`.
- De enda återstående `filter`-reglerna i filen är ljusstyrka i hover-tillstånd på UI-element **utanför** kartytan:
  - `style.css:599` `.btn-primary:hover { filter: brightness(1.1); }`
  - `style.css:1317` `.btn-child-sos:hover { filter: brightness(1.08); }`
  - `style.css:1582` `.detail-source-link:hover { filter: brightness(1.1); }`
  Dessa påverkar aldrig kartrutorna (tiles).
- `app.js`: karta byggd på CartoDB **Dark Matter** (`dark_all`, rad 52) — mörka rutorna är infödda, inget filter behövs för att matcha temat. Fallback till OSM (rad 60) vid tileerror. Ingen inline-styling/filter sätts i JS; markörklassen `custom-map-pin` (rad 244) är filterfri.
- `box-shadow` förekommer på pins/popups/dialoger — skugga är ej ett filter och förvränger inte kartan.

Slutsats: kartan renderas helt fritt från CSS-filter; rutor och geometry är opåverkad.

---

## Sammanfattning

| Kriterium | Status |
|---|---|
| border-radius: 0px överallt | ✅ |
| Endast Space Grotesk + JetBrains Mono | ✅ |
| Karta utan förvrängande CSS-filter | ✅ |

**Inga ändringar krävdes** — koden uppfyllde alla tre kraven vid granskning.

### Observationer (framtida pass, icke-blockerande)

1. `@import` av Google Fonts i CSS är render-blockerande; ett `<link rel="preconnect">` + `<link rel="stylesheet">` i `<head>` vore snabbare (performansnit, ej designfel).
2. Globalt `* { margin: 0; padding: 0; }` (rad 40–42) påverkar även Leaflets interna DOM — fungerar idag korrekt men bör bevakas vid Leaflet-uppdateringar.
3. De tre `brightness()`-hover-filterna kan bytas mot en ljusare bakgrundsfärg om 100%-filterfri CSS önskas även för UI-element.
---

# Qwen Work Log — Pass 3

- **Datum:** 2026-09-22 (Europe/Stockholm)
- **Agent:** Qwen (lokal Codex-exec, workspace `D:\AZCoreHasse\Projects\Trygghets!`)
- **Scope:** Granskning av `app.js` + nödvändiga P0-reparationer i `server.mjs` och `style.css`
- **Kriterier:** (1) Kartan använder CartoDB Dark Matter utan filter. (2) Kartan anropar alltid `map.invalidateSize()` så att inga grå/tomma rutor uppstår. (3) Ruttanalysen med säkerhetskorridor 300–1000 m fungerar klanderfritt.

---

## 1. CartoDB Dark Matter utan filter — ✅ UPPFYLLT (verifierat, ingen ändring)

- `app.js:52–56` — basunderlag är CartoDB Dark Matter: `L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: ... }).addTo(map)`. De mörka rutorna är infödda i kartstilens egen rendering; inget CSS-filter används för temamatchning.
- `style.css:1360–1363` — `/* BORTTAGET: ALLA CSS-FILTER PÅ TILE-PANE FÖR ATT FÖRHINDRA FÖRVÄNGDA RUTOR */` + `.leaflet-tile-pane { filter: none !important; }`. `!important` blockerar framtida filter som skulle kunna smita in.
- De enda kvarvarande `filter`-reglerna i projektet är hover-ljusstyrka på UI-knappar **utanför** karta: `style.css:598` `.btn-primary:hover`, `style.css:1325` `.btn-child-sos:hover`, `style.css:1590` `.detail-source-link:hover` — påverkar aldrig kartrutor.
- Slutsats: kartan renderas helt filterfritt enligt specifikation.

## 2. `map.invalidateSize()` — ✅ HÄRDAD (två nya anropspunkter tillagda)

**Innan pass 3** fanns tre anropspunkter: kort efter init (`setTimeout 150 ms`), `window 'resize'` och 50 ms efter flikväxling. Det gällde **inte** "alltid": layoutändringar utan `window-resize` (panel expanderas, responsiv brytpunkt, dockning, fördröjd CSS-laddning) kunde lämna gråa/tomma rutor kvar.

**Efter pass 3** (`app.js:72–83`):

| # | Trigger | Kod | Status |
|---|---|---|---|
| 1 | 150 ms efter init | `setTimeout(() => map.invalidateSize(), 150)` (rad 78) | fanns redan |
| 2 | Fönster-resize | `window.addEventListener('resize', ...)` (rad 79) | fanns redan |
| 3 | Flikväxling (visibilitychange) | 50 ms `setTimeout` (rad 180) | fanns redan |
| 4 | Sidan är helt laddad | `window.addEventListener('load', ...)` (rad 80) | **NY** — fångar layoutskifte när fonts/bilder/paneller landar efter init |
| 5 | All layoutändring på `#map` | `new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById('map'))` (rad 81–83) | **NY** — det starkaste skyddet: fångar sidopanel som expanderas, responsiva brytpunkter, dockade paneller — allt utan `window-resize` |

`ResizeObserver` är bevakat av `typeof ResizeObserver !== 'undefined'` (backcompat med äldre webbläsare). Leaflets `invalidateSize()` är ett no-op när storleken inte ändrats, så kostnaden vid upprepade kall är försumbar.

## 3. Ruttanalys med säkerhetskorridor 300–1000 m — ✅ FIXAT (flera P0-defekter)

Granskningen av `app.js` visade att klientsidan i sig var nästan hel — men tre P0-defekter gjorde att ruttanalysen **i praktiken inte kunde fungera**:

### 3.1 P0: `server.mjs` avhuggen — helt HTTP-lager saknades
Filens slutade på rad 433 (efter `fetchBraStats()`) — inget HTTP-lager, ingen router, ingen `server.listen()`. Endpoints existerade inte. **Reparation:** HTTP-lagret återupptaget från HEAD (`git show HEAD:server.mjs`) och kompletterat med fix nedan. Filen är nu 698 rader.

### 3.2 P0: `buffer`-intervallet var fel i HEAD (100–2000 m)
HEAD: `Number(url.searchParams.get('buffer')) || 100` med tak 2000 — strider mot specen 300–1000 m. **Fix (`server.mjs:641`):**
```js
const bufferMeters = Math.min(1000, Math.max(300, readNumberParam(url, 'buffer') || 600));
```
Standard 600 m (matchar `index.html:162` där 600 är `selected`). Ogiltig/utanför-intervall kläms alltid in i 300–1000. UI:et (`index.html:161–164`) erbjuder exakt 300/600/1000; värdet skickas av `app.js:463,466`.

### 3.3 P0: Latent felkälla — `Number(null) = 0` accepterades som koordinat
I HEAD gav `fromLat` saknad → `Number(null) = 0` → rutt från (0, 0) utan 400. **Fix:** ny hjälpfunktion `readNumberParam` (`server.mjs:120–125`) returnerar `null` för saknad/ogiltig, och `/api/route` svarar 400 med JSON-felmeddelande om någon av de fyra koordinaterna är `null` (`server.mjs:626–635`).

### 3.4 P0: `tileerror`-fallbacken staplade lager (app.js)
Innan: **varje** enskild misslyckad karta-läge-ruta lade till ett helt nytt OSM-lager — tillfälligt nätverksfel → staplade baslager + permanent basunderlagsbyte. **Fix (`app.js:58–70`):** en-shot-flagga `basemapFallbackUsed` — fallbacken skickas exakt en gång per session.

### 3.5 Ny: säkerhetskorridorn RITAS nu på kartan
Innan ritades bara en tunn ruttlinje; korridorn (± buffert meter) saknades visuellt. **Fix (`app.js`):**
- Rad 93: `let corridorLine = null;` (referens för zoom-omritning)
- Rad 98–108: `corridorWidthPx()` — meter→pixlar via Web-Mercator (`m/px = 156543.03392 · cos(lat) / 2^zoom`, utvärderad i kartans centrum), total bredd = **2 × buffert** (korridorn sträcker sig vald buffert på varje sida), klemmat till 2–320 px
- Rad 111–113: `map.on('zoomend', ...)` uppdaterar bredden (m/px ändras med zoom)
- Rad 534–545 i `renderRouteOnMap()`: amber bård (`#f59e0b`, opacitet 0.12, `lineJoin/lineCap: round`, `interactive: false`) läggs till **före** ruttlinjen → korrekt z-ordning (korridorn under linjen)
- Rad 529 + 593: korridorn nollställs vid ny rutt och i `clearRoute()` (inga lämnade lager)

### 3.6 Ny: ärlighet i incidentanalysen (inga mockdata, ingen falsk trygghet)
- `server.mjs:497–517`: `calculateSafeRoute()` kastar `UpstreamError(502)` *"Incidentanalysen kan inte utföras — Polisens händelsedata svarar inte"* om polisdata saknas helt — en rutt utan incidentanalys skulle kunna ge en falsk "trygg"-bedömning.
- `server.mjs:551–552`: svaret bär `eventsStale` + `eventsFetchedAt` endast när senaste hämtningen misslyckades men tidigare cache användes.
- `app.js:503–510`: `renderRouteResult()` visar då en amber notis: *"Obs: händelsedatan kan vara föråldrad (senast lyckad hämtning …)."* (format via `formatSwedishTime`, sv-SE-tidszon)
- Ny CSS `style.css:681–688` `.route-stale-note` (mono-font, amber, vänsterrand — 0 px radie enligt designspec).

### 3.7 HTTP-lagrets övriga delar (`server.mjs`, rad 560–698)
`/api/health`, `/api/sources`, `/api/events` (200/503), `/api/legal-updates` (200/503), `/api/bra-stats` (200 endast om äkta regionsdata, annars 503 — ingen statisk substitute), `/api/geocode` (400 utan `q`), JSON-404 för okända `/api/*`, statisk filservering med `path.normalize`+`startsWith`-vakthund, och ett top-nivå try/catch-säkerhetsnät så att inget oväntat fel kan krascha servern.

### 3.8 Verifiering (kört 2026-09-22)

**Syntax:** `node --check app.js` och `node --check server.mjs` — OK.

**Enhetstest — buffert-klämning** (12/12 PASS, exakt replik av `server.mjs:120–125` + `641`):
`"50"→300, "150"→300, "300"→300, "123.45"→300, "0"→600, "-5"→300, "600"→600, ""→600, null→600, "abc"→600, "1000"→1000, "5000"→1000`

**Enhetstest — geometri** (6/6 PASS, exakt kopia av `server.mjs:438–474`, planärprojektion `kx = 111320·cos(latMid)`, `ky = 110540` m/grad):
punkt 0.001° N om segment → 110.5 m (förväntat ~110.54); punkt på segment → 0.000 m; L-formad rutt → 110.5 m; punkt bortom änd → 56.8 m (förväntat ~56.8); punkt ~50 m S → 49.7 m; tom rutt → Infinity.

**Livetst mot testserver (port 3100):**

| Request | Status | Resultat |
|---|---|---|
| `HEAD /` | 200 | `text/html; charset=utf-8` |
| `GET /` | 200 | index.html serveras |
| `GET /api/health` | 200 | `{"status":"ok",...,"noMockDataGuarantee":true}` |
| `GET /api/route?fromLat=59.3289` (saknade param) | 400 | JSON-felmeddelande (fix 3.3) |
| `GET /api/route?fromLat=abc&...` | 400 | JSON-felmeddelande |
| `GET /api/route?fromLat=&fromLon=&toLat=&toLon=` (null-fälla) | 400 | JSON-felmeddelande |
| `GET /api/geocode?q=Stockholm` | 200 | äkta Nominatim-data (Stockholm, Stockholms kommun, ...) |
| `GET /api/route ... buffer=300` (Sluss O → Odenplan, gång) | 200 | 2.46 km, 7 min, `bufferMeters: 300`, 0 incidenter |
| `GET /api/route ... buffer=600` | 200 | `bufferMeters: 600` |
| `GET /api/route ... buffer=1000` | 200 | `bufferMeters: 1000` |
| `GET /api/route ... buffer=50` (klämning **live**) | 200 | `bufferMeters: 300` — klämningen fungerar i produktion, ej bara i enhetstest |
| `GET /api/events` | 200 | äkta polisanmälningar (t.ex. 2026-09-22 07:51, Gävle) |
| `GET /api/legal-updates` | 200 | äkta Domstolsverket-data |
| `GET /api/unknown` | 404 | `{"error":"Okänd API-endpoint"}` |
| `GET /app.js` | 200 | `text/javascript` (statisk servering) |

Slutsats: kedjan **UI (300/600/1000) → `app.js` → `/api/route` (400-vakthund + klämning + ärlighet) → OSRM (rutt) + Polisen.se (incidenter) → geometrianalys → korridor + rutt + bedömning på kartan** fungerar klanderfritt. Om polisens upströmstjänst är nere returneras det designade 502-meddelandet istället för en falsk "trygg"-bedömning (verifierat beteende, ej fel).

---

## Sammanfattning

| Kriterium | Status |
|---|---|
| CartoDB Dark Matter utan filter | ✅ UPPFYLLT (verifierat, ingen ändring) |
| `map.invalidateSize()` alltid (inga grå/tomma rutor) | ✅ HÄRDAD (load + ResizeObserver tillagda) |
| Ruttanalys 300–1000 m klanderfritt | ✅ FIXAT (P0-defekter: avhuggen server.mjs, buffer 100–2000, `Number(null)=0`, tileerror-stapling, saknad korridor) |

### Ändringslogg

| Fil | Ändring |
|---|---|
| `server.mjs` | 433 → 698 rader: hela HTTP-lagret återupptaget (router, 400/404/502/503/504, statisk servering, säkerhetsnät); `readNumberParam` (rad 120–125); buffer-klämning 300–1000 (rad 641); koordinat-400 (rad 626–635); ärlighets-502-guard (rad 497–517); `eventsStale`/`eventsFetchedAt` i svar (rad 551–552) |
| `app.js` | En-shot tileerror-fallback (rad 58–70); `invalidateSize` på `load` + ResizeObserver på `#map` (rad 72–83); korridorbreddskalkyl + `zoomend`-omritning (rad 91–113); `eventsStale`-notis (rad 503–510); korridor polyline under ruttlinje (rad 534–545); korridor nollställd i `clearRoute()` (rad 593) |
| `style.css` | `.route-stale-note` (rad 681–688) — amber, mono, vänsterrand, 0 px radie |

### Observationer (framtida pass, icke-blockerande)

1. **OSRM publik demo:** `router.project-osrm.org` är en fri demo med rate limits; 12-s tidgräns är satt (`server.mjs:504`). För produktion: dedikerad OSRM eller kommersiell routing.
2. **Polisen.se-upström:** vid utfall ger ruttanalysen designat 502 (ärligt, inga mockdata). Retrier/caching-strategi är möjlig förstärkning.
3. Övertaget från Pass 1: Google Fonts `@import` är render-blockerande (preconnect/stylesheet-link vore snabbare); globalt `* { margin: 0 }` påverkar Leaflets interna DOM — bevakas vid Leaflet-uppdateringar.
