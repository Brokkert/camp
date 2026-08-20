import { useEffect, useRef, useState } from 'react';
import MapView from './MapView.jsx';
import { Field, Sheet, Stars, TagPicker, MonthPicker, Note } from './ui.jsx';
import { parseCoordinates, formatDecimal, formatDms } from '../lib/coords.js';
import { SPOT_KINDS, LEGAL_STATES, emptySpot } from '../data/taxonomy.js';
import { fetchElevation } from '../lib/outdoors.js';
import { uploadPhoto, deletePhoto } from '../lib/photos.js';

/**
 * Het coordinaatveld. Je mag hier alles in kwijt: een Google Maps-link, DMS uit
 * een forumpost, of gewoon twee getallen. Wat er ook in gaat, er komt één punt
 * uit — en je ziet meteen op de kaart of dat het punt is dat je bedoelde.
 */
function CoordinateField({ lat, lng, onChange }) {
  const [raw, setRaw] = useState(() => (lat != null ? formatDecimal(lat, lng) : ''));
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // Van buitenaf gewijzigd (kaart aangetikt, GPS gebruikt)? Veld bijwerken.
  const lastApplied = useRef(null);
  useEffect(() => {
    if (lat == null) return;
    const formatted = formatDecimal(lat, lng);
    if (lastApplied.current !== formatted) {
      setRaw(formatted);
      lastApplied.current = formatted;
    }
  }, [lat, lng]);

  const apply = (text) => {
    setRaw(text);
    if (!text.trim()) {
      setStatus(null);
      return;
    }
    const point = parseCoordinates(text);
    if (point) {
      lastApplied.current = formatDecimal(point.lat, point.lng);
      setStatus({ tone: 'good', text: formatDms(point.lat, point.lng) });
      onChange(point);
    } else {
      setStatus({ tone: 'bad', text: 'Hier kan ik geen coordinaat in vinden.' });
    }
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      setStatus({ tone: 'bad', text: 'Deze browser geeft geen locatie door.' });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        apply(formatDecimal(point.lat, point.lng));
        setStatus({
          tone: 'good',
          text: `Hier sta je nu (±${Math.round(position.coords.accuracy)} m).`,
        });
      },
      () => {
        setBusy(false);
        setStatus({ tone: 'bad', text: 'Locatie ophalen lukte niet.' });
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const pasteFromClipboard = async () => {
    try {
      apply(await navigator.clipboard.readText());
    } catch {
      setStatus({ tone: 'bad', text: 'Plakken mag niet van de browser; gebruik het veld.' });
    }
  };

  return (
    <Field
      label="Waar precies?"
      hint="Plak gerust een Google Maps-link, graden/minuten/seconden of twee getallen — het wordt herkend."
    >
      <input
        className="input"
        value={raw}
        placeholder="50.20000, 5.50000"
        onChange={(e) => apply(e.target.value)}
        onBlur={() => {
          // Pas als je uit het veld klikt netjes opschrijven — tijdens het
          // typen zou dat half ingetikte getallen kapotmaken.
          const point = parseCoordinates(raw);
          if (point) setRaw(formatDecimal(point.lat, point.lng));
        }}
        inputMode="text"
        autoComplete="off"
      />
      <div className="row" style={{ marginTop: 7, gap: 7 }}>
        <button type="button" className="btn sm" onClick={useGps} disabled={busy}>
          {busy ? <span className="spinner" /> : '📍'} Hier sta ik
        </button>
        <button type="button" className="btn sm" onClick={pasteFromClipboard}>
          📋 Plakken
        </button>
      </div>
      {status && (
        <div className={`hint ${status.tone === 'bad' ? '' : 'mono'}`}
             style={{ color: status.tone === 'bad' ? 'var(--danger)' : 'var(--moss)' }}>
          {status.text}
        </div>
      )}
    </Field>
  );
}

export default function SpotForm({ spot, onSave, onClose, user }) {
  const [draft, setDraft] = useState(() => ({ ...emptySpot(), ...spot }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const hasPoint = Number.isFinite(draft.lat) && Number.isFinite(draft.lng);

  // Hoogte er automatisch bij zoeken; scheelt typen en zegt iets over hoe koud
  // het 's nachts wordt.
  useEffect(() => {
    if (!hasPoint || draft.elevation != null) return;
    let alive = true;
    fetchElevation(draft.lat, draft.lng)
      .then((meters) => alive && meters != null && set({ elevation: Math.round(meters) }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.lat, draft.lng]);

  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const added = [];
      for (const file of files) added.push(await uploadPhoto(file, user.id));
      set({ photos: [...(draft.photos || []), ...added] });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePhoto = async (photo) => {
    set({ photos: draft.photos.filter((p) => p.path !== photo.path) });
    deletePhoto(photo.path).catch(() => {});
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      setError('Geef de plek een naam, anders vind je hem straks niet terug.');
      return;
    }
    if (!hasPoint) {
      setError('Er hoort nog een coordinaat bij.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Sheet title={spot?.id ? 'Plek bewerken' : 'Nieuwe plek'} onClose={onClose}>
      {error && <Note tone="bad">{error}</Note>}

      <Field label="Naam">
        <input
          className="input"
          value={draft.name}
          placeholder="Beukenbos aan de Ourthe"
          onChange={(e) => set({ name: e.target.value })}
          autoFocus={!spot?.id}
        />
      </Field>

      <CoordinateField lat={draft.lat} lng={draft.lng} onChange={(p) => set(p)} />

      {hasPoint && (
        <div className="map-inline" style={{ marginBottom: 13 }}>
          <MapView
            className="map"
            spots={[{ ...draft, id: draft.id || 'concept' }]}
            center={[draft.lng, draft.lat]}
            zoom={13}
            follow={{ lat: draft.lat, lng: draft.lng, zoom: 13 }}
            onPick={(point) => set(point)}
            hint="Tik op de kaart om te verslepen"
          />
        </div>
      )}

      <Field label="Wat voor plek">
        <select className="select" value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
          {SPOT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.emoji} {k.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Hoe goed was het">
        <Stars value={draft.rating} onChange={(rating) => set({ rating })} />
      </Field>

      <Field label="Notities" hint="Wat je over een jaar vergeten bent.">
        <textarea
          className="textarea"
          value={draft.notes}
          placeholder="Vlak stukje achter de bocht, precies groot genoeg voor twee tentjes."
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>

      <Field label="Aankomst" hint="Waar je parkeert, welk hek, welk pad.">
        <textarea
          className="textarea"
          value={draft.access}
          placeholder="Parkeren bij de brug, dan 300 m over het bospad naar links."
          onChange={(e) => set({ access: e.target.value })}
        />
      </Field>

      <Field label="Kenmerken">
        <TagPicker value={draft.tags} onChange={(tags) => set({ tags })} />
      </Field>

      <Field label="Beste maanden">
        <MonthPicker value={draft.best_months} onChange={(m) => set({ best_months: m })} />
      </Field>

      <div className="row" style={{ gap: 10 }}>
        <Field label="Plek voor (tenten)">
          <input
            className="input"
            type="number"
            min="1"
            value={draft.capacity ?? ''}
            onChange={(e) => set({ capacity: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </Field>
        <Field label="Hoogte (m)">
          <input
            className="input"
            type="number"
            value={draft.elevation ?? ''}
            onChange={(e) => set({ elevation: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </Field>
      </div>

      <Field label="Mag je hier staan?" hint="Voor jezelf, zodat je het over een jaar nog weet.">
        <select className="select" value={draft.legal} onChange={(e) => set({ legal: e.target.value })}>
          {LEGAL_STATES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.emoji} {l.label}
            </option>
          ))}
        </select>
      </Field>

      {user && (
        <Field label="Foto's" hint="Worden verkleind voor het uploaden. Alleen zichtbaar bij een scherpe share.">
          <div className="photo-strip" style={{ marginBottom: 8 }}>
            {(draft.photos || []).map((photo) => (
              <div className="photo-slot" key={photo.path}>
                <img src={photo.url} alt="" />
                <button type="button" className="remove" onClick={() => removePhoto(photo)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => addPhotos([...e.target.files])}
          />
          <button type="button" className="btn sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : '📷'} Foto toevoegen
          </button>
        </Field>
      )}

      <button className="btn primary wide" onClick={submit} disabled={saving} style={{ marginTop: 8 }}>
        {saving ? <span className="spinner" /> : null} Bewaren
      </button>
    </Sheet>
  );
}
