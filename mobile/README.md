# TryggPuls – Expo Go demo

Native prototype for Expo SDK **57.0.0** using the current SDK 57 patch (`expo@57.0.24`) and React Native 0.86.3. It is kept separate from the production web server in the repository root. Expo Go client **57.0.9** is a phone app version, not a project dependency; an installed client must support SDK 57.

## Run on a phone

1. Install a version of **Expo Go that supports SDK 57** from [Expo's SDK 57 download page](https://expo.dev/go?platform=android&sdkVersion=57). If you already have client 57.0.9, check that it supports SDK 57. See [Expo's version-mismatch guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) if it refuses the project.
2. From `mobile/`, run `npm ci` and `npm start`.
3. Sign in to Expo CLI (`npx expo login`) and Expo Go with the same account if prompted, then scan the QR code. The phone and computer should use the same network. If LAN discovery fails, run `npx expo start --tunnel`.

The app defaults to `https://tryggpuls.onrender.com` for public API data. To use a different backend, copy `.env.example` to `.env` and change `EXPO_PUBLIC_API_BASE_URL` to an HTTPS URL reachable from the phone. Do not use `localhost` unless the server is running on the phone itself. No service keys belong in `EXPO_PUBLIC_*` variables.

The demo opens on a native home dashboard with a published situational overview, shortcuts to warnings, family and important news, and nearby police reports. Warning and news pages use Krisinformation, SMHI and Police feeds; the family shortcut opens the existing web account flow. The map remains a separate tab with approximate police report markers, published police area and reviewed zone outlines when available. The app also includes a nearby report list, geocoded route analysis, source status, and foreground location on request. If the reviewed-zone database is not configured, the app labels that source unavailable. The starting addresses in the route screen are editable examples; no route is calculated until requested.

The prototype does **not** track family members, run in the background, or send safety push alerts. Expo Go does not support the required background location behavior. A production native build would require consent, authentication, background permission handling, and device testing. Police reports are delayed and their map points represent approximate areas.

## Checks

Run `npx tsc --noEmit` and `npx expo export --platform android --platform ios` from `mobile/`.
