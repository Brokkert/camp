import { useEffect, useRef, useState } from 'react';
import { Field, Note, Sheet, Confirm, copyText } from '../components/ui.jsx';
import { readConfig, writeConfig } from '../lib/config.js';
import { resetClient } from '../lib/supabase.js';
import { signOut, saveProfile } from '../lib/auth.js';
import { importSpots, toGpx, toKml, toGeoJson, downloadFile } from '../lib/geo.js';
import { migrateLocalToCloud, localVaultSize } from '../lib/vault.js';
import { listAllShares, revokeShare, shareStatus } from '../lib/sharing.js';
import { createInvite, listInvites, revokeInvite, inviteStatus } from '../lib/invites.js';
import { precisionLabel } from '../lib/fuzz.js';

const THEME_KEY = 'camp:theme';

export default function Instellingen({ user, profile, spots, onImported, onReloadProfile }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [config, setConfig] = useState(readConfig);
  const [url, setUrl] = useState(config.url);
  const [key, setKey] = useState(config.key);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shares, setShares] = useState([]);
  const [showShares, setShowShares] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [invites, setInvites] = useState([]);
  const fileInput = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    listAllShares().then(setShares).catch(() => {});
    listInvites().then(setInvites).catch(() => {});
  }, [user]);

  const saveConnection = () => {
    writeConfig(url, key);
    resetClient();
    setConfig(readConfig());
    setMessage({ tone: 'good', text: 'Bewaard. De pagina wordt herladen…' });
    setTimeout(() => window.location.reload(), 700);
  };

  const doImport = async (file) => {
    setBusy(true);
    setMessage(null);
    try {
      const found = importSpots(await file.text());
      if (!found.length) {
        setMessage({ tone: 'bad', text: 'Geen plekken in dit bestand gevonden.' });
      } else {
        const count = await onImported(found);
        setMessage({ tone: 'good', text: `${count} ${count === 1 ? 'plek' : 'plekken'} toegevoegd.` });
      }
    } catch (e) {
      setMessage({ tone: 'bad', text: e.message });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const actief = shares.filter((s) => shareStatus(s).id === 'active');

  return (
    <>
      {message && <Note tone={message.tone}>{message.text}</Note>}

      {profile && (
        <>
          <div className="section-title">Jij</div>
          <div className="card">
            <Field label="Weergavenaam">
              <input
                className="input"
                defaultValue={profile.display_name}
                onBlur={async (e) => {
                  if (e.target.value !== profile.display_name) {
                    await saveProfile({ display_name: e.target.value });
                    onReloadProfile?.();
                  }
                }}
              />
            </Field>
            <Field label="Naam om te delen" hint="Hiermee vinden vrienden jou. Moet uniek zijn.">
              <input
                className="input mono"
                defaultValue={profile.handle}
                onBlur={async (e) => {
                  const handle = e.target.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (handle && handle !== profile.handle) {
                    try {
                      await saveProfile({ handle });
                      onReloadProfile?.();
                    } catch {
                      setMessage({ tone: 'bad', text: 'Die naam is al bezet.' });
                      e.target.value = profile.handle;
                    }
                  }
                }}
              />
            </Field>
            <div className="tiny muted">Ingelogd als {user.email}</div>
          </div>
        </>
      )}

      <div className="section-title">Weergave</div>
      <div className="card tight">
        <div className="row">
          <div className="grow small">Thema</div>
          <div className="chips">
            {[['dark', '🌙 Nacht'], ['light', '☀️ Dag']].map(([id, label]) => (
              <button key={id} className={`chip${theme === id ? ' on' : ''}`} onClick={() => setTheme(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {user && (
        <>
          <div className="section-title">Alles wat je deelt</div>
          <div className="card tight">
            <div className="row">
              <div className="grow">
                <div className="strong small">{actief.length} actieve shares</div>
                <div className="tiny muted">
                  {shares.length - actief.length} verlopen, opgebruikt of ingetrokken
                </div>
              </div>
              <button className="btn sm" onClick={() => setShowShares(true)}>Bekijken</button>
            </div>
          </div>
        </>
      )}

      {user && (
        <>
          <div className="section-title">Mensen uitnodigen</div>
          <div className="card tight">
            <div className="row">
              <div className="grow">
                <div className="strong small">
                  {invites.filter((i) => inviteStatus(i).tone === 'good').length} geldige uitnodigingen
                </div>
                <div className="tiny muted">
                  Aanmelden kan alleen via zo'n link — de voorpagina biedt het niet aan.
                </div>
              </div>
              <button className="btn sm" onClick={() => setShowInvites(true)}>Beheren</button>
            </div>
          </div>
        </>
      )}

      <div className="section-title">Import en export</div>
      <div className="card">
        <input
          ref={fileInput}
          type="file"
          accept=".gpx,.kml,.json,.geojson,.txt,application/gpx+xml,application/json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && doImport(e.target.files[0])}
        />
        <button className="btn wide" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? <span className="spinner" /> : '📥'} GPX, KML of GeoJSON importeren
        </button>
        <div className="hint" style={{ marginBottom: 12 }}>
          Ook een tekstbestand met per regel een coordinaat werkt.
        </div>

        <div className="row wrap" style={{ gap: 7 }}>
          <button
            className="btn sm"
            disabled={!spots.length}
            onClick={() => downloadFile(`camp-${stamp}.gpx`, toGpx(spots), 'application/gpx+xml')}
          >
            GPX
          </button>
          <button
            className="btn sm"
            disabled={!spots.length}
            onClick={() => downloadFile(`camp-${stamp}.kml`, toKml(spots), 'application/vnd.google-earth.kml+xml')}
          >
            KML
          </button>
          <button
            className="btn sm"
            disabled={!spots.length}
            onClick={() =>
              downloadFile(`camp-${stamp}.geojson`, JSON.stringify(toGeoJson(spots), null, 2), 'application/geo+json')
            }
          >
            GeoJSON
          </button>
        </div>
        <div className="hint">
          Een export bevat je <strong>exacte</strong> coordinaten. Bewaar hem net zo zorgvuldig als
          de plekken zelf.
        </div>
      </div>

      <div className="section-title">Verbinding</div>
      {config.source === 'geen' ? (
        <Note tone="warn">
          Camp draait nu als <strong>lokale kluis</strong>: alles staat alleen in deze browser en
          delen kan niet. Koppel een gratis Supabase-project (zie SUPABASE_SETUP.md) om te kunnen
          delen en te synchroniseren tussen apparaten.
        </Note>
      ) : (
        <Note tone="good">
          Verbonden met je eigen Supabase-project ({config.source === 'lokaal' ? 'hier ingesteld' : 'ingebouwd'}).
        </Note>
      )}
      <div className="card">
        <Field label="Project-URL">
          <input
            className="input mono"
            value={url}
            placeholder="https://xxxx.supabase.co"
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field
          label="Publishable key"
          hint="Deze hoort openbaar te zijn: de beveiliging zit in Row Level Security, niet in deze sleutel."
        >
          <input
            className="input mono"
            value={key}
            placeholder="sb_publishable_…"
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        <button className="btn wide" onClick={saveConnection}>Bewaren en herladen</button>
      </div>

      {user && localVaultSize() > 0 && (
        <>
          <div className="section-title">Lokale kluis</div>
          <div className="card">
            <p className="small muted" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
              Er staan nog {localVaultSize()} plekken in deze browser van voordat je inlogde.
            </p>
            <button
              className="btn primary wide"
              onClick={async () => {
                const n = await migrateLocalToCloud(user);
                setMessage({ tone: 'good', text: `${n} plekken overgezet naar je account.` });
              }}
            >
              Overzetten naar mijn account
            </button>
          </div>
        </>
      )}

      {user && (
        <>
          <div className="section-title">Account</div>
          <button className="btn wide" onClick={() => signOut().then(() => window.location.reload())}>
            Uitloggen
          </button>
        </>
      )}

      {!user && localVaultSize() > 0 && (
        <>
          <div className="section-title">Gevaarlijke knoppen</div>
          <button className="btn danger wide" onClick={() => setConfirmWipe(true)}>
            Lokale kluis wissen
          </button>
        </>
      )}

      <p className="tiny muted center" style={{ marginTop: 26 }}>
        Camp · build {typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'}
      </p>

      {showShares && (
        <Sheet title="Alles wat je deelt" onClose={() => setShowShares(false)}>
          {!shares.length && <Note tone="info">Je deelt op dit moment niets.</Note>}
          {shares.map((share) => {
            const status = shareStatus(share);
            return (
              <div className="card tight" key={share.id}>
                <div className="row">
                  <div className="grow">
                    <div className="strong small truncate">
                      {share.camp_spots?.name || 'Verwijderde plek'}
                    </div>
                    <div className="tiny muted">
                      {share.kind === 'link' ? '🔗 link' : share.kind === 'user' ? '👤 vriend' : '👥 groep'}
                      {' · '}{precisionLabel(share.precision)}
                      {' · '}{share.view_count}× bekeken
                      {share.label && ` · ${share.label}`}
                    </div>
                  </div>
                  <span className={`chip readonly tiny tone-${status.tone}`}>{status.label}</span>
                </div>
                {!share.revoked_at && (
                  <button
                    className="btn sm danger wide"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      await revokeShare(share.id);
                      setShares(await listAllShares());
                    }}
                  >
                    Intrekken
                  </button>
                )}
              </div>
            );
          })}
        </Sheet>
      )}

      {showInvites && (
        <InviteSheet
          invites={invites}
          onClose={() => setShowInvites(false)}
          onChanged={async () => setInvites(await listInvites())}
        />
      )}

      {confirmWipe && (
        <Confirm
          title="Lokale kluis wissen?"
          body="Alle plekken die alleen in deze browser staan verdwijnen. Exporteer eerst als je ze wilt houden."
          confirmLabel="Wissen"
          onConfirm={() => {
            localStorage.removeItem('camp:vault:v1');
            window.location.reload();
          }}
          onClose={() => setConfirmWipe(false)}
        />
      )}
    </>
  );
}


/**
 * Uitnodigingen beheren. De code is maar één keer zichtbaar: daarna staat er
 * alleen nog een hash in de database, net als bij een deel-link.
 */
function InviteSheet({ invites, onClose, onChanged }) {
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const maak = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createInvite({
        label: label.trim(),
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setFresh(url);
      setLabel('');
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Mensen uitnodigen" onClose={onClose}>
      {error && <Note tone="bad">{error}</Note>}

      {fresh ? (
        <>
          <Note tone="good">
            Klaar. <strong>Stuur hem nu door</strong> — de code staat nergens meer leesbaar
            opgeslagen, ook niet in de database.
          </Note>
          <div className="share-link">
            <span className="url">{fresh}</span>
            <button
              className="btn sm primary"
              onClick={async () => {
                setCopied(await copyText(fresh));
                setTimeout(() => setCopied(false), 2200);
              }}
            >
              {copied ? '✓' : 'Kopieer'}
            </button>
          </div>
          <button className="btn wide" style={{ marginTop: 12 }} onClick={() => setFresh(null)}>
            Nog een uitnodiging
          </button>
        </>
      ) : (
        <>
          <Note tone="info">
            De voorpagina biedt geen aanmelden aan, dus niemand loopt er per ongeluk tegenaan.
            Wie deze link krijgt, kan wel een account maken.
          </Note>

          <Field label="Voor wie?" hint="Alleen voor jezelf, om ze uit elkaar te houden.">
            <input
              className="input"
              value={label}
              placeholder="Jasper"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>

          <div className="row" style={{ gap: 10 }}>
            <Field label="Hoe vaak bruikbaar">
              <input
                className="input"
                type="number"
                min="1"
                value={maxUses}
                placeholder="onbeperkt"
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </Field>
            <Field label="Verloopt op">
              <input
                className="input"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
          </div>

          <button className="btn primary wide" onClick={maak} disabled={busy}>
            {busy ? <span className="spinner" /> : '✉️'} Uitnodiging maken
          </button>
        </>
      )}

      {invites.length > 0 && <div className="section-title">Uitgedeeld</div>}
      {invites.map((invite) => {
        const status = inviteStatus(invite);
        return (
          <div className="card tight" key={invite.id}>
            <div className="row">
              <div className="grow">
                <div className="strong small truncate">{invite.label || 'Zonder naam'}</div>
                <div className="tiny muted">
                  {invite.used_count}× gebruikt
                  {invite.max_uses ? ` van ${invite.max_uses}` : ''}
                </div>
              </div>
              <span className={`chip readonly tiny tone-${status.tone}`}>{status.label}</span>
            </div>
            {!invite.revoked_at && (
              <button
                className="btn sm danger wide"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  await revokeInvite(invite.id);
                  onChanged();
                }}
              >
                Intrekken
              </button>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}
