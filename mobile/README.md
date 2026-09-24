# TryggPuls – Expo Go demo

Native prototype for Expo SDK **57.0.0** using the current SDK 57 patch (`expo@57.0.25`) and React Native 0.86.3. It is kept separate from the production web server in the repository root. Expo Go client **57.0.9** is a phone app version, not a project dependency; an installed client must support SDK 57.

## Run on a phone

1. Install a version of **Expo Go that supports SDK 57** from [Expo's SDK 57 download page](https://expo.dev/go?platform=android&sdkVersion=57). If you already have client 57.0.9, check that it supports SDK 57. See [Expo's version-mismatch guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) if it refuses the project.
2. From `mobile/`, run `npm ci` and `npm start`.
3. Sign in to Expo CLI (`npx expo login`) and Expo Go with the same account if prompted, then scan the QR code. The phone and computer should use the same network. If LAN discovery fails, run `npx expo start --tunnel`.

The app defaults to `https://tryggpuls.onrender.com` for public API data. To use a different backend, copy `.env.example` to `.env` and change `EXPO_PUBLIC_API_BASE_URL` to an HTTPS URL reachable from the phone. Do not use `localhost` unless the server is running on the phone itself. No service keys belong in `EXPO_PUBLIC_*` variables.

The demo opens on a compact native home dashboard based on the supplied sketch. Warnings, family and important news sit at the top; three real police reports, a family-chat preview, and Profile, Family and Statistics cards follow on the same scrollable page. Warning and news pages use Krisinformation, SMHI and Police feeds. The native family screen uses the server's family accounts, shared zones, opted-in positions, alerts and chat. A family member's position is sent only on explicit request in Expo Go and expires after 15 minutes. The profile screen saves four geocoded places (home, school, work and leisure) in encrypted device storage and can send an address to route analysis. The statistics screen uses the server's BRÅ feed, nearby police notices and reviewed areas. The current BRÅ feed has only one reference year per municipality; the ten-year view links to BRÅ instead of inventing a trend. The map remains a separate tab with approximate police report markers and published zones when available.

The prototype does **not** run location sharing in the background or send native safety push alerts. Expo Go does not support the required background location behavior. A production native build would require background permission handling and device testing. Police reports are delayed and their map points represent approximate areas. Family messages are available only to authenticated members of the same family; the server keeps them for 30 days. The backend must include the native bearer-token and chat endpoints for these features to work.

The family screen can save up to five AirTag names for a child's belongings on this phone and explains how to find each item in Apple's Find My app. These names stay on this phone and are not shared with other family members. The app cannot read AirTag locations or trigger TryggPuls geofence alerts from them.

## Checks

Run `npx tsc --noEmit` and `npx expo export --platform android --platform ios` from `mobile/`.
