import { useEffect, useState } from 'react';
import MapView from './MapView.jsx';
import { Field, Sheet, Note, copyText } from './ui.jsx';
import { PRECISION_LEVELS, PRECISION_RADIUS, previewFuzz, precisionLabel } from '../lib/fuzz.js';
import {
  createLinkShare, listShares, revokeShare, deleteShare,
  shareWithUser, shareWithCircle, shareStatus,
} from '../lib/sharing.js';
import { qrCodeUrl } from '../lib/geo.js';
import { listFriends, listCircles } from '../lib/social.js';
import { formatDistance } from '../lib/coords.js';

const dutchDate = (value) =>
  value ? new Date(value).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Kiezer voor de nauwkeurigheid, met een kaartje dat toont wat het betekent. */
function PrecisionPicker({ spot, value, onChange }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let alive = true;
    previewFuzz(spot, value).then((p) => alive && setPreview(p));
    return () => {
      alive = false;
    };
  }, [spot, value]);

  return (
    <>
      <div className="precision-list">
        {PRECISION_LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            className={`precision${value === level.id ? ' on' : ''}`}
            onClick={() => onChange(level.id)}
          >
            <span className="dot" />
            <span>
              <span className="title">
                {level.label} <em>{level.short}</em>
              </span>
              <span className="blurb">{level.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      {preview && (
        <div style={{ marginTop: 11 }}>
          <div className="tiny muted" style={{ marginBottom: 6 }}>
            Zo ziet de ontvanger het:
          </div>
          <div className="map-inline">
            <MapView
              className="map"
              interactive={false}
              spots={[
                {
                  id: 'preview',
                  name: spot.name,
                  kind: spot.kind,
                  lat: preview.lat,
                  lng: preview.lng,
                  radius_m: preview.radius,
                  shared: true,
                },
              ]}
              center={[preview.lng, preview.lat]}
              zoom={preview.radius ? Math.max(8, 15 - Math.log2(preview.radius / 60)) : 14}
              follow={{
                lat: preview.lat,
                lng: preview.lng,
                zoom: preview.radius ? Math.max(8, 15 - Math.log2(preview.radius / 60)) : 14,
                instant: true,
              }}
            />
          </div>
          <div className="hint">
            {preview.radius
              ? `De echte plek ligt ergens binnen die cirkel van ${formatDistance(preview.radius)}. ` +
                'Waar precies, blijft op de server.'
              : 'De ontvanger krijgt de plek tot op de meter.'}
          </div>
        </div>
      )}
    </>
  );
}

/** Nadat de link bestaat: dit is het enige moment dat je hem kunt kopieren. */
function FreshLink({ url, passphrase, onDone }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <Note tone="good">
        De link is klaar. <strong>Bewaar hem nu</strong> — hij staat nergens meer leesbaar
        opgeslagen, ook niet in de database.
      </Note>

      <div className="share-link">
        <span className="url">{url}</span>
        <button
          className="btn sm primary"
          onClick={async () => {
            setCopied(await copyText(url));
            setTimeout(() => setCopied(false), 2200);
          }}
        >
          {copied ? '✓' : 'Kopieer'}
        </button>
      </div>

      {passphrase && (
        <Note tone="warn">
          Het wachtwoord is <strong>{passphrase}</strong>. Stuur dat apart — anders staat het slot
          op dezelfde deur als de sleutel.
        </Note>
      )}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn grow" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Verberg QR' : '📱 QR-code'}
        </button>
        <button
          className="btn grow"
          onClick={() =>
            navigator.share?.({ title: 'Een kampeerplek', url }) ?? copyText(url)
          }
        >
          Delen…
        </button>
      </div>

      {showQr && <img className="qr" src={qrCodeUrl(url)} alt="QR-code naar de gedeelde plek" />}

      <button className="btn wide" style={{ marginTop: 12 }} onClick={onDone}>
        Klaar
      </button>
    </>
  );
}

export default function ShareSheet({ spot, onClose }) {
  // Zelf ophalen in plaats van doorgegeven krijgen. Stond dit aan de App, dan
  // was de lijst alleen gevuld als je toevallig eerst bij Mensen was geweest —
  // en zag je hier "nog geen vrienden" terwijl je vriendschap gewoon
  // geaccepteerd was.
  const [friends, setFriends] = useState([]);
  const [circles, setCircles] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [tab, setTab] = useState('link');
  const [precision, setPrecision] = useState('fine');
  const [passphrase, setPassphrase] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [showNotes, setShowNotes] = useState(true);
  const [showVisits, setShowVisits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState(null);
  const [existing, setExisting] = useState([]);
  const [target, setTarget] = useState('');

  const refresh = () => listShares(spot.id).then(setExisting).catch(() => {});
  // Let op: het effect mag de Promise niet teruggeven — React ziet dat als
  // opruimfunctie en roept hem aan bij het sluiten.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id]);

  const options = () => ({
    precision,
    passphrase: passphrase.trim() || null,
    label: label.trim(),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    maxViews: maxViews ? Number(maxViews) : null,
    showNotes,
    showPhotos: true,
    showVisits,
  });

  const makeLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createLinkShare(spot.id, options());
      setFresh({ url, passphrase: passphrase.trim() || null });
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const shareDirect = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const [kind, id] = target.split(':');
      if (kind === 'user') await shareWithUser(spot.id, id, options());
      else await shareWithCircle(spot.id, id, options());
      setTarget('');
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (fresh) {
    return (
      <Sheet title="Link klaar" onClose={onClose}>
        <FreshLink {...fresh} onDone={onClose} />
      </Sheet>
    );
  }

  const nameOf = (share) => {
    if (share.kind === 'link') return share.label || 'Geheime link';
    if (share.kind === 'user') {
      const friend = friends.find((f) => f.profile?.id === share.target_user_id);
      return friend?.profile?.display_name || friend?.profile?.handle || 'Een vriend';
    }
    const circle = circles.find((c) => c.id === share.target_circle_id);
    return circle ? `${circle.emoji} ${circle.name}` : 'Een groep';
  };

  return (
    <Sheet title={`"${spot.name}" delen`} onClose={onClose}>
      {error && <Note tone="bad">{error}</Note>}

      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={`chip${tab === 'link' ? ' on' : ''}`} onClick={() => setTab('link')}>
          🔗 Geheime link
        </button>
        <button className={`chip${tab === 'wie' ? ' on' : ''}`} onClick={() => setTab('wie')}>
          👥 Aan iemand
        </button>
        <button className={`chip${tab === 'beheer' ? ' on' : ''}`} onClick={() => setTab('beheer')}>
          ⚙️ Lopende shares {existing.length ? `(${existing.length})` : ''}
        </button>
      </div>

      {tab !== 'beheer' && (
        <Field label="Hoe precies mag het zijn?">
          <PrecisionPicker spot={spot} value={precision} onChange={setPrecision} />
        </Field>
      )}

      {tab === 'link' && (
        <>
          <Field label="Waarvoor is deze link?" hint="Alleen voor jezelf, om ze later uit elkaar te houden.">
            <input
              className="input"
              value={label}
              placeholder="Voor Jasper, weekend in mei"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>

          <Field
            label="Wachtwoord (mag leeg)"
            hint="Stuur het via een ander kanaal dan de link zelf."
          >
            <input
              className="input"
              value={passphrase}
              placeholder="ourthe"
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Field>

          <div className="row" style={{ gap: 10 }}>
            <Field label="Verloopt op">
              <input
                className="input"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
            <Field label="Max. keer te openen">
              <input
                className="input"
                type="number"
                min="1"
                placeholder="onbeperkt"
                value={maxViews}
                onChange={(e) => setMaxViews(e.target.value)}
              />
            </Field>
          </div>

          <label className="row small" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
            <span>Notities en aankomstbeschrijving meesturen</span>
          </label>
          <label className="row small" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={showVisits} onChange={(e) => setShowVisits(e.target.checked)} />
            <span>Mijn logboek meesturen</span>
          </label>

          <button className="btn primary wide" onClick={makeLink} disabled={busy}>
            {busy ? <span className="spinner" /> : '🔗'} Maak de link
          </button>
        </>
      )}

      {tab === 'wie' && (
        <>
          {loadingPeople ? (
            <div className="center" style={{ padding: 24 }}>
              <span className="spinner" />
            </div>
          ) : !friends.length && !circles.length ? (
            <Note tone="info">
              Nog geen vrienden of groepen. Voeg iemand toe bij <strong>Mensen</strong>, dan kun je
              rechtstreeks delen — dat blijft staan, ook als de link kwijtraakt. Een verzoek dat nog
              niet geaccepteerd is telt hier niet mee; tot die tijd gebruik je een geheime link.
            </Note>
          ) : (
            <>
              <Field label="Met wie?">
                <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Kies iemand of een groep…</option>
                  {circles.length > 0 && (
                    <optgroup label="Groepen">
                      {circles.map((c) => (
                        <option key={c.id} value={`circle:${c.id}`}>
                          {c.emoji} {c.name} ({c.members.length})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {friends.length > 0 && (
                    <optgroup label="Vrienden">
                      {friends.map((f) => (
                        <option key={f.id} value={`user:${f.profile?.id}`}>
                          {f.profile?.emoji} {f.profile?.display_name || f.profile?.handle}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>

              <label className="row small" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
                <span>Notities en aankomstbeschrijving meesturen</span>
              </label>

              <button className="btn primary wide" onClick={shareDirect} disabled={busy || !target}>
                {busy ? <span className="spinner" /> : '👥'} Delen
              </button>
            </>
          )}
        </>
      )}

      {tab === 'beheer' && (
        <>
          {!existing.length && (
            <Note tone="info">Deze plek is nog met niemand gedeeld.</Note>
          )}
          {existing.map((share) => {
            const status = shareStatus(share);
            return (
              <div className="card tight" key={share.id}>
                <div className="row">
                  <div className="grow">
                    <div className="strong small truncate">{nameOf(share)}</div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {precisionLabel(share.precision)}
                      {PRECISION_RADIUS[share.precision] > 0 &&
                        ` · ±${formatDistance(PRECISION_RADIUS[share.precision])}`}
                      {' · '}
                      {share.view_count}× bekeken
                      {share.max_views ? ` van ${share.max_views}` : ''}
                      {share.expires_at && ` · tot ${dutchDate(share.expires_at)}`}
                    </div>
                  </div>
                  <span className={`chip readonly tiny tone-${status.tone}`}>{status.label}</span>
                </div>
                <div className="row" style={{ gap: 7, marginTop: 9 }}>
                  {!share.revoked_at && (
                    <button
                      className="btn sm danger grow"
                      onClick={async () => {
                        await revokeShare(share.id);
                        refresh();
                      }}
                    >
                      Intrekken
                    </button>
                  )}
                  <button
                    className="btn sm ghost"
                    onClick={async () => {
                      await deleteShare(share.id);
                      refresh();
                    }}
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </Sheet>
  );
}
