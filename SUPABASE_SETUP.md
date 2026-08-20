# Supabase instellen (eenmalig, gratis)

Camp werkt meteen zonder dit alles — dan draait hij als **lokale kluis**: je
plekken staan in je browser en delen is uit. Wil je kunnen delen en tussen je
telefoon en laptop synchroniseren, dan heb je een eigen (gratis) Supabase-project
nodig. Reken op een minuut of tien.

---

## 1. Project aanmaken

Maak op [supabase.com](https://supabase.com/dashboard) een nieuw project aan.
Het gratis plan is ruim genoeg: 500 MB database en 1 GB opslag voor foto's. Ter
vergelijking: één plek is ongeveer een halve kilobyte, dus je zit pas bij
honderdduizenden plekken aan die grens.

## 2. Het schema draaien

Ga naar **SQL Editor**, plak de volledige inhoud van
[`supabase/schema.sql`](supabase/schema.sql) en druk op **Run**.

Dat zet in één keer neer:

- alle tabellen (plekken, bezoeken, vrienden, groepen, shares);
- Row Level Security, zodat niemand bij andermans plekken kan;
- de functies die coördinaten vervagen voordat ze het pand verlaten;
- een opslagbucket voor foto's;
- een trigger die nieuwe gebruikers automatisch een profiel geeft.

Het bestand is idempotent: na een update van Camp kun je het gewoon opnieuw
draaien zonder je gegevens kwijt te raken.

## 3. Inloggen per e-mail aanzetten

Onder **Authentication → Sign In / Providers**:

- **Email** aan.
- **Confirm email** aan (dat ís de magic link).
- Wachtwoorden mag je uitzetten; Camp gebruikt ze niet.

### De code van zes cijfers erbij

Standaard stuurt Supabase alleen een link. Camp toont ook een veld voor een code
— handig als je de mail op je telefoon opent terwijl de app op je laptop staat.
Ga daarvoor naar **Authentication → Emails → Magic Link** en zet in de template
`{{ .Token }}` erbij, bijvoorbeeld:

```html
<h2>Inloggen bij Camp</h2>
<p><a href="{{ .ConfirmationURL }}">Klik hier om in te loggen</a></p>
<p>Of tik deze code over: <strong>{{ .Token }}</strong></p>
```

### Waar de link naartoe mag terugkeren

Onder **Authentication → URL Configuration**:

- **Site URL**: `https://<jouw-github-naam>.github.io/camp/`
- **Redirect URLs**: dezelfde, plus `http://localhost:5173/` om lokaal te
  kunnen ontwikkelen.

> **Let op — dit is de enige echte beperking van gratis.** De ingebouwde
> mailserver van Supabase is bedoeld om te testen en laat maar een paar mails
> per uur door. Voor jou alleen is dat prima; ga je met een handvol vrienden
> tegelijk inloggen, dan loop je ertegenaan. Oplossing: vul onder **Project
> Settings → Authentication → SMTP Settings** een eigen mailserver in. Gratis
> opties zijn [Brevo](https://www.brevo.com) (300 mails per dag) en
> [Resend](https://resend.com) (3.000 per maand). Je hoeft er verder niets voor
> aan te passen in Camp.

## 4. De sleutels in de app zetten

Onder **Project Settings → API** vind je de **Project URL** en de
**publishable key** (die begint met `sb_publishable_`). Zet ze in
[`src/lib/config.js`](src/lib/config.js):

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_xxxxxxxxxxxxxxxx';
```

Deze sleutel hóórt in je broncode te staan en is bedoeld om openbaar te zijn.
Hij geeft in zijn eentje nergens toegang toe: dat regelt Row Level Security in
de database. Gebruik nooit de `service_role`-sleutel in de app — die omzeilt
alle beveiliging.

> Even proberen zonder te herbouwen? Je kunt dezelfde twee waarden ook in de app
> zelf invullen, bij **Meer → Verbinding**. Ze blijven dan in je eigen browser.
> Voor een gedeelde link moeten ze wél in `config.js` staan, want de ontvanger
> heeft jouw browser niet.

## 5. Wat open aanmelden betekent

Je publishable key komt in een openbare repo en in de JavaScript die elke
bezoeker binnenhaalt. Iedereen die hem oppikt kan daarmee een **account** maken
in jouw project. Dat is een bewuste keuze en prima; dit is wat het wel en niet
betekent.

**Wat zo iemand niet kan.** Van jouw plekken ziet hij niets. Zonder account
weigert de database elke tabel; mét account komt hij wel langs de rechten maar
filtert Row Level Security alles weg — nul rijen, alleen zijn eigen kluis. Dat
staat getoetst in `supabase/test.sql`.

**Wat hij wel kan.** Een eigen kluis vullen, en foto's uploaden naar zijn eigen
map. Dat gaat van jouw gratis quotum af (500 MB database, 1 GB opslag). Daarom
staat er een grens op de bucket: maximaal 5 MB per bestand en alleen
afbeeldingen. De app verkleint foto's zelf tot zo'n 200 kB, dus je merkt er
niets van.

**Als je er later toch vanaf wilt**, staat de knop onder **Authentication →
Sign In / Providers → Email**: zet *Allow new users to sign up* uit en nodig je
vrienden handmatig uit via **Authentication → Users → Invite**.

### Eén ding om even na te kijken

Het opslagbeleid staat zo dat alleen jij de lijst met foto-paden kunt opvragen,
terwijl de bucket zelf openbaar is — zo blijven gedeelde foto's laden zonder dat
iemand kan bladeren. Dat leunt erop dat Supabase de openbare
`/storage/v1/object/public/...`-route buiten Row Level Security om serveert.
Dat is het gedocumenteerde gedrag, maar ik heb het niet tegen een echt project
kunnen toetsen.

Doe daarom één keer de proef: zet een foto bij een plek, deel die plek op
"precies" en open de link in een ander browservenster. Zie je de foto, dan klopt
het. Zie je hem niet, dan is dit de terugvaloptie:

```sql
drop policy if exists camp_photos_read on storage.objects;
create policy camp_photos_read on storage.objects
  for select using (bucket_id = 'camp-photos');
```

Dan zijn de foto's weer voor iedereen leesbaar én opsombaar. De plekken zelf
blijven onaangetast — die staan in de database, niet in de opslag.

## 6. De keepalive aanzetten

Supabase pauzeert gratis projecten als er te weinig gebeurt. In
[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) staat een
workflow die er dagelijks even tegenaan tikt. Vul bovenin dezelfde twee waarden
in:

```yaml
env:
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co'
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx'
```

Zolang die leeg zijn, slaat de workflow zichzelf netjes over.

> GitHub zet geplande workflows uit na 60 dagen zonder activiteit in de repo. Als
> je Camp een tijd niet gebruikt én er niets pusht, kan het project alsnog
> pauzeren. Weer wakker maken kost één klik in het Supabase-dashboard.

---

## Controleren of het klopt

Het beveiligingsmodel is te testen zonder je echte project aan te raken. Met een
lokale PostgreSQL:

```bash
./supabase/run-tests.sh
```

Dat zet een wegwerpdatabase op, draait `schema.sql` erover en controleert onder
meer dat vervaagde coördinaten nooit buiten hun straal vallen, dat een ander
account de tabellen leeg ziet, en dat ingetrokken links echt dichtgaan. Fouten
laten het script met een foutcode stoppen; dezelfde controle draait bij elke push
in GitHub Actions.
