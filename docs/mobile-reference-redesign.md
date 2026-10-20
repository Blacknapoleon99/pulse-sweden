# Mobilens referensdesign – 2026-10-15

## Karta-fliken och ytterligare referensanpassning

Karta-flikens första vy använder nu `FamilyMapScreen`: centrerat sidhuvud, Familj, Lås till plats, porträttrad, kompakt karta och tre närliggande notiser. Den vyn visas även innan användaren har gått med i en familj; medlemsuppgifter visas när de finns. Familjekarta öppnar den befintliga utökade kartan, vars tillbakaknapp återgår till översikten. Vägbeskrivningar öppnar och passar fortfarande den utökade kartan automatiskt. Familjens inställningar, delning och chatt nås via kugghjulet och länken under notiserna. Lås till plats låser kartan till den egna GPS-punkten och startar ingen platsdelning.

Porträtten är nu lokalt bundlade Fluent Emoji 3D-bilder med MIT-licens och fast källrevision. Hem har justerad sökhöjd, familjerad och karthöjd samt en ritad sirenikon. Kartnotiser har mjuka gröna/gula/röda ringar med röda notismarkörer. Statistikens staplar har nästan raka hörn och jämförelsediagrammet har kompaktare höjd och teckenförklaring. Bilder, verkliga familjemedlemmar och publicerade siffror följer fortfarande de valda platserna och källornas underlag.

## Rättelse av Hem-kartans närområde

Hem läser nu redan beviljad GPS-åtkomst vid start, återgång till appen och varje minut i förgrunden. Första platsförfrågan sker via knappen ”Visa händelser nära mig”. Nekad åtkomst har en inställningsknapp; avstängd GPS och tidsgräns visas som fel i stället för oändlig laddning. Ingen bakgrundsdelning eller familjedelning startas av detta.

Den verkliga GPS-punkten är skild från kartans mitt. Hem öppnar ett närmare kvartersutsnitt med blå positionspunkt. Händelselistan väljer de tre senaste hämtade notiserna inom 35 km och senaste sju dagarna och visar flödets senaste hämtningstid. Kartmarkörer väljs ur hela detta urval och uppdateras när man drar/zoomar. Om närmaste notis ligger utanför kartan finns en knapp som visar den tillsammans med den egna platsen. Ett äldre lokalt polisärende betyder att det inte finns en nyare publicerad notis nära vald plats; det är separat från uppdateringstiden i ”Hämtat”.

Hem/Skola/Jobb som sparats under Profil visas nu också som etiketter på Hem-kartan. Nya sparade platser behåller sina koordinater lokalt; äldre sparade adresser geokodas en gång. Familjezoner och frivilliga platser behålls. Anpassade Android-markörer får rendera klart innan deras bild fryses. Kartan centreras efter native-mapReady, inklusive zoomändringar.

Verifiering: typkontroll, 31 tester för platsflöde/karturval/navigation/tillstånd/kategorier samt Android/iOS-export. Publik Expo-manifest och Android-bunt svarade HTTP 200, med GPS- och sparade-platsändringarna i bunten. Den fysiska telefonens position och pixelmatchning kan inte verifieras från komponentpreviewn.

## Visuell omarbetning den 15 oktober

Den senaste bildreferensen styr nu appens vanliga sidhuvud: platt blå sköld och Trygg-Puls. Gränssnittet använder fyra lokalt bundlade Inter-vikter via gemensamma Text/TextInput-komponenter på samtliga 32 berörda komponenter och skärmar. Knapp-, kort-, ikon- och rubrikstilar har samordnats även på sekundära sidor.

Hem består nu av sökfält, kompakt familjerad/larm, karta, tre nya händelser och nyhetskort. Övriga funktioner nås via befintlig navigation och Profil/Familj. Statistik har samma sök/segment/stapel-/linjediagramstruktur som referensen. Centralstationens detalj har ett verkligt stationsfoto, understrukna flikar, kategoriantal, faktarader och tips. Familjevyn har illustrerade avatarer, kartetiketter och närliggande notiser. Mjuka kartcirklar är endast visualiseringar av verkliga hämtade notisers ungefärliga områdespunkter och ingen beräknad riskpoäng.

Gemensamma komponenter har renderats och granskats i en separat utvecklingspreview: `http://localhost:4311`. Bild: `tmp/mobile-reference-preview.png`. Den använder uttryckligen märkta testdata och en OpenStreetMap-adapter för native-kartor. Den är **inte** en skärmbild från en telefon. Pixelidentisk native-rendering har därför inte verifierats. Kartleverantör, skärmstorlek och verkliga flöden påverkar telefonens resultat.

Typkontroll, sex navigations-/kategoritester och Android/iOS-export passerade. Den nya Android-bunten hämtades genom den publika Expo-tunneln med HTTP 200. Expo Go kör nu via laptopen med rensad Metro-cache. Inter-fonter och foton följer med i exporten; direkta Ionicons-importer tar bort oanvända ikonfonter. Licenser finns i `mobile/assets/REFERENCE-ASSETS.md` och `mobile/assets/fonts/LICENSE_FONT`.

Nedanstående avsnitt beskriver tidigare genomförda implementationer och driftsförberedelser.

Implementationen följer den bifogade bilden för mobilappen. TryggPuls är huvudnamnet och Cajklops behålls som signatur och animerad symbol. Webbgränssnittets utseende och dess gamla mediefiler ändras inte av mobilens rendering.

## Implementerat

- Hem, Karta, Statistik, Platser och Profil med vit bottennavigation och bevarat fliktillstånd. Händelser och Rutt flyttas till detaljsidor och kan fortfarande öppnas från Hem/Karta/Profil.
- Hem: kompakt varumärke, explicit destinationssökning, familjeavatarer, larmknapp, interaktiv karta, tre nyaste notiser inom cirka 35 km och nyheter. Kartan visar riktiga hämtade notiser och frivilligt delade familjeplatser, utan simulerad riskvärmekarta.
- Statistik: Översikt, Trender och Jämför områden. Fem ömsesidigt uteslutande notiskategorier, tidsfilter, tidskurva endast med minst tre observerade datum och separata årsdata för kommuner. Saknade dagar interpoleras inte till noll. Källfel skiljs från tomma flöden.
- Platser: sökning, sparade adresser, upp till fyra lokala favoriter, kartöversikt och flikarna Översikt/Statistik/Historik/I närheten. Service, familjevalda platser och publicerade områdesuppgifter behåller sina källor och avgränsningar.
- Familj: avatarer och medlemsstatus, karta före sekundära funktioner, befintlig frivillig platsdelning, chatt, privata konversationer, zoner och AirTag-referenser. Utgångna positioner markeras inte som aktuella. Inbjudan skapas endast när användaren väljer Bjud in.
- Gemensamma ljusa sidhuvuden, ytor, flikknappar, laddnings-/fellägen och touchytor. Konto, nyheter, rapporter, larm, rutter, administration och policyer använder samma grundkomponenter.
- Proceduralt cartoon-öga, nytt 6.7-sekunders intro, 5-sekunders logotyploop, statisk appikon och ljus splash. Reduced Motion, Skip och livscykelskydd bevaras.
- Oracle-installationspaket för Node/PostgreSQL/Caddy, krypterad molnbackup och systemd-hälsokontroller. Se `oracle-deployment.md`.

## Verifiering och återstående enhetstest

Mobilens typkontroll, 30 navigations-/statistik-/tillstånds-/flödestester, fem launchtester och Android/iOS-export har passerat. Cartoon-symbolen och introt har granskats i Remotion Studio och alla mobilens videor/PNG har renderats. Backendsviten passerade (121 tester, fyra databastester först överhoppade); de fyra databastesterna passerade sedan mot en isolerad PostgreSQL 18.6-instans, inklusive krypterad backup/återställning, kontoisolering, chattar och sena GPS-uppladdningar. Testinstansen stängdes och dess data togs bort. Linux-skriptens syntax, releasefiltrering och backuprotation har kontrollerats. Exportrendering är inte samma sak som en installerad APK eller visuellt enhetstest.

Granska först designen i Expo Go på en riktig telefon: huvudflikar, plats/favorit, kommunjämförelse, tangentbord, större text, kartdragning, familjeinloggning och intro. Testa tomt/felande flöde och nekad GPS. Kontrollera Android och iPhone eftersom kartor och videospelare är native.

Android-APK byggs efter designgranskningen med EAS-profilen `preview` (fristående, ingen utvecklingsserver), inbäddade tillgångar, verifierad kartnyckel, rätt paket-ID, EAS-projekt och publik API-adress. Expo Go används under designarbetet och behöver Metro; den slutliga APK:n behöver bara den publika backendservern.

Livekontroll av Render kräver ägarens workspace-val. Oracle-konto/server, SSH/DNS och privata backupnycklar har ännu inte tillhandahållits. Ingen databasflytt, publik driftsättning eller APK-publicering har därför genomförts. Befintlig API-adress används tills molnflytten har verifierats.

## Beroendekontroll före APK

Expo-paketen har uppdaterats till de rekommenderade patchversionerna inom SDK 57, inklusive `expo@57.0.29`, och `expo install --check` passerar. Den dynamiska konfigurationen inkluderar nu `expo-asset`-pluginen. En kompatibel override till `shell-quote@1.12.0` tar bort det kritiska npm-audit-fyndet.

`npm audit` flaggar fortfarande 18 high-poster som härleds från två beroenden i byggverktygen: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) och [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv). De aktuella advisories anger inga patchade versioner. Detta är en kvarvarande releasekontroll; auditsteget i befintlig CI passerar inte. Inga auditundantag eller tvingade nedgraderingar av Expo/React Native har införts. Designgranskning i Expo Go och full publik APK-release är separata steg.
