// Exacte spiegeling van camp_fuzz_point() uit supabase/schema.sql.
//
// Waarom dubbel: het vervagen zelf gebeurt op de server, want dat is de enige
// plek waar het écht dicht is. Maar als jij een share instelt wil je zién wat
// de ander straks te zien krijgt. Dat kan alleen als de browser precies
// hetzelfde punt uitrekent — vandaar sha256 (dat kent WebCrypto) in plaats van
// md5, en dezelfde bit-truc met 7 hex-tekens.
//
// Blijft dit in de pas lopen? tests/fuzz.test.js vergelijkt tegen waarden die
// rechtstreeks uit PostgreSQL komen.

/** Straal in meters per nauwkeurigheid. Gelijk aan camp_precision_radius(). */
export const PRECISION_RADIUS = {
  exact: 0,
  fine: 250,
  area: 2000,
  region: 15000,
};

export const PRECISION_LEVELS = [
  {
    id: 'exact',
    label: 'Precies',
    short: 'precies',
    blurb: 'De echte plek, tot op de meter.',
    warn: 'Deze ontvanger kan er zo naartoe lopen.',
  },
  {
    id: 'fine',
    label: 'Ongeveer',
    short: '~250 m',
    blurb: 'Het juiste bosje, niet de juiste boom.',
    warn: 'Genoeg om het te vinden als je er toch bent.',
  },
  {
    id: 'area',
    label: 'De omgeving',
    short: '~2 km',
    blurb: 'Het dal of de vallei, niet de plek.',
    warn: 'Leuk om te laten zien, te grof om te gebruiken.',
  },
  {
    id: 'region',
    label: 'De streek',
    short: '~15 km',
    blurb: 'Alleen de hoek van de kaart.',
    warn: 'Puur om op te scheppen.',
  },
];

export function precisionLabel(id) {
  return PRECISION_LEVELS.find((p) => p.id === id)?.label || id;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TWENTY_EIGHT_BITS = 268435456; // 2^28, oftewel 7 hex-tekens

/**
 * Verschuift een punt met een vaste offset binnen een cirkel met straal
 * radius. Dezelfde seed geeft altijd hetzelfde punt — anders zou je door een
 * paar keer te verversen het echte midden kunnen uitmiddelen.
 */
export async function fuzzPoint(lat, lng, seed, radius) {
  if (!radius || radius <= 0) return { lat, lng };

  const hex = await sha256Hex(seed);
  const bearing = (parseInt(hex.slice(0, 7), 16) / TWENTY_EIGHT_BITS) * 2 * Math.PI;
  // De wortel verdeelt de punten gelijkmatig over het oppervlak in plaats van
  // ze rond het midden op te hopen.
  const distance = Math.sqrt(parseInt(hex.slice(7, 14), 16) / TWENTY_EIGHT_BITS) * radius;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);

  return {
    lat: lat + (distance * Math.cos(bearing)) / 111320,
    lng: lng + (distance * Math.sin(bearing)) / (111320 * cosLat),
  };
}

/** Het zaad dat de server gebruikt, zodat de preview hetzelfde punt oplevert. */
export function shareSeed(shareId, spotId) {
  return `${shareId}:${spotId}`;
}

/**
 * Preview van wat een ontvanger ziet. shareId is nog niet bekend als je de
 * share aan het instellen bent, dus dan tonen we een representatief punt met
 * een vast voorbeeldzaad — de straal klopt, de richting is willekeurig.
 */
export async function previewFuzz(spot, precision, shareId = 'voorbeeld') {
  const radius = PRECISION_RADIUS[precision] ?? 0;
  const point = await fuzzPoint(spot.lat, spot.lng, shareSeed(shareId, spot.id || 'x'), radius);
  return { ...point, radius };
}
