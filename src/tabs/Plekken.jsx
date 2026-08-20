import { useMemo, useState } from 'react';
import { Empty, TagList } from '../components/ui.jsx';
import { kindOf, SPOT_KINDS } from '../data/taxonomy.js';
import { distanceMeters, formatDistance } from '../lib/coords.js';

const SORTS = [
  { id: 'recent', label: 'Nieuwste' },
  { id: 'naam', label: 'Naam' },
  { id: 'beste', label: 'Best beoordeeld' },
  { id: 'dichtbij', label: 'Dichtstbij' },
];

export default function Plekken({ spots, onOpen, onNew, here }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('recent');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = spots.filter((s) => !s.archived);

    if (needle) {
      list = list.filter((s) =>
        [s.name, s.notes, s.access, ...(s.tags || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      );
    }
    if (kind) list = list.filter((s) => s.kind === kind);

    const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
    return [...list].sort((a, b) => {
      if (sort === 'naam') return byName(a, b);
      if (sort === 'beste') return (b.rating || 0) - (a.rating || 0) || byName(a, b);
      if (sort === 'dichtbij' && here) {
        return distanceMeters(here, a) - distanceMeters(here, b);
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [spots, query, kind, sort, here]);

  if (!spots.length) {
    return (
      <>
        <Empty art="🏕️" title="Nog geen plekken">
          Tik op de knop rechtsonder om je eerste plek te bewaren. Of ga naar Meer om een GPX- of
          KML-bestand te importeren dat je al hebt liggen.
        </Empty>
        <button className="fab" onClick={onNew} aria-label="Nieuwe plek">
          +
        </button>
      </>
    );
  }

  return (
    <>
      <input
        className="input"
        placeholder="Zoek op naam, notitie of kenmerk…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <div className="filterbar">
        <button className={`chip${!kind ? ' on' : ''}`} onClick={() => setKind('')}>
          Alles
        </button>
        {SPOT_KINDS.filter((k) => spots.some((s) => s.kind === k.id)).map((k) => (
          <button
            key={k.id}
            className={`chip${kind === k.id ? ' on' : ''}`}
            onClick={() => setKind(kind === k.id ? '' : k.id)}
          >
            {k.emoji} {k.label}
          </button>
        ))}
      </div>

      <div className="filterbar" style={{ paddingTop: 0 }}>
        {SORTS.filter((s) => s.id !== 'dichtbij' || here).map((s) => (
          <button
            key={s.id}
            className={`chip${sort === s.id ? ' on' : ''}`}
            onClick={() => setSort(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!shown.length && (
        <Empty art="🔍" title="Niets gevonden">
          Geen plek die aan dit filter voldoet.
        </Empty>
      )}

      {shown.map((spot) => (
        <button className="card pressable" key={spot.id} onClick={() => onOpen(spot)}>
          <div className="spot-line">
            <div className="spot-emoji">{kindOf(spot.kind).emoji}</div>
            <div className="grow">
              <div className="placename truncate">{spot.name}</div>
              <div className="tiny muted">
                {spot.rating > 0 && <span style={{ color: 'var(--ember)' }}>{'★'.repeat(spot.rating)} </span>}
                {here && `${formatDistance(distanceMeters(here, spot))} hiervandaan`}
                {!here && spot.elevation != null && `${Math.round(spot.elevation)} m hoog`}
              </div>
            </div>
          </div>
          {spot.notes && (
            <p className="small muted truncate" style={{ margin: '9px 0 0' }}>
              {spot.notes}
            </p>
          )}
          {spot.tags?.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <TagList tags={spot.tags} limit={4} />
            </div>
          )}
        </button>
      ))}

      <button className="fab" onClick={onNew} aria-label="Nieuwe plek">
        +
      </button>
    </>
  );
}
