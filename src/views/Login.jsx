import { useState } from 'react';
import { Note, Field } from '../components/ui.jsx';
import { sendMagicLink, verifyCode } from '../lib/auth.js';
import { localVaultSize } from '../lib/vault.js';

/**
 * Inloggen met een magic link. Je kunt ook zonder account verder: dan draait
 * Camp als lokale kluis. Dat is bewust — je moet je eerste plek kunnen
 * opschrijven zonder eerst je mail te openen.
 */
export default function Login({ configured, onSkip, joinCode = null }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendMagicLink(email, { invite: joinCode });
      setSent(true);
    } catch (e) {
      // Supabase weigert een onbekend adres als er geen uitnodiging meegaat.
      // Die foutmelding is Engels en cryptisch; hier staat wat er aan de hand is.
      const onbekend = /signup|not allowed|not found|Signups/i.test(e.message);
      setError(
        onbekend && !joinCode
          ? 'Dit adres heeft nog geen Camp-account. Aanmelden kan alleen via een uitnodigingslink — vraag er iemand om.'
          : e.message
      );
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const lokaal = localVaultSize();

  return (
    <div className="login-wrap topo">
      <div className="logo">{joinCode ? '✉️' : '⛺'}</div>
      <h1>Camp</h1>
      <div className="rule" />
      <p className="tag">
        {joinCode ? (
          <>
            Je bent uitgenodigd.
            <br />
            Vul je e-mailadres in, dan zetten we je erin.
          </>
        ) : (
          <>
            Je geheime plekken op één kaart.
            <br />
            Deel ze zo precies als je zelf wilt.
          </>
        )}
      </p>

      {error && <Note tone="bad">{error}</Note>}

      {!configured ? (
        <>
          <Note tone="warn">
            Er is nog geen Supabase-project gekoppeld, dus inloggen en delen kan nog niet. Je kunt
            wel meteen beginnen met de <strong>lokale kluis</strong>: alles blijft dan in deze
            browser.
          </Note>
          <button className="btn primary wide" onClick={onSkip}>
            Beginnen zonder account
          </button>
          <p className="tiny muted center" style={{ marginTop: 16, lineHeight: 1.6 }}>
            Koppelen doe je later bij Instellingen. In SUPABASE_SETUP.md staat hoe — het is gratis
            en kost een minuut of vijf.
          </p>
        </>
      ) : !sent ? (
        <>
          <Field label={joinCode ? 'Je e-mailadres' : 'Je e-mailadres'}>
            <input
              className="input"
              type="email"
              value={email}
              placeholder="jij@voorbeeld.nl"
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && send()}
            />
          </Field>
          <button
            className="btn primary wide"
            onClick={send}
            disabled={busy || !email.includes('@')}
          >
            {busy ? <span className="spinner" /> : '✉️'}{' '}
            {joinCode ? 'Account aanmaken' : 'Stuur me een link'}
          </button>
          <p className="tiny muted center" style={{ marginTop: 14, lineHeight: 1.6 }}>
            {joinCode
              ? 'Geen wachtwoord. Je krijgt een mail met een link; klikken en je bent binnen.'
              : 'Geen wachtwoord — je krijgt een mail. Nog geen account? Dat kan alleen via een uitnodigingslink.'}
          </p>

          <button className="btn ghost wide" style={{ marginTop: 20 }} onClick={onSkip}>
            Zonder account verder{lokaal > 0 ? ` (${lokaal} plekken)` : ''}
          </button>
        </>
      ) : (
        <>
          <Note tone="good">
            Er is een mail onderweg naar <strong>{email}</strong>. Klik op de link erin, dan ben je
            binnen.
          </Note>

          {/* De code is een terugvaloptie, geen hoofdweg. Supabase stuurt met zijn
              eigen mailserver alleen een link; de zes cijfers komen er pas bij als
              je eigen SMTP hebt ingesteld, want anders zijn de templates niet te
              bewerken. Daarom staat dit ingeklapt in plaats van als eerste veld. */}
          <details className="fallback">
            <summary>Mail op een ander apparaat geopend?</summary>
            <p className="hint" style={{ marginTop: 8 }}>
              Staat er een code van zes cijfers in de mail? Vul die hier in. Zit er alleen een
              link in, klik die dan op het apparaat waar je de mail opent — dat werkt net zo goed.
            </p>
            <Field label="Code uit de mail">
              <input
                className="input mono"
                inputMode="numeric"
                value={code}
                placeholder="123456"
                autoComplete="one-time-code"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.length >= 6 && check()}
              />
            </Field>
            <button className="btn wide" onClick={check} disabled={busy || code.length < 6}>
              {busy ? <span className="spinner" /> : null} Inloggen met code
            </button>
          </details>

          <button className="btn ghost wide" style={{ marginTop: 14 }} onClick={() => setSent(false)}>
            Ander adres gebruiken
          </button>
        </>
      )}
    </div>
  );
}
