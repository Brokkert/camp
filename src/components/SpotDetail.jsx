import { useEffect, useState } from 'react';
import MapView from './MapView.jsx';
import { Sheet, Note, Stars, TagList, Confirm, Field, copyText } from './ui.jsx';
import { formatDecimal, formatDms } from '../lib/coords.js';
import { kindOf, legalOf, MONTHS } from '../data/taxonomy.js';
import { mapLinks, toGpx, downloadFile } from '../lib/geo.js';
import { fetchForecast, fetchSun, weatherIcon } from '../lib/outdoors.js';
import { loadVisits, saveVisit, deleteVisit } from '../lib/vault.js';

const dayName = (iso) =>
  new Date(iso).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
const fullDate = (iso) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

function Forecast({ lat, lng }) {
  const [days, setDays] = useState(null);
  const [sun, setSun] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchForecast(lat, lng).then((d) => alive && setDays(d)).catch(() => alive && setFailed(true));
    fetchSun(lat, lng).then((s) => alive && setSun(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [lat, lng]);

  if (failed) return <div className="tiny muted">Het weer is nu niet op te halen.</div>;
  if (!days) return <span className="spinner" />;

  return (
    <>
      <div className="forecast">
        {days.map((day) => (
          <div className="day" key={day.date}>
            {dayName(day.date)}
            <span className="ico">{weatherIcon(day.code)}</span>
            <span className="t">{day.max}°</span>
            <div>{day.min}°</div>
          </div>
        ))}
      </div>
      {sun?.sunrise && (
        <div className="tiny muted" style={{ marginTop: 7 }}>
          🌅 {sun.sunrise} · 🌇 {sun.sunset}
        </div>
      )}
    </>
  );
}

function VisitForm({ spotId, visit, onSaved, onClose, user }) {
  const [draft, setDraft] = useState(
    () => visit || {
      spot_id: spotId,
      visited_on: new Date().toISOString().slice(0, 10),
      nights: 1,
      rating: null,
      companions: '',
      notes: '',
    }
  );
  const [busy, setBusy] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Sheet title={visit ? 'Bezoek bijwerken' : 'Bezoek toevoegen'} onClose={onClose}>
      <div className="row" style={{ gap: 10 }}>
        <Field label="Wanneer">
          <input
            className="input"
            type="date"
            value={draft.visited_on}
            onChange={(e) => set({ visited_on: e.target.value })}
          />
        </Field>
        <Field label="Nachten">
          <input
            className="input"
            type="number"
            min="1"
            value={draft.nights}
            onChange={(e) => set({ nights: Number(e.target.value) })}
          />
        </Field>
      </div>

      <Field label="Hoe was het">
        <Stars value={draft.rating} onChange={(rating) => set({ rating })} />
      </Field>

      <Field label="Met wie">
        <input
          className="input"
          value={draft.companions}
          placeholder="Jasper en Merel"
          onChange={(e) => set({ companions: e.target.value })}
        />
      </Field>

      <Field label="Hoe ging het">
        <textarea
          className="textarea"
          value={draft.notes}
          placeholder="Hele nacht uilen gehoord. Beek stond hoog."
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>

      <button
        className="btn primary wide"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await saveVisit(draft, user);
          onSaved();
          onClose();
        }}
      >
        {busy ? <span className="spinner" /> : null} Bewaren
      </button>
    </Sheet>
  );
}

export default function SpotDetail({ spot, onClose, onEdit, onShare, onDelete, user, canShare = true }) {
  const [visits, setVisits] = useState([]);
  const [editingVisit, setEditingVisit] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(null);

  const refreshVisits = () => loadVisits(spot.id, user).then(setVisits).catch(() => {});
  useEffect(() => {
    refreshVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id, user]);

  const kind = kindOf(spot.kind);
  const legal = legalOf(spot.legal);
  const links = mapLinks(spot.lat, spot.lng, spot.name);
  const nights = visits.reduce((sum, v) => sum + (v.nights || 0), 0);

  const copy = async (text, what) => {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    }
  };

  return (
    <Sheet
      title={spot.name}
      onClose={onClose}
      actions={
        <button className="btn ghost icon" onClick={() => onEdit(spot)} aria-label="Bewerken">
          ✏️
        </button>
      }
    >
      <div className="map-inline" style={{ marginBottom: 13 }}>
        <MapView
          className="map"
          spots={[spot]}
          center={[spot.lng, spot.lat]}
          zoom={14}
          follow={{ lat: spot.lat, lng: spot.lng, zoom: 14, instant: true }}
          interactive={false}
        />
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        <span className="chip readonly">{kind.emoji} {kind.label}</span>
        <span className={`chip readonly tone-${legal.tone}`}>{legal.emoji} {legal.label}</span>
        {spot.elevation != null && <span className="chip readonly">⛰️ {Math.round(spot.elevation)} m</span>}
        {spot.capacity && <span className="chip readonly">⛺ {spot.capacity}</span>}
      </div>

      {spot.rating > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Stars value={spot.rating} readOnly />
        </div>
      )}

      {canShare ? (
        <button className="btn primary wide" onClick={() => onShare(spot)} style={{ marginBottom: 12 }}>
          🔗 Deze plek delen
        </button>
      ) : (
        <Note tone="info">
          Delen werkt pas met een account: de vervaging gebeurt op de server, juist zodat de exacte
          plek daar blijft. Log in bij <strong>Meer</strong>, dan kun je je plekken meenemen.
        </Note>
      )}

      <div className="card tight" style={{ marginBottom: 12 }}>
        <div className="row">
          <div className="grow mono truncate">{formatDecimal(spot.lat, spot.lng)}</div>
          <button className="btn sm ghost" onClick={() => copy(formatDecimal(spot.lat, spot.lng), 'dec')}>
            {copied === 'dec' ? '✓' : 'Kopieer'}
          </button>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <div className="grow tiny muted truncate">{formatDms(spot.lat, spot.lng)}</div>
          <button className="btn sm ghost" onClick={() => copy(formatDms(spot.lat, spot.lng), 'dms')}>
            {copied === 'dms' ? '✓' : 'Kopieer'}
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          <a className="btn sm" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
          <a className="btn sm" href={links.osm} target="_blank" rel="noreferrer">OSM</a>
          <a className="btn sm" href={links.geo}>Navigatie-app</a>
          <button
            className="btn sm"
            onClick={() => downloadFile(`${spot.name}.gpx`, toGpx([spot]), 'application/gpx+xml')}
          >
            GPX
          </button>
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

      <div className="section-title">Het weer daar</div>
      <Forecast lat={spot.lat} lng={spot.lng} />

      <div className="section-title">
        Logboek {visits.length > 0 && <span className="muted">· {visits.length}× · {nights} nachten</span>}
      </div>
      {visits.map((visit) => (
        <div className="card tight" key={visit.id}>
          <div className="row">
            <div className="grow">
              <div className="small strong">{fullDate(visit.visited_on)}</div>
              <div className="tiny muted">
                {visit.nights} {visit.nights === 1 ? 'nacht' : 'nachten'}
                {visit.companions && ` · met ${visit.companions}`}
              </div>
            </div>
            {visit.rating > 0 && <span className="tiny" style={{ color: 'var(--ember)' }}>{'★'.repeat(visit.rating)}</span>}
          </div>
          {visit.notes && (
            <p className="small muted" style={{ margin: '7px 0 0', lineHeight: 1.55 }}>{visit.notes}</p>
          )}
          <div className="row" style={{ gap: 7, marginTop: 8 }}>
            <button className="btn sm ghost" onClick={() => setEditingVisit(visit)}>Bewerken</button>
            <button
              className="btn sm ghost danger"
              onClick={async () => {
                await deleteVisit(visit.id, user);
                refreshVisits();
              }}
            >
              Verwijderen
            </button>
          </div>
        </div>
      ))}
      <button className="btn wide" onClick={() => setEditingVisit({})} style={{ marginTop: 4 }}>
        + Bezoek toevoegen
      </button>

      <div className="section-title">Gevaarlijke knoppen</div>
      <button className="btn danger wide" onClick={() => setConfirming(true)}>
        Deze plek verwijderen
      </button>

      {editingVisit && (
        <VisitForm
          spotId={spot.id}
          visit={editingVisit.id ? editingVisit : null}
          user={user}
          onSaved={refreshVisits}
          onClose={() => setEditingVisit(null)}
        />
      )}

      {confirming && (
        <Confirm
          title="Plek verwijderen?"
          body={`"${spot.name}" en het bijbehorende logboek verdwijnen. Lopende deel-links werken meteen niet meer. Dit kan niet ongedaan gemaakt worden.`}
          onConfirm={() => {
            onDelete(spot.id);
            onClose();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </Sheet>
  );
}
