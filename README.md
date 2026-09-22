# TryggPuls — Sveriges Digitala Trygghetsplattform

> *"Målet är inte att skrämma människor, utan att ge dem rätt information på rätt plats och vid rätt tid, så att de själva kan göra tryggare val."*
> — Från grundvisionen i `VISION – TRYGGHETSPLATTFORMEN.pdf`

TryggPuls är en helhetsplattform för personlig och företagsmässig säkerhet i Sverige, byggd på 100% officiella data i realtid.

---

## ⚡ Nyckelfunktioner (Enligt Visionen)

1. **🗺️ Karta & Händelser i Realtid**:
   - Direktkoppling till **Polisens öppna API** (`https://polisen.se/api/events`) med automatisk synkning var 65:e sekund.
   - Sökning på alla svenska orter, kommuner och händelsetyper.
   - Filtrering på kategori: *Våld & Rån*, *Stöld & Inbrott*, *Trafik*, *Brand & Olycka*, samt *Övrigt*.
   - Filter på tidsintervall: Senaste 12h, 24h, 3 dagar, eller all tillgänglig data.
   - Klickbara markörer med klusterantal och direktlänk till den officiella polisnotisen på Polisen.se.

2. **🚶 Trygg Rutt ("Jag ska gå hem – har något hänt längs vägen?")**:
   - Beräknar verkliga gång- och bilvägar via **OSRM** (Open Source Routing Machine) baserat på OpenStreetMap-vägnätet.
   - Svensk adress- och platssökning via **Nominatim**.
   - Analyserar samtliga aktiva polisanmälningar och beräknar det exakta avståndet i meter till ruttens segment.
   - Visar en anpassad säkerhetskorridor (300 m, 600 m eller 1 000 m) med statusindikator: *"Trygg väg"* eller *"⚠️ Händelse nära din rutt"*.

3. **👨‍👩‍👧‍👦 Familj & Barn (Geozoner)**:
   - Spara skyddszoner runt platser som betyder mest: Hemmet, Skolan, Förskolan eller Träningen.
   - Kontrollerar i realtid med Haversine-formeln om några polisanmälda händelser rapporterats inom den valda radien.
   - Snabbindikator för zonens säkerhetsstatus (Grön / Varning).
   - Sparas lokalt i webbläsaren (`localStorage`).

4. **🏢 Företag & Arbetsplatser (B2B Säkerhetsdashboard)**:
   - Övervakning av incidenter i närheten av kontor, butiker och logistikanläggningar.
   - Krisrutiner och åtgärdsplaner för:
     - Pågående brott, hot och våld
     - Inbrott och skadegörelse
     - Brand och evakuering
   - Snabbkontakt till säkerhetsansvarig, väktarbolag och SOS Alarm.

5. **📊 Platsprofil & Officiell BRÅ-kriminalstatistik**:
   - Officiell kriminalstatistik från **Brottsförebyggande rådet (BRÅ)** för Sveriges samtliga 21 län.
   - Jämförelse av anmälda brott per 100 000 invånare gentemot rikssnittet (14 230).
   - Detaljerad fördelning per brottskategori: Våldsbrott & hot, Tillgreppsbrott, Skadegörelse, Trafikbrott och Narkotika.
   - BRÅ:s officiella riskanalys och kontext för respektive region.

6. **🚨 SOS & Smarta Larm**:
   - 1-klicks snabbval till **112** (SOS Alarm), **114 14** (Polisen icke-akut) och **1177** (Sjukvård).
   - Hämtning av enhetens exakta satellit- och GPS-koordinater via Geolocation API.
   - Direkt delning av koordinater och kartlänk via SMS/Meddelande.
   - Barnanpassat nödläge (*"Jag behöver hjälp!"*) med trygg och enkel kontaktväg till föräldrar.

7. **⚖️ Rättspraxis (Domstolsverket)**:
   - Källänkade vägledande domar och prejudikat från Domstolsverket.

---

## 🔒 100% Verklig Data — Noll Mock-Data

Plattformen följer en strikt etisk och dataskyddsmässig policy:
- **Ingen påhittad eller fabricerad data**: All information som visas i applikationen hämtas i realtid från verifierade statliga eller öppna datakällor.
- **Inget person- eller bostadsregister**: Vi lagrar eller publicerar aldrig uppgifter om privatpersoners bostäder eller misstänkta.
- **Officiella källor**:
  - Polismyndigheten: `https://polisen.se/api/events`
  - Domstolsverket: `https://rattspraxis.etjanst.domstol.se/api/v1/publiceringar`
  - Brottsförebyggande rådet (BRÅ): `https://bra.se/statistik`
  - OSRM Routing: `https://project-osrm.org/`
  - OpenStreetMap & Nominatim: `https://nominatim.org/`

---

## 🚀 Kom igång och Kör

Kräver Node.js 20 eller senare (inga externa npm-paket krävs – applikationen körs på Node.js inbyggda moduler).

```bash
# Starta servern
npm start
```

Öppna webbläsaren på:
👉 **`http://localhost:3000`**
