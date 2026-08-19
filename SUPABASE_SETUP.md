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

## 5. De keepalive aanzetten

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
