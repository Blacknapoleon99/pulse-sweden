# TryggPuls mobile release

Implementation: native stack navigation, independent feed cache, news/community highlights, public community map/feed/detail/composer, verified accounts, private sanitized photos, discussions, moderation, opt-in native delivery, web community/account/policy pages, CI and versioned migrations. The original prototype Home and five-tab navigation are restored. All community surfaces use **Obekräftad användarrapport** permanently.

## Phone layout and visual reference

The latest user instruction makes [codex/expo-go-sdk57-prototype](https://github.com/Blacknapoleon99/pulse-sweden/tree/codex/expo-go-sdk57-prototype) at commit `8487a429d44b14e6d7e45a7e056747817431879c` the exact mobile reference. This supersedes the sketch-led Home and Family layouts. The restoration uses the actual original JSX and style definitions.

The original floating glass bar has Hem, Karta, Händelser, Rutt and Profil. A retained bottom-tab navigator handles these destinations; native stack screens handle details and added functions. Returning to a core tab clears intervening detail back history while reusing tab state. Map cameras synchronize on a tab return or explicit location/route action; feed refresh preserves the camera.

The [prototype restoration record](verification/prototype-restoration.md) separates source matching and bundle/router verification from pending installed-device comparisons. The earlier [appearance check](verification/appearance-checks.md) records the superseded mobile approximation and still-valid web checks.

| Screen | Restored structure |
|---|---|
| Home | Original brand/avatar → HEM · DIN ÖVERBLICK → heading/location → Snabböversikt (Varningar, Familj, Viktiga nyheter) → three nearby event cards → Chattar → Dina sidor (Profil, Familj, Statistik) |
| Map | Full map, original floating glass header, layer chips, location button, lower status panel and glass navigation |
| Events | Map background, original glass header and lower feed panel, original thin-divided notice rows; virtualization, retained filters and staged updates |
| Route | Original map background and glass route form with FROM/TO, GPS/mode controls and analysis; form values retained between tabs |
| News | Original dashboard header, Hem link, VIKTIGA NYHETER title/intro and BulletinCards; retained feed updates and article details |
| Family / Profile / Statistics | Original FamilyScreen and existing place/statistics components and style definitions, with functional account/feed fixes retained |

News and community carousels follow the original Home sections. Both use seven-second advancement, approximately 250 ms transitions, persistent pause/play and accessibility/interaction/background/visibility pauses. Reporting is available below these highlights and on the map. Account, community reports, family alarms, place history and extended route exploration remain under Profil → Fler funktioner. New screens use the original dashboard chrome and palette. Unverified reports retain their distinct outlined markers, approximate areas and permanent label. The community web pages continue to reuse the original `style.css` palette/typefaces and saved appearance preferences.

Installed-phone comparisons at small/standard widths and large text remain part of the acceptance record below. Bundle export and TypeScript checks validate code, not native rendering.

## What is ready to verify

The [local verification record](verification/release-checks.md) lists completed checks, the synthetic browser check, and outstanding device/provider/database evidence. It does not certify a store-ready release.

- Mobile: `cd mobile`, `npm ci --include=dev`, `npm run typecheck`, `npm run test:navigation`, `npx expo install --check`, `npm run export:check`.
- Backend: `npm ci --include=dev`, `npm run check:all`, `npm test`, `npm run test:mobile`, `npm run test:feeds`, `npm run check:render`.
- Real database: set `TRYGGPULS_TEST_DATABASE_URL` to a **dedicated disposable PostgreSQL** server, then `npm run test:postgres`. The concurrency tests use unique schemas and remove only those schemas.
- Restore rehearsal: install PostgreSQL clients matching or newer than the server. `npm run test:restore` creates two uniquely named synthetic databases, dumps/restores, checks migrated records and family login compatibility, and removes those databases. The URL needs CREATEDB permission. Never supply a production URL.
- CI runs PostgreSQL concurrency and synthetic restore, mobile type/bundle checks, schema validation and dependency audits. A local passing bundle export is not an installed or signed build.

## Owner-controlled configuration

1. Approve paid resources and create a **new** Render Blueprint from `render.yaml`. It declares separate paid Frankfurt web services and PostgreSQL databases. The old Oregon configuration is recorded in `render-legacy.yaml`; keep the old resources until migration and rollback are accepted. Do not sync this file into the existing Oregon Blueprint. Set secrets independently per environment. Current branch is preserved; choose the reviewed release branch before provisioning.
2. Configure `PUBLIC_APP_URL`, actual `SUPPORT_EMAIL`, `MODERATION_EMAIL`, `OPERATIONS_EMAIL`, distinct staff credentials in `ZONE_ADMIN_TOKENS_JSON` and operator identity in final privacy/support policies. Editors draft existing staff content. Reviewers/admins moderate community content. Keep tokens out of Expo, logs and screenshots.
3. Configure a verified Resend sending domain, `EMAIL_FROM`, `RESEND_API_KEY`. Existing account login stays available; public contribution requires verified email or configured BankID plus 16+ attestation/current rule acceptance. BankID still needs its owner agreement, certificate files and hash secret; mount files separately and use the correct environment.
4. Create private S3 buckets in Stockholm (`eu-north-1`), one per environment, Block Public Access enabled. Scope IAM to `community/*` Put/Get/Delete only. Set `COMMUNITY_S3_BUCKET` and server AWS credentials. Require TLS and server-side encryption. Never enable public object ACLs, public URLs or static CDN caching. If bucket versioning is enabled, configure deletion of noncurrent versions within the approved retention period too. The cleanup queue removes unreferenced media after a one-hour upload grace period and purges report content after 30 days.
5. Configure Sentry projects/DSNs, source-map upload credentials and recipient mailboxes. Source snapshots are recorded every five minutes; sources that stay unavailable/stale for 15 minutes trigger an hourly-limited operations email. Moderation queues trigger an hourly-limited email when populated. Read `/api/ready` for database readiness, `/api/health` for process/features and `/api/sources` for source freshness. Set external uptime and backup alerts in the owner dashboards. Optional unconfigured integrations remain disabled.
6. Set the EAS development/preview/production environments using `mobile/.env.example`. Owner must choose final iOS bundle identifier, Android package, Expo project, link host, store accounts and signing identities. Map keys are app credentials and must be restricted to the Android package/signing SHA-1. Configure Google/Firebase credentials for Android push and APNs credentials for iOS in EAS; enable Expo push security, supply backend `EXPO_ACCESS_TOKEN`, then enable `NATIVE_PUSH_ENABLED`. Recipient acknowledgement is separate from provider delivery receipts.
7. Universal links require backend `IOS_APP_ID` (`TEAMID.bundle.identifier`), `ANDROID_PACKAGE` and `ANDROID_SHA256_FINGERPRINTS_JSON` matching actual signed builds. The backend serves both `/.well-known` association files. Email links use `/account#action=...&token=...`, keeping one-use tokens out of HTTP paths/logs. Validate app-installed and browser fallback flows on real phones.

## Backup, migration and rollback

Before cutover, record a restore rehearsal result and the source/target PostgreSQL versions. Enable and verify paid Render database backups and their actual retention in the dashboard. Keep a separate encrypted backup with restricted access; do not commit dumps or put them in the photo bucket. Use `pg_dump --format=custom --no-owner --no-acl` with connection credentials in a protected environment or pgpass file. Restore into a **new empty** Frankfurt database with `pg_restore --exit-on-error --no-owner --no-acl --dbname <target-name>`. Validate row counts, logins, families, aliases and moderation records, then run `npm run migrate`.

Freeze writes for the final snapshot, repeat backup/restore, and verify account/session continuity before switching the domain. Never dual-write into Oregon and Frankfurt. Keep the old deployment/database intact through the agreed rollback window. If the new release fails, disable publishing, freeze writes, back up new writes, then restore the prior deployment or reverse the domain only after reconciling post-cutover data. Migrations are additive; rollback app code without dropping community tables. Deletion requests made after a snapshot must be reapplied following any restore before reopening access.

For S3 recovery, retain a separately approved encrypted backup and test restoring approved images plus their matching database review state. A database dump alone cannot restore image objects. Verify pending/rejected photos still return 404 after recovery. Document backup retention and deletion handling in the final privacy policy.

## Store preparation

Production builds use TryggPuls branding and the existing shield/pulse icon. EAS profiles are prepared; `npx eas-cli build --profile development --platform all`, then preview, then production require owner sign-in/project/signing setup. `npx eas-cli submit --profile production` is an owner publication step. Production release configuration fails when identifiers, HTTPS API, project, map key or link host are missing. GPS is foreground-only, with no background location permission/service.

Prepare store privacy/data-safety answers from actual enabled integrations: private account name/email or BankID identity mapping; family messages/optional shared location; public report alias, approximate location, text/comments and approved photo; selected photo access; push token and diagnostics. There is no advertising or tracking integration added here. Do not claim no data collection. Complete age/content ratings, moderation contact and account-deletion URL using actual published policy pages. Confirm processor/backup retention and operator identity before submitting.

Capture **real installed app** screenshots of Home, map/layers, news detail, unverified report detail, composer preview, account/notification settings and reporting/blocking. Include iPhone and Android store sizes required by the consoles at submission time, with synthetic non-identifying content clearly labeled in the test environment. Browser screenshots and JS bundle exports are not store screenshots. Prepare two verified reviewer accounts without family membership and a private staff reviewer credential for an owner-supervised demonstration; never place credentials in this repository.

## Device acceptance record (must be completed before public rollout)

| Scenario | Required evidence | Current state |
|---|---|---|
| Two devices: create, comment/reply, block, remove, resolve, expire | Both clients update within 10 seconds; blocked/removed content disappears | Pending real builds |
| Privacy and media | Network capture exposes only grid coordinates/alias; pending/rejected images 404; approved EXIF/GPS absent | Automated API/image checks implemented; device pass pending |
| Offline, lost response, logout, duplicate retries | Correct retained draft and one server record; no private state returns after logout | Automated state/idempotency checks implemented; device pass pending |
| News/authority outage | Last successful data and age retained; empty distinguished from unavailable | Automated cache checks; device pass pending |
| Navigation, reading and map | Back preserves draft, scroll, filters, zoom/center; refresh holds position | Implemented; installed-device pass pending |
| Motion/accessibility | Seven-second highlights, pause persistence, touch/offscreen/background pause, VoiceOver/TalkBack/reduced motion, large text/small screen | Implemented; installed-device pass pending |
| Recovery/maps/links/photo permission/native push | Real iOS/Android builds; opt-in/denied permission; ticket/receipt errors; separate acknowledgement | Owner credentials/device pass pending |
| PostgreSQL concurrency and restore | CI or dedicated database log; migration replay; restore plus rollback and S3 recovery | Tests/scripts prepared; local PostgreSQL tools unavailable |
| Operations | Staff roster, moderation turnaround, support, backups and alerts tested | Owner setup pending |

Start with TestFlight and Google Play internal testing. Keep public publishing off while the above record is incomplete. Production publication requires `COMMUNITY_PUBLISHING_ENABLED=true`, `COMMUNITY_LAUNCH_APPROVED=true`, `MODERATION_STAFFED=true`, HTTPS public URL, support/moderation contacts and an actual reviewer/admin credential. These are explicit owner release flags, not automatic deployment side effects. Enable first for the supervised internal test environment, monitor queues and failure rates, then open production after owner acceptance. Disable the publishing flag immediately to stop new reports/comments while preserving reads and moderation.

References: [Apple UGC](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [Google Play UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en), [W3C carousel controls](https://www.w3.org/WAI/tutorials/carousels/animations/), [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Render regions](https://render.com/docs/regions).
