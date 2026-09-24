# TryggPuls — Sveriges Digitala Trygghetsplattform

> *"Målet är inte att skrämma människor, utan att ge dem rätt information på rätt plats och vid rätt tid, så att de själva kan göra tryggare val."*
> — Från grundvisionen i `VISION – TRYGGHETSPLATTFORMEN.pdf`

TryggPuls visar publicerade myndighetsuppgifter, historisk statistik och öppna kartdata för Sverige. Polisnotiser är ett urval; kartpunkter är ofta områdescentrum. En tom lista är ingen trygghetsgaranti. Företagsvyn innehåller tydligt märkta exempelarbetsplatser.

## API och drift (uppdaterat 2026-09-24)

Publika informationsendpoints stöder GET och HEAD. Informationsflöden anger `fetchedAt`, `stale` och felstatus. Första källfelet ger 503; finns tidigare data visas den med en fördröjningsmarkering. Delvis fel i krisflödet bevarar VMA och notiser var för sig.

| Endpoint | Innehåll / parametrar |
| --- | --- |
| `/api/events` | Polisens publicerade händelser, cache 65 sekunder |
| `/api/police-areas` | Polisens officiella områdesgränser i WGS84; svarar med bedömningsår och källänk. Den årsvisa publiceringen är inte ett realtidsflöde |
| `/api/security-zone-news` | Nyligen publicerade polisartiklar om säkerhetszoner från Polisens nyhets- och press-RSS, cache 30 minuter; artiklar innebär inte automatiskt en aktiv zon |
| `/api/crisis-updates` | VMA och notiser från Krisinformation v3, cache 65 sekunder; svaren bevarar geometri, berörda områden och separat status för VMA/notiser |
| `/api/weather-warnings` | SMHI:s varningar och meddelanden med nivå, område, giltighet och råd; cache 65 sekunder |
| `/api/fire-risk?lat=...&lon=...` | SMHI:s timvisa punktprognos för skogsbrandsrisk, upp till 48 timmar; cache 20 minuter |
| `/api/traffic` | Trafikverkets publicerade väg- och järnvägsstörningar; kräver `TRAFIKVERKET_API_KEY`, som bara används på servern |
| `/api/police-stations` och `/api/police-stations/{id}` | Polisens stationsregister och stationsuppgifter, inklusive öppettider/tjänster där källan lämnar dem; stationssvar anger källa, hämtningstid och eventuell reservdata |
| `/api/shelters?lat=...&lon=...&radius=...` | Registrerade skyddsrum nära vald plats; registret visar inte om de är öppna eller tillgängliga just nu |
| `/api/crisis-news` | Krisinformation, senaste veckans nyheter; cache 5 minuter |
| `/api/preparedness` | Krisinformations beredskapsguider; cache 1 timme |
| `/api/bra-stats` | BRÅ:s kommunstatistik, cache 24 timmar; fel återförsöks efter 60 sekunder |
| `/api/legal-updates` | Domstolsverkets rättspraxis, cache 65 sekunder |
| `/api/geocode?q=...` | Svensk platssökning, 2–200 tecken, explicit sökning |
| `/api/reverse-geocode?lat=...&lon=...` | Koordinater till adress |
| `/api/route?fromLat=...&fromLon=...&toLat=...&toLon=...&mode=walking&buffer=600` | Gång- eller bilrutt, polisnotiser från senaste 24 timmarna, officiella zonpassager, Trafikverkets störningar, geografiskt matchade SMHI/Krisinformation-varningar samt SMHI-brandrisk vid provpunkter; korridor 300–1 000 m. `sourceStatus` visar varje källas status och senaste hämtning |
| `/api/route-refresh?routeId=...` | Hämtar aktuell källinformation för den redan beräknade rutten utan att skapa en ny vägsträckning |
| `/api/public-zones` | Aktiva, manuellt granskade myndighetszoner med ordagrant källutdrag, källa, beslutstid och giltighetsperiod; publikt endast efter granskning och publicering |
| `/api/admin/zones` | Token-skyddad hantering av utkast, granskning och publicering av myndighetszoner |
| `/api/map-config` | Vald kartleverantör, utan API-nyckel |
| `/api/map-tiles/{z}/{x}/{y}.png` | CARTO Voyager via servern, zoom 0–19; kräver konfigurerad nyckel |
| `/api/sources` | Källförteckning med observerad status, tidsstämpel och källänk |
| `/api/health` | Serverns tillgänglighet (inte en garanti att alla externa källor svarar) |

Familje-API: `GET /api/family/config`, `GET /api/family/me` och `POST /api/family/{register,login,logout,group,invite,join,zones,location,police-area-alerts,stop,leave,push}`. Zoner, push-prenumerationer och det egna kontot kan raderas med `DELETE`. Ändringar kräver JSON, `X-TryggPuls-Action: 1`, samma ursprung och, förutom registrering/inloggning, en httpOnly sessionscookie. Inbjudningar gäller en gång i 24 timmar. Endast familjens skapare kan ändra delade zoner. Varje medlem aktiverar själv GPS på sin enhet.

Polisens 2025-GeoJSON för bedömda utsatta områden finns som reservkopia i `data/`. Servern kontrollerar [Polisens lägesbild och geodata](https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/) efter en ny officiell version, validerar arkivet och transformerar SWEREF 99 TM till WGS84. Varje familjemedlem kan frivilligt slå på inträdesvarningar för dessa områden. Första GPS-positionen skickar inget larm; varningar kräver högst 50 meters osäkerhet, färsk källkontroll och ett nytt inträde. Högst en varning per område och dag skickas. Detta är en periodisk områdesbedömning, inte en karta över pågående gängrekrytering eller brott. Tillfälliga säkerhetszoner har separata beslut, kartor och slutdatum. Något verifierat nationellt polygon-API för dem har inte hittats, så de visas inte som automatiska GPS-zoner.

### Konfiguration

Kopiera `.env.example` till `.env.local` för lokal körning. Filen är Git-ignorerad och läses vid start med Node 22 (eller Node 20.12+). I Render anges variablerna i tjänstens miljöinställningar.

- `CARTO_BASEMAP_API_KEY`: valfri kartnyckel. Den stannar på servern. Utan nyckel används OpenStreetMap; vid CARTO-fel byter kartan till OpenStreetMap.
- `TRAFIKVERKET_API_KEY`: separat nyckel från Trafikverket för att visa publicerade väg- och järnvägsstörningar. Utan nyckeln markeras källan som `requires_key`.
- `ZONE_ADMIN_TOKEN`: skyddar administrationen av granskade myndighetszoner. Lagra den som Render-hemlighet och dela den inte med klienten.
- `DATABASE_URL`: PostgreSQL krävs för familjekonton i produktion. Utan variabel används en tillfällig databas i lokal utveckling. Utan databas i produktion svarar familje-API med 503.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: behövs för Web Push. Skapa ett nyckelpar en gång och bevara det mellan distributioner, annars behöver användarna prenumerera på nytt.
- `GEOCODER_BASE_URL`, `WALKING_ROUTER_URL`, `DRIVING_ROUTER_URL`: byt karttjänster utan kodändring.
- `UPSTREAM_USER_AGENT`: identifiera installationen och gärna en verklig kontaktväg.
- `PORT` och `HOST`: serverns port och bindningsadress.

Leaflet 1.9.4 levereras lokalt i `vendor/leaflet` med originallicens. Detta korrigerar det tidigare felaktiga CSS-integritetsvärdet som fick kartans rutor att visas utan rätt positionering.

Nominatim används endast efter en uttrycklig sökning; gemensam kö begränsar uppslag till högst ett per 1,1 sekunder och återanvänder svar. Publika Nominatim tillåter inte autocomplete. Begränsningen gäller hela installationen: använd en egen eller avtalad tjänst och gemensam begränsning före skalning till flera serverinstanser. [Nominatims villkor](https://operations.osmfoundation.org/policies/nominatim/). FOSSGIS har separata riktiga gång- och bilprofiler; ruttsvaren köas och cachas. [FOSSGIS driftvillkor](https://routing.openstreetmap.de/about.html).

Platsuppslag och rutter skickar uppgifter till respektive kartleverantör. Personliga zoner lagras i webbläsaren; delade familjezoner, konton och aviseringar lagras i PostgreSQL. Familjens exakta GPS-position visas inte för andra medlemmar; den senaste positionen används för zon- och polisnotiser i högst 15 minuter och raderas när användaren stoppar delning. Varningshistorik raderas efter sju dagar. Platsdelning kräver att medlemmen aktivt startar den i sin öppna webbläsare. En stängd webbsida kan ta emot Web Push om en aktuell position redan finns, men webbläsaren kan inte fortsätta samla GPS i bakgrunden. För kontinuerlig platsdelning när appen är stängd behövs senare en mobilapp med uttryckliga platsbehörigheter. Polisnotiser är ungefärliga, kan vara fördröjda och indikerar inte automatiskt pågående fara. Någon verifierad rikstäckande karta över platser för gängrekrytering finns inte i de anslutna källorna.

Webbappen har ett manifest och kan läggas till på hemskärmen. På iPhone/iPad måste den öppnas som en hemskärmsapp för att Web Push ska fungera; detta ändrar inte GPS-begränsningen ovan. [WebKit: Web Push för hemskärmsappar](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Ruttens valfria GPS-följning kräver att sidan är öppen, synlig och att användaren ger platsåtkomst. Positionen används för att visa var användaren befinner sig längs rutten och kan indikera nästa granskade zon. Källunderlaget uppdateras därefter var 60:e sekund medan vyn är synlig; polisnotiser kan ändå vara fördröjda och geografiskt ungefärliga. Webbläsaren pausar GPS när sidan döljs och kan inte fortsätta samla in plats i bakgrunden.

För tillförlitlig bakgrundskontroll på Render krävs en tjänst som inte somnar, samt en beständig databas. Renders gratistjänst somnar efter 15 minuter utan trafik och gratis Postgres upphör efter 30 dagar; gratisnivån passar endast förhandsvisning. SMS/delning öppnar enhetens funktion och skickar inte automatiskt något meddelande.

### Verifiering

`npm run check` kontrollerar syntax. `npm test` kör deterministiska tester för riktig serverkod, HTTP-validering, skydd av privata filer, cache, källfel, partiella krisflöden, polygoner med hål och smala gränser, ungefärliga polispositioner, stationsreservdata och GPS-bevakningens start/paus/stop. Testerna startar en egen server på en ledig port och behöver inga externa tjänster.

Livekontroll 2026-09-24: SMHI:s brandriskprognos-API svarade med timvisa gridvärden. Rutten visar punktprognoser med ungefärlig gridupplösning, inte riskpolygoner; detta är skilt från brandhändelser och eldningsförbud. Övriga källors senaste kontrollerade svar redovisas i `/api/sources`; externa tjänster kan ändra tillgänglighet efter kontrollen.

### Ytterligare identifierad källa

Trafikverkets väg- och järnvägsinformation kräver en separat registrerad API-nyckel och är **inte ansluten utan den**. Detta framgår även av källstatus. [Trafikverkets öppna API](https://www.trafikverket.se/e-tjanster/trafikverkets-oppna-api-for-trafikinformation/). Krisinformations `/v3/notifications` är permanent avstängd; appen använder de separata dokumenterade `/v3/notices`, `/v3/vmas`, `/v3/news` och `/v3/features`. [Aktuell API-dokumentation](https://api.krisinformation.se/v3).

Brå uppger att myndigheten inte har ett publikt API för öppna data. Därför hämtar `/api/bra-stats` Brås officiella CSV-nedladdning och visar kommunstatistik, inte realtidsdata. [Brå: data från Brå](https://bra.se/om-bra/om-webbplatsen/data-fran-bra). En möjlig komplettering för reseplanering är Trafiklabs svenska kollektivtrafik-API:er med realtidsavgångar; det kräver en egen nyckel och en separat kollektivtrafikvy och är ännu inte integrerat. [Trafiklab: realtidsavgångar](https://www.trafiklab.se/sv/api/our-apis/trafiklab-realtime-apis/timetables).


## Användning

- Händelser: fritext, plats, tidsintervall, kategori och återställning av filter.
- Väder & råd: sökbara varningar, krisnyheter och beredskapsguider med originalkällor.
- Ruttanalys: sök start/mål, välj ett sökresultat och beräkna gång- eller bilväg. Separata avsnitt visar Polisens områdesbedömningar, aktiva publicerade säkerhetszoner, manuellt granskade uppgifter om nätverksområden, trafik, väder och historiska polisnotiser som berör rutten. Välj "Följ resan med GPS" för positionsvisning och källuppdatering var 60:e sekund medan sidan är öppen.
- Skyddszoner: skapa och radera egna platser som sparas lokalt.
- Statistik: välj kommun för BRÅ:s historiska statistik.
- SOS: telefonlänkar, position och användarstyrd delning.
- Flikar stöder tangentbord, direktlänkar och webbläsarens tillbaka-knapp. Mobilens fasta huvudflikar håller karta och innehåll nära till hands; kartlager och återställning finns samlade under "Kartlager".

## Kör lokalt

Node.js 22 rekommenderas. Kör `npm install` först.

```sh
npm install
npm start
npm run check
npm test
```

Öppna [TryggPuls lokalt](http://localhost:3000). En annan port kan anges med miljövariabeln PORT.
