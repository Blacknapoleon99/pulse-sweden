# Appearance correction — 30 September 2026

> Mobile layout superseded by the user-requested [exact prototype restoration](prototype-restoration.md). The web checks below remain historical evidence.

The supplied sketches define the screen layout and functions. They do not replace TryggPuls's existing design.

The most recent checked-in Expo dashboard (`8487a42`) is the mobile visual reference: blue/navy, white rounded cards, pastel icon backgrounds, compact typography, and the original full-map glass panels. Home keeps the requested four-shortcut/map/three-category/four-news hierarchy. Account, news, report and discussion screens now share the earlier card, field, button and typography treatment. Family, place history and journey retain their sketch order with smaller pastel header icons and the earlier title sizing. Minimum touch targets and large-text wrapping remain enabled.

The community website now loads the original `style.css` instead of defining a separate blue theme. Its logo, typography, palettes and surfaces follow the main app's existing `tryggpuls_theme` and `tryggpuls_surface` preferences. Community labels remain purple and explicitly unverified in every appearance. A dark-glass contrast correction applies only to the community pages.

## Verification

- Mobile TypeScript passed.
- iOS and Android bundle exports passed (1,472 and 1,477 modules respectively).
- JavaScript syntax passed for 41 modules, including the new appearance script.
- The targeted HTTP community test passed, covering sessions, CSRF, staff roles, ownership, public privacy and private media.
- Browser checks on an isolated server with synthetic data verified standard light, standard dark, light glass and dark glass. Theme changes made through the original main-app controls persist when navigating to community pages.
- Community and account pages had no horizontal overflow at the checked 390 px and 320 px widths. Account buttons retained a 44 px minimum height; hidden controls remained hidden.

The preview's light/standard preferences were restored, the viewport override cleared, the tab closed, and the isolated server stopped. No deployment or live-account change was made. Native bundle exports do not verify installed rendering; comparing these screens on iPhone and Android remains required.

These images show the web appearance with synthetic content, not installed Expo screens:

| Standard light | Light glass | Dark glass |
|---|---|---|
| [Preview](community-style-light.png) | [Preview](community-style-light-glass.png) | [Preview](community-style-dark-glass.png) |

See [the release guide](../mobile-release.md) for the remaining launch checks.
