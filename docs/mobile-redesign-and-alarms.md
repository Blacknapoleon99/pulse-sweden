# Mobile redesign and family alarm handoff

> Mobile layout superseded by the user-requested [exact prototype restoration](verification/prototype-restoration.md). The functional notes below remain historical evidence.

The four sketches in the supplied scanned PDF guide the Expo Go screen order: home shortcuts → embedded map → event categories → news; route search → map → incidents/areas/service; place search → category counts → areas/service → recent notices; family shortcuts → map → chat. The school branding and drawn device border are not app UI.

## What runs where

- `mobile/App.tsx` and `mobile/src/Dashboard.tsx` provide the new navigation and screen layout. The existing full map, feed, profile, admin, and account screens remain reachable through the header or in-page links.
- Route search uses the existing geocoding and route API. A typed starting address is required unless the user explicitly selects GPS. Destination reports are within 10 km; passages along the route come from the route response. Police points are approximate, and official polygons retain source links.
- Platshistorik is a view of the *currently fetched* police feed and municipality-level Brå statistics. It cannot reconstruct older years or address-level crime history. The displayed date range is calculated from the fetched notices.
- `family.mjs` stores family alarms and recipient snapshots in PostgreSQL. `family-api.mjs` adds authenticated list, create, acknowledge, and cancel endpoints. The mobile app polls every 5 seconds when foregrounded, with failure backoff. Each alarm lasts 15 minutes and server retention is seven days.
- The sender gets a server-accepted status and a recipient acknowledgement count. This is not emergency dispatch. Dial actions for 112, 114 14, and 1177 require a tap. No exact location is collected with an alarm.

## Configuration and release

The phone calls `EXPO_PUBLIC_API_BASE_URL` or the default `https://tryggpuls.onrender.com`. The backend release must include the new alarm routes and an initialized PostgreSQL database before family alarms work on a phone. No secret is embedded in the Expo bundle. The current iteration is a local preview; production deployment is a separate release step.

Expo Go supports the foreground modal only. Background delivery needs a development build, notification credentials, device registration, and separate verification. A foreground polling connection can fail, so the dial actions remain available and sending reports an error unless the server confirms acceptance. BankID and Foundry continue to use their existing configuration gates; no family or route data is sent to Foundry.

## Verification checklist

- Compare all four screens at a small and a standard phone size, including large text, keyboard and safe areas.
- Exercise typed route search, denied GPS, bad geocode, stale/empty feeds, source links, and `[lon,lat]` polygon coordinates.
- Use two authenticated family accounts on separate foreground phones to confirm send, modal, acknowledgement, and cancellation. Repeat offline and with an expired alarm. Background Expo Go delivery is out of scope.
- Run `npm run check`, `node --test tests/family.test.mjs`, and `cd mobile; npx tsc --noEmit; npx expo export --platform android --platform ios`.
