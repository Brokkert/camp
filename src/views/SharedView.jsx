import { useEffect, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { Note, Field, TagList, copyText } from '../components/ui.jsx';
import { openShare, SHARE_ERRORS } from '../lib/sharing.js';
import { formatDecimal, formatDistance } from '../lib/coords.js';
import { kindOf, MONTHS } from '../data/taxonomy.js';
import { mapLinks } from '../lib/geo.js';
import { precisionLabel } from '../lib/fuzz.js';

/**
 * Wat iemand ziet die op je geheime link klikt. Geen account nodig, geen
 * navigatiebalk — alleen deze ene plek, precies zoals jij hem hebt vrijgegeven.
 */
export default function SharedView({ token, onLeave }) {
  const [state, setState] = useState({ status: 'laden' });
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const attempt = async (pass = null) => {
    setBusy(true);
    try {
      const result = await openShare(token, pass);
      if (result?.ok) setState({ status: 'ok', spot: result.spot });
      else if (result?.error === 'needs_pass' || result?.error === 'wrong_pass')
        setState({ status: 'wachtwoord', error: result.error === 'wrong_pass' ? SHARE_ERRORS.wrong_pass : null });
      else setState({ status: 'fout', error: SHARE_ERRORS[result?.error] || 'Deze link werkt niet.' });
    } catch (e) {
      setState({ status: 'fout', error: e.message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    attempt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state.status === 'laden') {
    return (
      <div className="login-wrap center">
        <span className="spinner" />
      </div>
    );
  }

  if (state.status === 'wachtwoord') {
    return (
      <div className="login-wrap">
        <div className="logo">🔐</div>
        <h1>Camp</h1>
        <p className="tag">Er hoort een wachtwoord bij deze plek.</p>
        {state.error && <Note tone="bad">{state.error}</Note>}
        <Field label="Wachtwoord">
          <input
            className="input"
            value={passphrase}
            autoFocus
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && attempt(passphrase)}
          />
        </Field>
        <button className="btn primary wide" onClick={() => attempt(passphrase)} disabled={busy || !passphrase}>
          {busy ? <span className="spinner" /> : null} Openen
        </button>
      </div>
    );
  }

  if (state.status === 'fout') {
    return (
      <div className="login-wrap">
        <div className="logo">🥀</div>
        <h1>Camp</h1>
        <Note tone="bad">{state.error}</Note>
        <button className="btn wide" onClick={onLeave}>Naar Camp</button>
      </div>
    );
  }

  const spot = state.spot;
  const kind = kindOf(spot.kind);
  const links = mapLinks(spot.lat, spot.lng, spot.name);
  const zoom = spot.radius_m ? Math.max(8, 15 - Math.log2(spot.radius_m / 60)) : 14;

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          <span className="brandmark">⛺</span> Camp
        </h1>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={onLeave}>Zelf gebruiken</button>
      </div>

      <div className="main">
        <div className="map-inline" style={{ height: 260, marginBottom: 14 }}>
          <MapView
            className="map"
            spots={[{ ...spot, id: 'gedeeld', shared: true }]}
            center={[spot.lng, spot.lat]}
            zoom={zoom}
            follow={{ lat: spot.lat, lng: spot.lng, zoom, instant: true }}
          />
        </div>

        <h2 style={{ margin: '0 0 4px', fontSize: 21 }}>{spot.name}</h2>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          gedeeld door {spot.owner?.emoji} {spot.owner?.name || spot.owner?.handle}
        </p>

        {spot.radius_m > 0 ? (
          <Note tone="info">
            Dit is bewust een <strong>vervaagde</strong> plek ({precisionLabel(spot.precision)}). De
            echte ligt ergens binnen die cirkel van ±{formatDistance(spot.radius_m)} — waar precies,
            is niet meegestuurd.
          </Note>
        ) : (
          <Note tone="warn">
            Je hebt de <strong>precieze</strong> plek gekregen. Dat is vertrouwen; laat het achter
            zoals je het aantrof en stuur hem niet zomaar door.
          </Note>
        )}

        <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
          <span className="chip readonly">{kind.emoji} {kind.label}</span>
          {spot.elevation != null && <span className="chip readonly">⛰️ {Math.round(spot.elevation)} m</span>}
          {spot.capacity && <span className="chip readonly">⛺ {spot.capacity}</span>}
          {spot.rating > 0 && (
            <span className="chip readonly" style={{ color: 'var(--ember)' }}>{'★'.repeat(spot.rating)}</span>
          )}
        </div>

        <div className="card tight">
          <div className="row">
            <div className="grow mono truncate">{formatDecimal(spot.lat, spot.lng)}</div>
            <button
              className="btn sm ghost"
              onClick={async () => {
                setCopied(await copyText(formatDecimal(spot.lat, spot.lng)));
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? '✓' : 'Kopieer'}
            </button>
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 9 }}>
            <a className="btn sm" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
            <a className="btn sm" href={links.osm} target="_blank" rel="noreferrer">OSM</a>
            <a className="btn sm" href={links.geo}>Navigatie-app</a>
          </div>
        </div>

        {spot.notes && (
          <>
            <div className="section-title">Notities</div>
            <p className="small" style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{spot.notes}</p>
          </>
        )}
        {spot.access && (
          <>
            <div className="section-title">Aankomst</div>
            <p className="small" style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{spot.access}</p>
          </>
        )}
        {spot.photos?.length > 0 && (
          <>
            <div className="section-title">Foto's</div>
            <div className="photo-strip">
              {spot.photos.map((photo) => (
                <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt="" />
                </a>
              ))}
            </div>
          </>
        )}
        {spot.tags?.length > 0 && (
          <>
            <div className="section-title">Kenmerken</div>
            <TagList tags={spot.tags} />
          </>
        )}
        {spot.best_months?.length > 0 && (
          <>
            <div className="section-title">Beste maanden</div>
            <div className="chips">
              {spot.best_months.map((m) => (
                <span className="chip readonly tiny" key={m}>{MONTHS[m - 1]}</span>
              ))}
            </div>
          </>
        )}
        {spot.visits?.length > 0 && (
          <>
            <div className="section-title">Logboek</div>
            {spot.visits.map((visit, i) => (
              <div className="card tight" key={i}>
                <div className="small strong">
                  {new Date(visit.visited_on).toLocaleDateString('nl-NL', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </div>
                {visit.notes && <p className="small muted" style={{ margin: '6px 0 0' }}>{visit.notes}</p>}
              </div>
            ))}
          </>
        )}

        {spot.expires_at && (
          <p className="tiny muted center" style={{ marginTop: 22 }}>
            Deze link verloopt op{' '}
            {new Date(spot.expires_at).toLocaleDateString('nl-NL', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}.
          </p>
        )}
      </div>
    </div>
  );
}
