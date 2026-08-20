import { useState } from 'react';
import MapView from '../components/MapView.jsx';

/**
 * De kaart met alles erop: je eigen plekken in oker, wat met jou gedeeld is in
 * blauw (met een cirkel eromheen als het vervaagd is).
 */
export default function Kaart({ spots, shared, onOpen, onDrop, follow, here }) {
  const [dropping, setDropping] = useState(false);

  const alles = [
    ...spots.map((s) => ({ ...s, shared: false })),
    ...shared.map((s) => ({ ...s, id: `gedeeld-${s.share_id}`, shared: true })),
  ];

  const handlePick = (point) => {
    if (!dropping) return;
    setDropping(false);
    onDrop(point);
  };

  return (
    <>
      <MapView
        spots={alles}
        fit={alles}
        here={here}
        onPick={handlePick}
        onSelect={(spot) => !dropping && onOpen(spot)}
        follow={follow}
        hint={dropping ? 'Tik op de plek waar je stond' : null}
      />
      <button
        className="fab"
        onClick={() => setDropping((v) => !v)}
        aria-label={dropping ? 'Annuleren' : 'Plek op de kaart zetten'}
        style={dropping ? { background: 'var(--danger)', color: '#fff' } : undefined}
      >
        {dropping ? '✕' : '+'}
      </button>
    </>
  );
}
