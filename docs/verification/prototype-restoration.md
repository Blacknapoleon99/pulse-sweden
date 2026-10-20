# Exact prototype restoration — 30 September 2026

The user's latest visual reference is [codex/expo-go-sdk57-prototype](https://github.com/Blacknapoleon99/pulse-sweden/tree/codex/expo-go-sdk57-prototype). A successful Git fetch resolved it to `8487a429d44b14e6d7e45a7e056747817431879c`. The restoration uses that commit's actual mobile source. This supersedes the sketch-led Home and Family layouts and the earlier palette-only correction.

## Restored user interface

- Home has the original header/avatar, title/location, Snabböversikt, three nearby event cards, Chattar and Dina sidor in their original order. News and community highlights follow those original sections.
- The original five-tab glass bar is restored: Hem, Karta, Händelser, Rutt, Profil. Its labels, icons, spacing, radii, colors and shadow come from the reference.
- Map and route use the original floating glass header and lower panels. Original police pins and area colors are restored. Added community controls use the same chips; the legend opens on request and matches the current map colors.
- Events again shows its map background, glass header and bounded lower notice list. The list keeps virtualization, filters, last successful source data and the new-updates control.
- News uses the original dashboard header, Hem link, title/intro and BulletinCards. The list keeps staged arrivals and source freshness, with article details and original-source links.
- Family uses the original FamilyScreen. Its shared polling, session updates, BankID availability and account changes remain. Profile still begins with saved places; added functions follow the original content.
- New account/report/detail/policy screens use the reference dashboard chrome. Reporting, discussions, private photo review, blocking, moderation, eligibility and the permanent unverified label remain implemented. Alarms, place history and extended route exploration remain accessible under Profil → Fler funktioner.

The main tabs are retained by React Navigation. Route form values and map region/layers live in shared state. Returning to a core tab clears intervening detail back history without replacing the retained tab state. Refreshes do not animate the map camera. Large-text-only row overrides preserve the reference defaults.

## Verification

A local comparison against the fetched commit passed six source checks:

1. The complete original App map/chrome style definition matches PrototypeMapStyles after extraction.
2. The complete original Dashboard style definition matches PrototypeDashboardStyles after extraction.
3. The FamilyScreen style definition matches the reference.
4. The StatsScreen style definition matches the reference.
5. Home's JSX from its eyebrow through the original fine print matches after whitespace normalization and allowing the explicit large-text-only row overrides.
6. The five tab IDs, labels and icons match the reference.

These comparisons establish the source used for the restoration. They do not establish pixel matching on an installed phone.

| Local check | Result |
|---|---|
| Mobile TypeScript | Passed |
| iOS and Android JavaScript bundle export | Passed |
| Expo dependency compatibility | Up to date |
| Expo Doctor | 21/21 passed |
| Mobile dependency audit | 0 reported vulnerabilities |
| Navigation router tests | 2 passed: retained tab keys/filters and correct detail-to-main back history |
| Backend tests | 112 passed; 2 real PostgreSQL scenarios skipped without a dedicated server |
| Mobile state / feed store tests | 12 / 4 passed |
| Backend/web/configuration syntax | 41 modules passed |
| Tracked diff whitespace | Passed |

The navigation tests caught a default navigate action clearing category parameters; core tab selection now merges existing parameters. They also exercise returning from a report/account stack to the retained main navigator. CI includes these tests in the mobile job.

No backend functionality was reverted as part of the visual restoration. No deployment, database cutover, paid provisioning, store submission or public launch was performed. Live provider delivery, PostgreSQL concurrency/restore, and owner release prerequisites remain in the [release guide](../mobile-release.md).

## Installed-device verification still required

Compare the reference and updated builds using the same phone, font scale and synthetic feed/account data. Check Home at the initial viewport and after scrolling, all five tabs, map camera retention, source lists, Family/Profile/Statistics, keyboard/safe areas and new report/account details. Repeat at a narrow width and large text, with reduced motion and VoiceOver/TalkBack. Confirm two-device reporting, photo review, comments, blocking, moderation and expiry as recorded in the release guide.

This environment has no connected iPhone/Android device or running native emulator, so installed rendering and gestures have not been certified. Browser verification images in the earlier records demonstrate web behavior only.

For an Expo Go preview, restart Metro from `C:\TryggPulse\mobile` with `npx expo start --clear`, then reload or rescan that server's QR code. An older installed preview/production binary requires a new build or its configured update channel.
