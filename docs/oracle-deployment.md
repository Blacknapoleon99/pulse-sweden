# Oracle Always Free: installations- och flyttguide

Driftfilerna finns i `infra/oracle/`. De är avsedda för en ny **Ubuntu 24.04-server i Oracle Cloud**, inte för Windows-laptopen. Ingen molnserver eller databas har skapats av denna implementation.

## Konto, gratisgränser och publik adress

Använd EU-hemregion, helst Frankfurt (`eu-frankfurt-1`) för ett nytt konto, en Always Free A1-instans med **1 OCPU/6 GB RAM** och 50 GB bootdisk. Kontrollera kontots återstående gratisutrymme innan skapande. Oracle dokumenterar för närvarande totalt 2 OCPU/12 GB och 200 GB blockvolymer; kapacitet kan saknas och inaktiva instanser kan återtas. Ingen automatisk betald uppgradering ingår. Länkar: [Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [S3-kompatibel lagring](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm).

Reservera en ledig DuckDNS-adress och peka den på serverns publika IP. Använd samma värdnamn för backend, kontolänkar och senare APK. Vid namnkonflikt väljer ägaren ett annat namn innan installation. Tillåt TCP 80/443 publikt och SSH endast från operatörens IP i OCI och i serverns brandvägg. PostgreSQL och appport 3000 binds till loopback. Installationsskriptet nollställer ingen brandvägg.

Kontoskapande, kortverifiering, vald region, SSH-åtkomst och DNS behöver tillhandahållas av ägaren. Lägg inte lösenord, SSH-nycklar eller molnnycklar i Git eller i chatten.

## Skapa och installera en release

Kör från repots rot efter godkända kontroller:

```powershell
node scripts/package-cloud-release.mjs
```

Kommandot skapar en release och SHA256 under `%LOCALAPPDATA%\TryggPulse\releases`, utanför Git. Arkivet innehåller befintliga backend/webbruntimefiler, publika tillgångar och driftfiler. Miljöfiler, databaskopior, mobilens projekt och utvecklingsmappar exkluderas. Paketet bygger från de aktuella arbetsfilerna; inget Git-push krävs. Stagingkatalogen behålls för inspektion.

Överför releasearkivet och `infra/oracle/` till den avsedda servern via SSH. Kör först på en ny server:

```sh
sudo bash install-host.sh DIN_ADRESS.duckdns.org
```

Installeraren hämtar Node 24.22.0 från Node.js med SHA256-kontroll och PostgreSQL 18/Caddy från deras officiella paketrepon. Den skapar ett eget tjänstekonto och en tom lokal databas med ett slumpat lösenord. Konfiguration finns i `/etc/tryggpuls/app.env`, root-ägd och inte publikt läsbar. API och HTTPS startas först när en release distribueras. Se [Node.js](https://nodejs.org/en/download), [PostgreSQL](https://www.postgresql.org/download/linux/ubuntu/), [Caddy](https://caddyserver.com/docs/install).

## Flytta befintlig databas före klientbytet

Projektets tidigare anteckningar anger 23 oktober 2026 som Render-databasens slutdatum. **Verifiera det i rätt Render-workspace och säkra en aktuell backup först.**

1. Återanvänd `scripts/database-backup.mjs` för krypterad export från Render. Förvara källans anslutning och den 32-byte base64-krypteringsnyckeln utanför Git. Återanvänd relevanta befintliga hemligheter (VAPID, BankID-HMAC, administratörsnycklar osv.) så att identiteter och prenumerationer bevaras.
2. Kopiera den krypterade kopian till serverns privata backupkatalog. Återställ först till en separat, tom testdatabas med `RESTORE_DATABASE_URL`. Linux använder `PGTOOLS_BIN=/usr/lib/postgresql/18/bin`.
3. Kör `scripts/database-compare.mjs` med säkert konfigurerade `SOURCE_DATABASE_URL` och `TARGET_DATABASE_URL`. Verifiera konton, familjeisolering, grupp-/privatchattar, delningssessioner och platsretention. Verktyget vägrar skriva över befintliga apptabeller.
4. Stoppa **alla** gamla skrivare inför slutexport, inklusive serverns bakgrundsjobb. Enbart familjens skrivpaus räcker inte. Återställ slutkopian till den tomma avsedda produktionsdatabasen, jämför och distribuera sedan releasen.
5. Kör `sudo bash deploy-release.sh release.tar.gz SHA256_FRÅN_PAKETERINGEN`. Skriptet kontrollerar arkivet, installerar produktionsberoenden, stoppar den gamla appprocessen, kör migrationer, byter releasesymlink och kräver `/api/ready` innan HTTPS aktiveras.
6. Testa publik HTTPS och befintlig inloggning på nya adressen före klientbytet. Ändra först därefter `EXPO_PUBLIC_API_BASE_URL` och `APP_LINK_HOST` i mobilens miljö/EAS.

Gamla Render-resurser raderas inte. Kodrollback är förberedd vid misslyckad readiness, men databasrollback efter nya skrivningar kräver avstämning och migrationskompatibilitet; byt inte blint tillbaka anslutningen. Native- och Web Push aktiveras först när befintliga nycklar och förutsättningar har verifierats.

## Daglig molnbackup och hälsa

Skapa en separat **privat** OCI Object Storage-bucket med versionering avstängd, inom kontots gratisgränser. Konfigurera en begränsad customer secret key för bucketens backup-prefix. Använd inte communityns medienycklar. Fyll `backup.env.example` och installera som `/etc/tryggpuls/backup.env` med ägare `root:tryggpuls`, rättigheter `0640`. Förvara krypteringsnyckelns återställningskopia separat från server och bucket.

Backupjobbet krypterar med befintligt AES-256-GCM-format, verifierar arkivet, laddar upp via HTTPS och kontrollerar objektstorlek och SHA256-metadata. Det roterar endast egna backupnamn efter bekräftad uppladdning. Default är högst sju kopior och 2 GiB i backup-prefixet. Kvoten gäller den dedikerade bucketen; kontrollera även kontots övriga användning. Om lagringen inte räcker minskar antalet behållna kopior. Aktivera inte godtyckliga betalresurser vid kvotproblem.

```sh
sudo systemctl start tryggpuls-backup.service
sudo systemctl status tryggpuls-backup.service
# Ladda ner en krypterad kopia och provåterställ till en separat tom testdatabas.
sudo systemctl enable --now tryggpuls-backup.timer tryggpuls-health.timer
sudo systemctl list-timers 'tryggpuls-*'
```

Daglig körning sker 02:15 UTC med upp till fem minuters förskjutning. Jobbet kommer ikapp efter serveravbrott. Hälsokontrollen kör var femte minut och larmar som misslyckad systemtjänst vid otillgängligt API, mindre än 1 GiB ledig disk eller molnbackup äldre än 36 timmar. Befintlig källövervakning körs i backend. Kontrollera `journalctl -u tryggpuls -u tryggpuls-backup -u tryggpuls-health` och sätt vid behov en extern övervakare på `/api/ready`; en lokal kontroll kan inte upptäcka att hela VM:n försvunnit.

Godkänn drift först efter VM-omstart, ny backup/provåterställning och APK-test över mobilnät med laptopen avstängd. Liveflytt, molnnycklar och det testet återstår tills rätt konto/server och kartnyckel finns.
