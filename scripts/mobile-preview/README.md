# Shared mobile component preview

Run `node scripts/mobile-preview/serve.mjs` from the repository root. The local server opens on http://localhost:4311.

The harness renders the actual mobile Dashboard, Statistics, PlaceHistory, FamilyScreen, shared header, typography and bottom tabs using React Native Web. Select Centralstationen in the third device to show its detail view.

The only substitutes are native APIs, navigation, map rendering, and isolated sample data in fixtures.ts. The native app never imports this directory. The preview is not a screenshot of Expo Go and does not validate native map rendering or device permissions. Its OpenStreetMap adapter includes attribution; the phone uses its native map provider.

The development tooling is installed outside the project in `%LOCALAPPDATA%/TryggPulse/tools/mobile-preview/node_modules` (react-native-web 0.21.2, react 19.2.3, react-dom 19.2.3). The bundler is reused from opening/node_modules. No web dependencies are added to the mobile runtime.

The four-screen capture is saved at tmp/mobile-reference-preview.png. Visual fixture data is visibly labelled and is excluded from the native app bundle by construction.
