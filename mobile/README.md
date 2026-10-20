# TryggPuls · Cajklops – mobile app

The Cajklops eye animation is the app's startup screen in Expo Go and native
builds. The full video plays from the beginning on every launch, and the dashboard
appears after playback ends. Videos are local assets
played by `expo-video`, which is included in Expo Go. Skip and reduced-motion
settings are supported. The animation lives in `../opening/`; see
`../opening/README.md` to preview or rebuild it.
The startup video is cached on the phone before playback begins. Playback waits
for the splash to hide and the first video frame to render, then starts at zero.
Loading guards stop once the first frame renders, so they cannot shorten playback.
Slow accessibility reads no longer silently bypass it. Home and shared headers use a separate five-second animated
soft 3D cartoon eye beside TryggPuls and the smaller Cajklops signature; inactive/background screens
and Reduce Motion use the matching static poster.

Expo Go controls its own initial bundle-download screen and displays the
Cajklops app icon there. The animated opening starts when JavaScript mounts.
Reload the project after updating these assets. A new native build is needed
only to apply native name, icon, splash configuration, or plugin changes outside
Expo Go. `npm start` targets Expo Go through the port 8081 tunnel; use
`npm run start:lan` for a phone on the same Wi-Fi or `npm run start:dev-client`
for a custom development client. The local tunnel helper preserves ngrok's
startup error details so its normal agent-readiness retries work on Windows.

Expo SDK **57** (`expo@57.0.29`) and React Native 0.86.3, using the shared Node/PostgreSQL backend. The reference-image redesign uses **Hem, Karta, Statistik, Platser, Profil** in a retained white bottom bar. Home has destination search, family avatars, alarm entry, map, nearby police notices and news. Family, events, routes, accounts, reports and policy pages remain available with matching headers and surfaces. [Redesign and checks](../docs/mobile-reference-redesign.md), [release setup](../docs/mobile-release.md) and [Oracle deployment](../docs/oracle-deployment.md) describe the current status.

## Run on a phone

Background sharing is an explicit opt-in in Family and requires an installed native build. Expo Go continues to use foreground location only. The `pilot` EAS profile builds an internal Android APK; iPhone installed background testing is deferred. See [pilot setup, migration and device checks](../docs/free-pilot.md). Production migration and physical-device acceptance are still pending.

1. Install a version of **Expo Go that supports SDK 57** from [Expo's SDK 57 download page](https://expo.dev/go?platform=android&sdkVersion=57). If you already have client 57.0.9, check that it supports SDK 57. See [Expo's version-mismatch guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) if it refuses the project.
2. From `mobile/`, run `npm ci --include=dev` and `npm start`.
3. Sign in to Expo CLI (`npx expo login`) and Expo Go with the same account if prompted, then scan the QR code. The default tunnel works across networks. For LAN mode, run `npm run start:lan` and use the same Wi-Fi on the phone and computer.

The app defaults to `https://tryggpuls.onrender.com` for public API data. To use a different backend, copy `.env.example` to `.env` and change `EXPO_PUBLIC_API_BASE_URL` to an HTTPS URL reachable from the phone. Do not use `localhost` unless the server is running on the phone itself. No service keys belong in `EXPO_PUBLIC_*` variables.

The current design is local. Events and route planning are detail screens reachable from Home, Map and Profile. Statistics separates recent police notices from BRÅ municipal annual data. Places supports saved addresses, favorites, local overview, available history and nearby service. Missing history never becomes fabricated values. The prior prototype-restoration record is historical; the active visual reference is the four-screen image supplied on 2026-10-14.

If Expo Go still displays the earlier layout or opening, restart Metro from this `mobile` directory with `npm start -- --clear`, then reload or rescan that server's QR code. The reference restoration is local; a previously installed preview/production build requires a new build or configured update.

Warning and news pages use Krisinformation, SMHI and Police feeds. The native family screen uses the server's family accounts, shared zones, opted-in positions, alerts and chat. It supports server-mediated BankID sign-in/registration when the owner has configured a BankID RP certificate; new identities create an account with the BankID name, while the raw personal number is not stored. Family members can explicitly share one position or enable live sharing while the app is in the foreground. Shared positions expire after 15 minutes. Home includes a draggable, zoomable family map refreshed by the shared five-second poll. The server stores opted-in location samples for six hours; old points are distinguished from current positions. Stop sharing, leaving the family and deleting an account erase that member's location history. The app clears private state on logout and family changes. Alarm and chat failures are reported separately from location failures. Home's event cards show the three newest police notices nationwide, refresh every 30 seconds and refresh immediately on return. The Profile page saves four geocoded places and links to a token-protected admin map-item workflow; its admin key stays in memory only. The map also shows published, source-backed admin map items with an expiry.

GPS remains foreground-only for this release. Native notifications for family alarms/replies require an EAS build, configured APNs/FCM/Expo credentials, backend enablement and recipient opt-in; Expo Go cannot validate those flows. Provider delivery is tracked separately from acknowledgement. Public reports are available without family membership after verified identity, 16+ attestation and community rules; their location is snapped before storage and their unverified status never changes. Staff posts retain their existing official-source evidence/review flow. Group and private family messages have 30-day retention. One-to-one threads are visible only to their two participants and are excluded from the group feed. The mobile client requires the server's private-chat capability before sending private messages; deploy the backend and migrations 003/004 before enabling these features. Private threads are removed when a participant leaves the family or deletes their account. Place History includes local notices, valid area assessments, family-selected safe zones, reviewed service points and practical tips; it is accessible directly from Home. Headers display TryggPulse above the Cajklops icon/name.

The family screen can save up to five AirTag names for a child's belongings on this phone and explains how to find each item in Apple's Find My app. These names stay on this phone and are not shared with other family members. The app cannot read AirTag locations or trigger TryggPuls geofence alerts from them.

## Checks

Run `npx tsc --noEmit` and `npx expo export --platform android --platform ios` from `mobile/`.
Run `npm run test:launch` for launch-preference and playback regression checks.
