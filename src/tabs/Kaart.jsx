import { useState } from 'react';
import MapView from '../components/MapView.jsx';

/**
 * De kaart met alles erop: je eigen plekken in oker, wat met jou gedeeld is in
 * blauw (met een cirkel eromheen als het vervaagd is).
 */
export default function Kaart({ spots, shared, onOpen, onDrop, follow, here, onLocated }) {
  const [dropping, setDropping] = useState(false);

  /**
   * Sta je ergens en weten we dat, dan is nog een keer op de kaart tikken
   * onzin: dan bedoel je vrijwel altijd de plek waar je nu bent. Alleen als we
   * je positie niet kennen vragen we je hem aan te wijzen.
   *
   * Het punt is in het formulier nog te verslepen, dus je zit er niet aan vast.
   */
  const nieuwePlek = () => {
    if (dropping) {
      setDropping(false);
      return;
    }
    if (here) {
      onDrop(here);
      return;
    }
    setDropping(true);
  };

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
        onLocated={onLocated}
        hint={dropping ? 'Tik op de plek waar je stond' : null}
      />
      <button
        className="fab"
        onClick={nieuwePlek}
        aria-label={dropping ? 'Annuleren' : 'Plek op de kaart zetten'}
        style={dropping ? { background: 'var(--danger)', color: '#fff' } : undefined}
      >
        {dropping ? '✕' : '+'}
      </button>
    </>
  );
}
