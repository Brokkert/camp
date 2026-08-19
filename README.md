# ⛺ Camp

Mobile-first web-app voor je geheime kampeerplekken. Alles staat privé, en per
plek bepaal je zelf **hoe precies** iemand anders hem te zien krijgt.

Zelfde opzet als [CATANIA](https://github.com/Brokkert/catan) en
[Paklijst](https://github.com/Brokkert/list) — Vite + React, een gratis
Supabase-project erachter, gratis hosting op GitHub Pages — maar met een eigen
gezicht: **veldboek**. Warm papier en inkt, roest als accent, haarlijnen in
plaats van dikke randen, en hoogtelijnen als watermerk. Plaatsnamen staan in een
schreefletter zoals een kaartlabel, coördinaten en meetwaarden in mono, want dat
zijn ze. 's Nachts wisselt hetzelfde schrift naar diepe inkt met perkament.

Geen webfonts: Camp moet in het bos opengaan zonder bereik, en dan wil je niet op
een letter van Google staan wachten.

---

## Het idee

Coördinaten delen is alles-of-niets: zodra je ze doorstuurt, zijn ze weg. Camp
maakt er een schuifregelaar van. Elke share heeft een **nauwkeurigheid**:

| | Wat de ander ziet |
|---|---|
| **Precies** | De echte plek, tot op de meter. |
| **Ongeveer** (~250 m) | Het juiste bosje, niet de juiste boom. |
| **De omgeving** (~2 km) | Het dal, niet de plek. |
| **De streek** (~15 km) | Alleen de hoek van de kaart. |

Het vervagen gebeurt **in de database**, niet in de app. Wie een share op "~2 km"
krijgt, krijgt het echte punt dus nooit binnen — ook niet door het netwerkverkeer
open te maken of de pagina te verversen. De ontvanger ziet een punt met een
cirkel eromheen, en de echte plek ligt daar gegarandeerd ergens in.

Dat laatste is precies zoveel waard als de wiskunde eronder, dus die wordt
getest: `supabase/run-tests.sh` prikt duizend keer in de vervaging en laat de
build vallen zodra er één punt buiten zijn straal komt.

## Wat er verder in zit

- **🗺️ Kaart** — al je plekken, met gratis kaartlagen zonder sleutel:
  OpenFreeMap, OpenTopoMap (hoogtelijnen) en satellietbeelden. Tik ergens op de
  kaart om een plek te bewaren.
- **📋 Plekken** — zoeken en filteren op soort en kenmerken, sorteren op
  waardering of op wat het dichtstbij is.
- **📍 Plak wat je hebt** — een Google Maps-link, graden/minuten/seconden uit een
  forumpost, een `geo:`-URI, of gewoon twee getallen. Het wordt herkend. Bij een
  Google-link pakt Camp het exacte punt uit de URL, niet het midden van het
  beeld — dat scheelt in de praktijk tientallen meters.
- **📓 Logboek** — per plek bijhouden wanneer je er was, met wie, hoeveel
  nachten en hoe het was.
- **🔗 Delen** — een geheime link (met wachtwoord, vervaldatum, maximum aantal
  keer openen en een intrekknop), of rechtstreeks aan een vriend of aan een
  groep als "Busploeg". Voor bij het kampvuur zit er een QR-code bij.
- **👀 Zien wat de ander ziet** — bij het instellen van een share staat er een
  kaartje naast dat exact toont wat er straks vertrokken is.
- **📥 Import en export** — GPX, KML en GeoJSON, beide kanten op. Je zit nergens
  aan vast.
- **📴 Offline** — installeerbaar als app; de kaarttegels die je al bekeken hebt
  blijven bewaard, zodat de kaart niet leeg is als je er zonder bereik staat.
- **🌦️ Weer en hoogte** — zeven dagen vooruit per plek, en de hoogte wordt
  automatisch opgezocht. Via Open-Meteo, gratis en zonder sleutel.
- **📜 Papier en nacht** — papier is het uitgangspunt; één tik verderop staat de
  nachtstand voor in de tent.

## Alles gratis

| | |
|---|---|
| Hosting | GitHub Pages (vereist een publieke repo op een gratis account) |
| Database, inloggen, opslag | Supabase, gratis plan |
| Kaarten | OpenFreeMap, OpenTopoMap, Esri-luchtbeelden |
| Weer en hoogte | Open-Meteo |
| QR-codes | api.qrserver.com |

Geen enkele dienst hierboven vraagt een creditcard of een API-sleutel. De enige
plek waar het gratis plan echt knelt is het versturen van inlogmails; in
[SUPABASE_SETUP.md](SUPABASE_SETUP.md) staat hoe je daar met een gratis
mailserver omheen komt.

## Hoe veilig is het echt

Wat goed geregeld is:

- `camp_spots` is via Row Level Security strikt van de eigenaar. Andere accounts
  krijgen de tabel gewoon leeg terug — niet gefilterd, maar leeg.
- Gedeelde toegang loopt uitsluitend via functies die eerst vervagen. De exacte
  coördinaten verlaten de server niet bij een vervaagde share.
- Deel-links worden alleen als SHA-256-hash bewaard. Wie de database leest, kan
  er geen werkende link uit halen. Het token staat in de URL achter een `#`, dus
  het komt niet in serverlogs of in de `Referer`-header terecht.
- Wachtwoorden op een link staan als bcrypt-hash.
- Een share is in te trekken, kan verlopen en kan een maximum aantal keer
  bekeken worden. Je ziet per share hoe vaak dat gebeurd is.

Wat je moet weten:

- **Foto's staan in een openbare bucket met onraadbare bestandsnamen.** Dat is
  hetzelfde model als een geheime link: niet te raden, maar wie de URL heeft, kan
  hem zien. Daarom stuurt Camp foto's alleen mee bij een share op "precies" of
  "ongeveer" — een foto verraadt vaak toch waar je stond.
- **Een export bevat je exacte coördinaten.** Een GPX-bestand kent geen
  vervaging. Bewaar het zo zorgvuldig als de plekken zelf.
- **Wie "precies" krijgt, heeft het gewoon.** Camp kan voorkomen dat er te veel
  vertrekt, maar niet dat iemand doorstuurt wat hij al heeft.
- Camp versleutelt niet client-side. Wie beheerderstoegang tot jouw
  Supabase-project heeft, kan bij de coördinaten — dat ben jij, en dat is de
  bedoeling.

## Ontwikkelen

```bash
npm install
npm run dev      # ontwikkelserver
npm test         # vitest
npm run build    # productiebouw → dist/
npm run preview  # de bouw serveren

./supabase/run-tests.sh   # schema + beveiligingscontroles tegen een wegwerp-PostgreSQL
```

Zonder Supabase-project start Camp in de lokale kluis, zodat je meteen kunt
rondklikken. Koppelen doe je later via [SUPABASE_SETUP.md](SUPABASE_SETUP.md);
wat je lokaal bewaard hebt, kun je daarna in één keer overzetten naar je account.

`smoke.mjs` loopt de app met Playwright in een echte browser door — nieuwe plek,
zoeken, logboek, thema's — en maakt onderweg schermafdrukken:

```bash
npx playwright install chromium   # eenmalig
npm run build && npx vite preview --port 4173 &
node smoke.mjs
```

## Opzet

```
src/
  lib/        coords.js (alles wat je plakt lezen), fuzz.js (spiegel van de
              database), geo.js (GPX/KML/GeoJSON), vault.js (kluis, lokaal of
              in de cloud), sharing.js, social.js, auth.js, outdoors.js
  components/ MapView, SpotForm, SpotDetail, ShareSheet, ui
  tabs/       Kaart, Plekken, Gedeeld, Mensen, Instellingen
  views/      Login, SharedView (wat de ontvanger van een link ziet)
  data/       taxonomy.js — soorten plek, kenmerken, juridische status
  styles.css  het hele uiterlijk; de hoogtelijnen zijn een ingebakken SVG
supabase/     schema.sql, test.sql, run-tests.sh
```

`src/lib/fuzz.js` en de functie `camp_fuzz_point()` in `schema.sql` rekenen
allebei hetzelfde uit — anders zou de preview "zo ziet de ander het" niet
kloppen. Ze gebruiken daarom dezelfde sha256-truc, en `tests/fuzz.test.js`
vergelijkt de browser tegen waarden die rechtstreeks uit PostgreSQL komen.

## Deployen

Elke push naar `main` bouwt en publiceert naar GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). De tests moeten
groen zijn voordat er iets live gaat.

GitHub Pages vereist op een gratis account een **publieke** repo — net als bij
CATANIA en Paklijst. Dat kan hier veilig: er staat geen enkel geheim in de
broncode. De publishable key is bedoeld om openbaar te zijn en beschermt niets;
dat doet Row Level Security. Je plekken staan in jouw database, achter jouw
login.

Wil je de repo toch privé houden, dan serveren Cloudflare Pages en Netlify ook
gratis vanaf een gesloten repo; dan moet `deploy.yml` daarheen wijzen.
