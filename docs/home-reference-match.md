# Hem reference implementation · 2026-10-20

The mobile Hem screen follows `Trygg-Puls_1_Hem_Oversikt.png`: shield wordmark,
separate destination/filter controls, family avatars and red siren button,
full-width neighborhood map, white overlapping panel, three incident categories,
and a photo-led news row above the existing five tabs.

The map uses actual police area points, the user's allowed foreground position,
saved places and opted-in family positions. Red/amber glows pulse using native
map projection and a native-driver animation. Animation pauses while moving the
map, in the background, on an unfocused screen and with Reduce Motion. Static
native circles remain visible. Green circles identify family-selected places;
they do not represent a public safety assessment. No reference-image incidents,
addresses, family members, routes or green safety areas are fabricated.

Rån, Våldsbrott and Trafikolycka each show the newest matching fetched notice
within 35 km, from the latest seven days. A category without a matching notice
says so. Tapping a category opens its event filter. Map pins open the original
notice through their callout. Hem/Skola/Jobb appear at saved coordinates and
open destination routing through their callout. The location button recenters.

`GET /api/press-news` reads Aftonbladet and Expressen's public news RSS in
parallel, with independent five-minute caches and last-good data on failure.
It accepts only publisher article links and publisher/CDN HTTPS image URLs,
handles RSS enclosures, Media RSS and Expressen's HTML image tags, and rejects
malformed/oversized feeds. It does not scrape article pages. Headlines,
short feed summaries, source names, times, original links and feed thumbnails
flow through the mobile feed store, offline cache, Hem, the news list and detail.
Hem selects the newest available illustrated article; Visa alla includes all
articles chronologically, including those without an image. Missing/broken
images use a neutral news icon rather than an unrelated police photo.

## Run and release

The standalone service is deployed on Render in Kevin's workspace, Frankfurt,
on the explicitly approved Free plan:
`https://tryggpuls-news.onrender.com/api/press-news`.
Service ID: `srv-dbbim2eq1p3s73cojo30`. It deploys branch
`codex/press-news-hotfix`, commit `5dd1d71b1ca83a3291e88808f5beb0cd619396bd`,
using `npm ci --omit=dev --ignore-scripts` and `node news-server.mjs`.
There is no database, family API, location data or private configuration in
this service. `/api/health` reports process readiness.

The mobile news client uses `EXPO_PUBLIC_NEWS_API_BASE_URL`, defaulting to the
new service. It sends an anonymous request, without family credentials, and
allows up to 90 seconds for a free service to wake after inactivity. The main
API remains `EXPO_PUBLIC_API_BASE_URL`; the existing `tryggpuls.onrender.com`
service was not available in the connected workspace and was not modified.

The active Expo Go tunnel serves the updated client. A full Expo Reload is
needed to recreate the feed store if Fast Refresh retains the old requester.
Installed production binaries still require a build/update.

Run `node scripts/mobile-preview/serve.mjs` for a visual preview on
`http://127.0.0.1:4311`. Its Hem card fetches real publisher RSS through the same
reader; map/family/incidents are explicitly labelled development fixtures.
The preview uses React Native Web and an OpenStreetMap adapter. It is not
physical-device verification of Apple Maps/Google Maps, touch behavior,
permissions or native animation performance. Provider cartography and live
article/incident content necessarily differ from the supplied design image.

## Validation

- `npm run check`
- `npm run typecheck --prefix mobile`
- `npm run export:check --prefix mobile`
- `node --test tests/press-news.test.mjs tests/feeds.test.mjs tests/feed-store.test.ts tests/home-location.test.ts tests/incident-summary.test.ts tests/mobile-navigation.test.ts`
- `node --test tests/news-server.test.mjs tests/press-news-client.test.ts`
- Live RSS reads and successful image responses from both publishers.
- Public deployed endpoint: HTTP 200, both publishers present, and HTTP 200
  image responses; Expo tunnel bundle contains the dedicated service origin.

Phone acceptance still needs: pan/zoom then check glow alignment; Reduce Motion
and background/resume; native marker callouts; denied location; saved-place
labels; source failure; article link/image loading on both iOS and Android.
