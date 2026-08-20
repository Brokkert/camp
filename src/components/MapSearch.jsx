import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../lib/search.js';

/**
 * Zoekbalk over de kaart. Ingeklapt is het één knopje, want op een telefoon is
 * schermruimte kaartruimte.
 *
 * Wat je kiest gaat naar onChoose; de kaart beslist zelf wat daarmee gebeurt —
 * op het overzicht alleen ernaartoe vliegen, in het plek-formulier ook het
 * coordinaat overnemen.
 */
export default function MapSearch({ near = null, onChoose, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const controller = useRef(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setError(null);
      setBusy(false);
      return;
    }

    // Wachten tot je even ophoudt met typen, en het vorige verzoek afbreken.
    // Anders stuur je een verzoek per toetsaanslag en komen antwoorden ook nog
    // eens door elkaar binnen.
    setBusy(true);
    const timer = setTimeout(async () => {
      controller.current?.abort();
      controller.current = new AbortController();
      try {
        const gevonden = await searchPlaces(term, {
          near,
          signal: controller.current.signal,
        });
        setResults(gevonden);
        setError(gevonden.length ? null : 'Niets gevonden.');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setResults([]);
        setError('Zoeken lukt nu niet. Je kunt wel coördinaten plakken.');
      } finally {
        setBusy(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, near]);

  useEffect(() => () => controller.current?.abort(), []);

  const kies = (plek) => {
    onChoose(plek);
    onClose();
  };

  return (
    <div className="map-search">
      <div className="map-search-bar">
        <input
          ref={input}
          className="input"
          value={query}
          placeholder="Zoek een plaats, streek of adres…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results.length) kies(results[0]);
          }}
        />
        <button className="btn ghost icon" onClick={onClose} aria-label="Sluiten">
          {busy ? <span className="spinner" /> : '✕'}
        </button>
      </div>

      {(results.length > 0 || error) && (
        <div className="map-search-results">
          {error && <div className="map-search-leeg">{error}</div>}
          {results.map((plek) => (
            <button
              key={`${plek.naam}-${plek.lat}-${plek.lng}`}
              className="map-search-hit"
              onClick={() => kies(plek)}
            >
              <span className="strong small">{plek.naam}</span>
              {plek.context && <span className="tiny muted">{plek.context}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
