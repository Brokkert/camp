// Bestanden en links in en uit: GPX, KML, GeoJSON, en de kaart-apps op je
// telefoon. Bewust zonder afhankelijkheden — het zijn maar een paar formaten
// en de browser heeft al een XML-parser.

import { parseCoordinates } from './coords.js';

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// --- exporteren -------------------------------------------------------------

function spotDescription(spot) {
  return [
    spot.notes,
    spot.access && `Aankomst: ${spot.access}`,
    spot.tags?.length && `Kenmerken: ${spot.tags.join(', ')}`,
    spot.rating && `Waardering: ${'★'.repeat(spot.rating)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function toGpx(spots, { name = 'Camp' } = {}) {
  const points = spots
    .map(
      (s) => `  <wpt lat="${s.lat}" lon="${s.lng}">
    <name>${escapeXml(s.name)}</name>
    <desc>${escapeXml(spotDescription(s))}</desc>
${s.elevation != null ? `    <ele>${s.elevation}</ele>\n` : ''}    <sym>Campground</sym>
  </wpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Camp" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name></metadata>
${points}
</gpx>`;
}

export function toKml(spots, { name = 'Camp' } = {}) {
  const places = spots
    .map(
      (s) => `    <Placemark>
      <name>${escapeXml(s.name)}</name>
      <description>${escapeXml(spotDescription(s))}</description>
      <Point><coordinates>${s.lng},${s.lat}${s.elevation != null ? `,${s.elevation}` : ''}</coordinates></Point>
    </Placemark>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
${places}
  </Document>
</kml>`;
}

export function toGeoJson(spots) {
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        name: s.name,
        kind: s.kind,
        notes: s.notes,
        access: s.access,
        tags: s.tags,
        rating: s.rating,
        elevation: s.elevation,
      },
    })),
  };
}

// --- importeren -------------------------------------------------------------

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Dit bestand is geen geldige XML.');
  return doc;
}

const textOf = (node, tag) => node.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

function fromGpx(text) {
  const doc = parseXml(text);
  const found = [];
  // Losse waypoints, en ook de punten van een track of route — sommige apps
  // exporteren een opgeslagen plek als een track van één punt.
  for (const tag of ['wpt', 'trkpt', 'rtept']) {
    for (const node of doc.getElementsByTagName(tag)) {
      const lat = parseFloat(node.getAttribute('lat'));
      const lng = parseFloat(node.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const elevation = parseFloat(textOf(node, 'ele'));
      found.push({
        name: textOf(node, 'name') || 'Zonder naam',
        notes: textOf(node, 'desc') || textOf(node, 'cmt'),
        lat,
        lng,
        elevation: Number.isFinite(elevation) ? elevation : null,
      });
    }
  }
  return found;
}

function fromKml(text) {
  const doc = parseXml(text);
  const found = [];
  for (const place of doc.getElementsByTagName('Placemark')) {
    const raw = place.getElementsByTagName('coordinates')[0]?.textContent?.trim();
    if (!raw) continue;
    // KML is lengte,breedte[,hoogte] — precies andersom als de rest.
    const [lng, lat, elevation] = raw.split(/\s+/)[0].split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    found.push({
      name: textOf(place, 'name') || 'Zonder naam',
      notes: textOf(place, 'description'),
      lat,
      lng,
      elevation: Number.isFinite(elevation) ? elevation : null,
    });
  }
  return found;
}

function fromGeoJson(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  const features = data.type === 'FeatureCollection' ? data.features : [data];
  return features
    .filter((f) => f?.geometry?.type === 'Point')
    .map((f) => {
      const [lng, lat, elevation] = f.geometry.coordinates;
      const props = f.properties || {};
      return {
        name: props.name || props.title || 'Zonder naam',
        notes: props.notes || props.description || '',
        access: props.access || '',
        tags: Array.isArray(props.tags) ? props.tags : [],
        kind: props.kind,
        rating: props.rating ?? null,
        lat,
        lng,
        elevation: Number.isFinite(elevation) ? elevation : (props.elevation ?? null),
      };
    })
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

/**
 * Leest GPX, KML of GeoJSON en geeft een lijst plekken terug. Het formaat
 * wordt aan de inhoud herkend, niet aan de bestandsnaam — die klopt lang niet
 * altijd.
 */
export function importSpots(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return fromGeoJson(trimmed);
  if (/<gpx[\s>]/i.test(trimmed)) return fromGpx(trimmed);
  if (/<kml[\s>]/i.test(trimmed)) return fromKml(trimmed);

  // Geen bestand maar geplakte tekst: probeer er per regel een coordinaat uit
  // te halen, met wat ervoor staat als naam.
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const found = [];
  for (const line of lines) {
    const point = parseCoordinates(line);
    if (!point) continue;
    const name = line.split(/[,;\t]/)[0].replace(/-?\d+[.,]\d+.*/, '').trim();
    found.push({ name: name || 'Zonder naam', lat: point.lat, lng: point.lng, notes: '' });
  }
  return found;
}

// --- naar buiten -------------------------------------------------------------

/** Links naar de kaart-apps. geo: pakt op Android de app die je zelf koos. */
export function mapLinks(lat, lng, label = 'Kampeerplek') {
  const q = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(label)}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
    geo: `geo:${q}?q=${q}(${encodeURIComponent(label)})`,
    organicMaps: `om://map?v=1&ll=${q}&n=${encodeURIComponent(label)}`,
  };
}

/** Gratis QR-dienst, dezelfde als CATANIA gebruikt. */
export function qrCodeUrl(text, { size = 320 } = {}) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(text)}`;
}

export function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
