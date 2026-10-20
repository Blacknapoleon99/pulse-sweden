# Cajklops cartoon opening

The active mobile identity is a soft 3D cartoon eye in a rounded gold/blue triangle. `CartoonEmblem.tsx` uses procedural meshes without photographic eye or skin textures. Blink, gaze and gentle movement are driven only by Remotion frames. The opening says TryggPuls, with the smaller Cajklops signature.

Three compositions retain the existing runtime contracts: `CajklopsOpening` (201 frames, 6.7 seconds, 720 × 1280), `CajklopsEveryday` (60 frames, 2 seconds), and `CajklopsIcon` (150 frames, 5 seconds, 480 × 480). The icon loop closes its gaze/movement at both endpoints. A matching static 1024px PNG is used for the launcher; launcher icons do not animate.

## Preview

From `opening/`, run `npm run dev` and open `http://localhost:4300/CajklopsOpening` or `http://localhost:4300/CajklopsIcon`. Studio starts without opening a system browser. `npm run typecheck` verifies all compositions.

## Rebuild mobile assets

`npm run render` writes the opening, everyday clip, poster, icon loop and static app icon into `mobile/assets/`. `npm run render:icon` updates only the icon loop and its fallback. Web assets are deliberately not overwritten by these commands. Previous realistic-eye components and textures remain as legacy sources for the unchanged web identity.

The mobile launch coordinator preserves local asset caching, first-frame start, pause/resume, full-duration playback, Skip, reduced motion and loading-error guards. A new installed Android build is required to apply native launcher name/icon/splash changes. Expo Go uses the new in-app intro and animated headers after reloading Metro.
