# Pulse — Sweden public report map

A responsive, working concept demo with real Polisen data, a Leaflet/OpenStreetMap map, shared-coordinate report groups, search, area/time/category filters, report details, original-source links and automatic refresh.

## Run

Requires Node.js 22 or later and internet access. Leaflet loads from a pinned unpkg CDN at runtime, so no package installation is required.

```powershell
npm start
```

Open http://localhost:3000. The server binds to the local computer only. Set PORT to change the port. This demo has not been deployed publicly.

## Data and behaviour

## Public API contract

- `GET /api/events` — cached public event notices from Polisen.
- `GET /api/sources` — source status and the allowed public role of each source.
- `GET /api/legal-updates` — cached, source-linked summaries from Domstolsverkets publicerade rättspraxis.
- `GET /api/health` — a simple health response for hosting checks.

The server accepts only `GET` and `HEAD`, sends basic browser security headers, does not expose upstream errors, and never receives or uses a Nusvar API key. Nusvar documents person-number lookup, residential addresses, address history and court-occurrence data; that is outside the public-map boundary and must not be added to this product. A separate private staff system would require a documented purpose, lawful basis, strict access control, audit logging, retention/deletion rules and a privacy review before any connector is considered.

## Safe publication boundary

The product must never infer or publish where suspects or convicted people live. “Hotzones” are not person or residence data. A future manual area feature should accept only a coarse polygon, a neutral label such as `official information area` or `incident activity`, an official source URL, an editor, a review date and an expiry date. It should reject home addresses, user-submitted accusations, person-to-place joins and labels such as “criminal residents”.

Court material should be a separate legal-updates layer. The linked Domstolsverket dataset is higher-instance court practice, not a general tingsrätt feed. Keep case text and PDFs out of the public map, do not geocode parties or addresses, and show only reviewed, source-linked summaries where publication rights and privacy review permit.

For incident activity, aggregate to the source precision (usually municipality/county) or a coarse grid, suppress small counts, show the time window and uncertainty, use time decay, and never turn a count into a claim about people. Official safety areas can be shown only when the authority publishes the boundary and assessment; do not recreate them from incident density.

- The local Node server proxies https://polisen.se/api/events, identifies itself as PulseSwedenDemo/1.0 and caches successful responses. Browsers check every 65 seconds. Concurrent upstream requests are coalesced and all attempts are spaced at least 65 seconds apart (under 60 per hour and 1,440 per day for a continuously running single instance).
- The server also proxies Domstolsverkets public rättspraxis endpoint for the separate `/api/legal-updates` panel. It keeps only a small, truncated list of public summaries and source URLs; it does not geocode, join or expose parties and it does not claim to cover all tingsrätt decisions.
- Upstream HTTP 404 stops further upstream requests for the server session. Failures preserve cached reports and display a delayed-feed state. A failure before the first successful response displays an empty error state. No invented reports are substituted.
- This is an automatically refreshed publication feed, not a live dispatch feed. Reports may be published hours after incidents. API coordinates are municipality/county centres, not incident locations. The feed contains a selection of activity, up to 500 reports.
- The timestamp supplied in the datetime field is used for ordering and relative time-window filtering. Original titles can contain different incident times. The detail view labels the field as the feed timestamp. All displayed times use Europe/Stockholm.
- Categories are local display groupings inferred from Swedish event types, not official severity scores. All original text remains visible. Shared coordinates are grouped without random location offsets.
- Leaflet is pinned to 1.9.4 and loaded from the unpkg CDN. OSM tiles and optional Google fonts require network access. Attribution is visible. Font fallback is available.
- Before a public launch, use a production hosting setup, a shared cache/rate limiter across instances, persistent upstream-404 state, monitoring and a tile service suitable for expected traffic. Local in-memory rate limiting resets on restart.

Sources: [Polisen API documentation](https://polisen.se/om-polisen/om-webbplatsen/oppna-data/api-over-polisens-handelser/), [Polisen API rules](https://polisen.se/om-polisen/om-webbplatsen/oppna-data/regler-for-oppna-data), [Skatteverket API statistics](https://www.skatteverket.se/omoss/varverksamhet/statistikportalen/hamtastatistikmedapi.4.262c54c219391f2e96320e6.html), [DIGG Open Data Directive](https://www.digg.se/kunskap-och-stod/eu-rattsakter/oppna-datadirektivet), [Domstolsverket rättspraxis](https://www.dataportal.se/datasets/601_3755), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
