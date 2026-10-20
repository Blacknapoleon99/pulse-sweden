# Gratis testdrift och frivillig bakgrundsplats

## Implementerat och verifierat lokalt

2026-10-07: server sharing-session support is live on Render at commit `d93ade01be4779af261bc64cf88964ed9d92a9ad`; health and family capabilities verified. A real encrypted production backup was restored into a local temporary PostgreSQL database and all 16 application tables matched completely. Password hashes were preserved; existing users' actual passwords were not used for a manual production login test. The temporary restore database was removed after verification. Backup archives, DPAPI-protected credentials/key and `restore-verification.json` remain outside Git under `%LOCALAPPDATA%\TryggPulse`. Temporary operator IP access has been removed. Supabase cutover and daily scheduling remain pending organisation selection and target setup.

- Foreground location remains the default. Family screen has a separate off-by-default background switch and Stop sharing button.
- Expo Go does not register a background task. An installed Android build requests foreground permission first, then background permission only after opting in. Denial preserves foreground sharing.
- Native location uses Balanced accuracy, 45-second target interval and 25-metre distance filter. Android has a persistent sharing notification. The OS determines actual delivery; force-closing the app can stop it.
- Server-issued random sharing sessions are stored hashed on the server and in SecureStore on the phone. Stop, logout and leaving a family revoke the session. Late points cannot restart a revoked session.
- Samples retain their measured timestamp. Samples older than two minutes, future samples and invalid accuracy are rejected. Offline samples are dropped rather than replayed with a new timestamp. History is limited to six hours; stale current positions are marked in the map.
- `tests/database-backup-postgres.test.mjs` proves encrypted export/restore, password login, group/private chats, family isolation, history, corruption rejection and preservation of unrelated platform tables using synthetic PostgreSQL databases.

## Database migration procedure

Supabase Free project must be in Frankfurt (`eu-central-1`). Do not introduce Supabase Auth or mobile database keys. Creation is pending confirmation of the correct organisation; the connector and local CLI currently list different organisations.

1. Obtain the Render external database URL securely outside Git and allow only the operator's temporary IP if necessary. Never enable unrestricted access. Use PostgreSQL 18 tools for the PostgreSQL 18 source.
2. Use the new Supabase session-pooler connection on port 5432, with certificate verification (`sslmode=verify-full`). Keep both URLs and a random 32-byte base64 backup key outside Git. Keep an independently secured copy of the encryption key for recovery.
3. Set `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` and `BACKUP_DIRECTORY` outside the repo. Run `node scripts/database-backup.mjs backup`. Archive is AES-256-GCM encrypted while streaming; no plaintext dump is saved.
4. Verify with `node scripts/database-backup.mjs verify <archive>`. Set `RESTORE_DATABASE_URL` to an empty temporary target and run `restore <archive>`. It refuses a target containing application tables, restores in one transaction and never restores Supabase system tables. Imported tables have RLS enabled and anonymous/authenticated Data API grants revoked; the existing server DB role must own the tables or have appropriate privileges.
5. Run `scripts/database-compare.mjs` with `SOURCE_DATABASE_URL` and `TARGET_DATABASE_URL`. It compares complete contents of recognised app tables and checks privacy. Review source inventory for any new app tables before using the explicit allowlist in `database-tables.mjs`.
6. Validate existing account login, family isolation, group chat, private conversations and six-hour history against the restored database. Synthetic tests do not replace this production verification.
7. Stop every writer briefly for final export/import. `FAMILY_WRITE_PAUSED=true` blocks family writes and family sweep; other database writers must also be paused separately. Export again, restore into an empty target, compare, then change only Render's database URL. Remove the write pause after verification.
8. Keep old Render DB and its URL for rollback during pilot. Do not delete it. Rollback after new writes requires reconciliation, not simply switching URLs.

The current Render Free database expires on 2026-10-23 according to its dashboard. Complete and verify the Supabase cutover before then; no automatic paid upgrade is authorised.

## Daily backup configuration

`scripts/run-daily-backup.ps1` reads `%LOCALAPPDATA%\TryggPulse\backup-config.dpapi`, a JSON object protected with this Windows user's DPAPI, containing `databaseUrl` and `encryptionKey`. It sets temporary process variables and invokes the encrypted backup script. The archive and `last-success.json` are outside Git in `%LOCALAPPDATA%\TryggPulse\backups`. Current protected credentials point to Render, whose external access has been closed again. Update the protected config to the new Supabase session pooler and schedule after migration. A local scheduled backup requires the computer to be awake and connected. Keep backup key recovery separate from the encrypted archives. Portable Windows PostgreSQL uses Node's bundled trusted CA roots; hostname and certificate verification stay enabled.

## Android / Expo Go acceptance

EAS project: `@kevin200/tryggpuls`. `pilot` profile creates an internal APK on the Free tier using the development environment. It is not an App Store release. Before the final APK, configure an Android-restricted Google Maps SDK key as `GOOGLE_MAPS_ANDROID_API_KEY` in EAS; never put database or service-role keys in the app. Missing map key can make the native map blank. Native configuration changes require a new APK; Expo Go keeps its own native configuration.

Latest GPS pilot build completed successfully: [EAS build 6b8a8a15](https://expo.dev/accounts/kevin200/projects/tryggpuls/builds/6b8a8a15-d9c6-4ff9-ac6a-c35d607ffe49), [Android APK](https://expo.dev/artifacts/eas/qMsRePTSnz2RDzhHze_-a9pShMtzRLmCb0yryBtoKnI.apk). This is the current GPS code, but the Google Maps key is still absent and physical-device acceptance remains pending. After configuring a map key, rebuild the APK for full native map verification. Do not use the earlier `c1a3ac2e` build; it predates the final lifecycle fixes.

On a real Android phone, log in and start ordinary sharing, then enable background sharing. Walk with a locked screen, verify captures from another family phone, disable background sharing and verify foreground still works. Test denied permission, OS permission revocation, network interruption, Stop, logout and leaving the family. Confirm no new point appears after Stop and that Android's notification goes away. Force-close behaviour and battery restrictions vary by device. Test Expo Go separately on Android and iPhone; iOS installed background verification remains deferred.

Record battery before/after a comparable one-hour walk, data usage and number of stored points. Query `SELECT pg_size_pretty(pg_database_size(current_database()));` during the pilot. Track API traffic and Supabase Free limits. No paid upgrades, Apple Developer subscription or Cloudflare migration are included.
