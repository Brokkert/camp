import { useState } from 'react';
import MapView from '../components/MapView.jsx';
import { Empty, Sheet, Note, TagList } from '../components/ui.jsx';
import { kindOf, MONTHS } from '../data/taxonomy.js';
import { formatDecimal, formatDistance } from '../lib/coords.js';
import { precisionLabel } from '../lib/fuzz.js';
import { mapLinks } from '../lib/geo.js';

/** Wat vrienden met jou gedeeld hebben. Kan vervaagd zijn — dat zeggen we erbij. */
export default function Gedeeld({ shared, loading }) {
  const [open, setOpen] = useState(null);

  if (loading) return <div className="center" style={{ padding: 40 }}><span className="spinner" /></div>;

  if (!shared.length) {
    return (
      <Empty art="🤝" title="Nog niets gedeeld met jou">
        Zodra een vriend een plek met je deelt, staat hij hier. Voeg iemand toe bij Mensen, of vraag
        of ze je een geheime link sturen.
      </Empty>
    );
  }

  return (
    <>
      {shared.map((spot) => {
        const kind = kindOf(spot.kind);
        return (
          <button className="card pressable" key={spot.share_id} onClick={() => setOpen(spot)}>
            <div className="spot-line">
              <div className="spot-emoji">{kind.emoji}</div>
              <div className="grow">
                <div className="strong truncate">{spot.name}</div>
                <div className="tiny muted">
                  van {spot.owner?.emoji} {spot.owner?.name || spot.owner?.handle}
                  {' · '}
                  {spot.radius_m > 0
                    ? `${precisionLabel(spot.precision)} (±${formatDistance(spot.radius_m)})`
                    : 'precies'}
                </div>
              </div>
            </div>
            {spot.notes && (
              <p className="small muted truncate" style={{ margin: '9px 0 0' }}>{spot.notes}</p>
            )}
          </button>
        );
      })}

      {open && <SharedSpotSheet spot={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function SharedSpotSheet({ spot, onClose }) {
  const kind = kindOf(spot.kind);
  const links = mapLinks(spot.lat, spot.lng, spot.name);

  return (
    <Sheet title={spot.name} onClose={onClose}>
      <div className="map-inline" style={{ marginBottom: 13 }}>
        <MapView
          className="map"
          spots={[{ ...spot, id: spot.share_id, shared: true }]}
          center={[spot.lng, spot.lat]}
          zoom={spot.radius_m ? Math.max(8, 15 - Math.log2(spot.radius_m / 60)) : 14}
          follow={{
            lat: spot.lat,
            lng: spot.lng,
            zoom: spot.radius_m ? Math.max(8, 15 - Math.log2(spot.radius_m / 60)) : 14,
            instant: true,
          }}
          interactive={false}
        />
      </div>

      {spot.radius_m > 0 ? (
        <Note tone="info">
          Dit is een <strong>vervaagde</strong> plek. De echte ligt ergens binnen die cirkel van
          ±{formatDistance(spot.radius_m)}. Wie hem deelde, heeft bewust niet de precieze plek
          gegeven.
        </Note>
      ) : (
        <Note tone="good">Je hebt de precieze plek gekregen. Ga er zuinig mee om.</Note>
      )}

      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        <span className="chip readonly">{kind.emoji} {kind.label}</span>
        <span className="chip readonly">
          {spot.owner?.emoji} {spot.owner?.name || spot.owner?.handle}
        </span>
        {spot.elevation != null && <span className="chip readonly">⛰️ {Math.round(spot.elevation)} m</span>}
        {spot.rating > 0 && (
          <span className="chip readonly" style={{ color: 'var(--ember)' }}>{'★'.repeat(spot.rating)}</span>
        )}
      </div>

      <div className="card tight" style={{ marginBottom: 12 }}>
        <div className="mono truncate">{formatDecimal(spot.lat, spot.lng)}</div>
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
          <div className="section-title">Logboek van de eigenaar</div>
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
    </Sheet>
  );
}
