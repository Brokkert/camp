// Coordinaten in, coordinaten uit.
//
// Het idee: je moet nooit hoeven nadenken over wélk formaat je plakt. Een
// Google Maps-link, een schermafdruk-achtige DMS-notatie uit een forum, een
// geo:-URI uit een andere app, of gewoon twee getallen — alles gaat door
// dezelfde parser.

const DEG = '°';

/** Graden/minuten/seconden → decimale graden. */
function dmsToDecimal(deg, min = 0, sec = 0, hemisphere = '') {
  let value = Math.abs(deg) + (min || 0) / 60 + (sec || 0) / 3600;
  if (/[SW]/i.test(hemisphere) || deg < 0) value = -value;
  return value;
}

export function isValidLat(lat) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}
export function isValidLng(lng) {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}
export function isValidCoord(lat, lng) {
  return isValidLat(lat) && isValidLng(lng);
}

// --- losse herkenners -------------------------------------------------------
// Elke functie geeft {lat, lng} terug of null. parseCoordinates() loopt ze af.

function fromGeoUri(text) {
  const m = text.match(/geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}

function fromGoogleMaps(text) {
  if (!/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) return null;
  // !3d<lat>!4d<lng> is het exacte punt van een "place"; het @-deel is slechts
  // het midden van het beeld en kan er tientallen meters naast liggen.
  const place = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (place) return { lat: +place[1], lng: +place[2] };
  const query = text.match(/[?&](?:q|query|daddr|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (query) return { lat: +query[1], lng: +query[2] };
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { lat: +at[1], lng: +at[2] };
  return null;
}

function fromOpenStreetMap(text) {
  if (!/openstreetmap\.org|osm\.org/i.test(text)) return null;
  const m = text.match(/#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  const q = text.match(/[?&]m?lat=(-?\d+(?:\.\d+)?).*?[?&]m?lon=(-?\d+(?:\.\d+)?)/);
  return q ? { lat: +q[1], lng: +q[2] } : null;
}

function fromAppleMaps(text) {
  if (!/maps\.apple\.com/i.test(text)) return null;
  const m = text.match(/[?&](?:ll|sll|daddr)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}

// Graden/minuten/seconden. Eén grote reguliere expressie loopt hier stuk op
// de variatie in het wild ("52°22'12.3\"N", maar ook "N 52 22 12.3"), dus we
// hakken de tekst in stukjes en lopen die na.
//
// De hemisfeerletter is wat DMS ondubbelzinnig maakt: die vertelt zowel het
// teken als welk getal de breedte is. Zonder letter is het gewoon een decimaal
// paar en laten we het aan fromDecimalPair over.
function fromDms(text) {
  if (!/\d/.test(text)) return null;

  // Alles weggooien wat geen getal, hemisfeerletter of scheidingsteken is,
  // zodat losse letters uit gewone woorden geen hemisfeer kunnen worden.
  const cleaned = text.replace(/[^0-9NSEWnsew.,°º'"′″\s-]/g, ' ');
  const tokens = cleaned.match(/-?\d+(?:[.,]\d+)?|[NSEWnsew]/g);
  if (!tokens) return null;

  const groups = [];
  let numbers = [];
  let leadingHemisphere = null;

  const close = (hemisphere) => {
    if (hemisphere && numbers.length) groups.push({ hemisphere, numbers });
    numbers = [];
  };

  for (const token of tokens) {
    if (/^[NSEW]$/i.test(token)) {
      const hemisphere = token.toUpperCase();
      if (numbers.length) {
        // Getallen stonden ervoor: die horen bij een eerder aangekondigde
        // letter ("N 52 22") of bij deze letter ("52 22 N").
        close(leadingHemisphere || hemisphere);
        leadingHemisphere = leadingHemisphere ? hemisphere : null;
      } else {
        leadingHemisphere = hemisphere;
      }
    } else {
      numbers.push(parseFloat(token.replace(',', '.')));
    }
  }
  close(leadingHemisphere);

  if (groups.length !== 2) return null;

  const latitude = groups.find((g) => /[NS]/.test(g.hemisphere));
  const longitude = groups.find((g) => /[EW]/.test(g.hemisphere));
  if (!latitude || !longitude) return null;

  const toDecimal = ({ hemisphere, numbers: n }) => {
    if (n.length > 3) return null; // meer dan graden/minuten/seconden: geen DMS
    return dmsToDecimal(n[0], n[1] || 0, n[2] || 0, hemisphere);
  };

  const lat = toDecimal(latitude);
  const lng = toDecimal(longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function fromDecimalPair(text) {
  const m = text.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  // "52,371 4,896" — Nederlandse decimale komma's met een spatie ertussen.
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  return { lat, lng };
}

const PARSERS = [fromGeoUri, fromGoogleMaps, fromOpenStreetMap, fromAppleMaps, fromDms, fromDecimalPair];

/**
 * Haalt een coordinaat uit vrijwel elke tekst. Geeft {lat, lng} of null.
 */
export function parseCoordinates(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;

  for (const parse of PARSERS) {
    let hit = null;
    try {
      hit = parse(text);
    } catch {
      hit = null; // een rare invoer mag nooit de hele parser opblazen
    }
    if (hit && isValidCoord(hit.lat, hit.lng)) return { lat: hit.lat, lng: hit.lng };
  }
  return null;
}

// --- weergeven --------------------------------------------------------------

/** 5 decimalen ≈ 1 meter; nauwkeuriger heeft geen zin voor een kampeerplek. */
export function formatDecimal(lat, lng, digits = 5) {
  if (!isValidCoord(lat, lng)) return '';
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

export function formatDms(lat, lng) {
  if (!isValidCoord(lat, lng)) return '';
  const one = (value, [pos, neg]) => {
    const hemi = value >= 0 ? pos : neg;
    const abs = Math.abs(value);
    let d = Math.floor(abs);
    // Eerst de seconden afronden en dan pas verdelen. Andersom krijg je
    // 52°37'60.0" waar 52°38'00.0" hoort te staan.
    let totalSeconds = Math.round((abs - d) * 3600 * 10) / 10;
    let m = Math.floor(totalSeconds / 60);
    let s = totalSeconds - m * 60;
    if (m >= 60) {
      m -= 60;
      d += 1;
    }
    return `${d}${DEG}${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"${hemi}`;
  };
  return `${one(lat, ['N', 'S'])} ${one(lng, ['E', 'W'])}`;
}

// --- rekenen ----------------------------------------------------------------

const EARTH_R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Afstand in meters tussen twee punten (haversine). */
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
