// Plaatsnamen zoeken.
//
// Photon (van Komoot) draait op OpenStreetMap-data, is gratis, vraagt geen
// sleutel en is gemaakt voor zoeken-terwijl-je-typt. Dat laatste is de reden om
// hem boven Nominatim te verkiezen: die vraagt in zijn gebruiksvoorwaarden
// nadrukkelijk om géén verzoek per toetsaanslag.
//
// Valt de dienst uit, dan is dat geen ramp: je kunt nog steeds coordinaten
// plakken of op de kaart tikken. Vandaar dat alles hier stilletjes faalt in
// plaats van de app mee te slepen.

const ENDPOINT = 'https://photon.komoot.io/api/';

/**
 * Bouwt een leesbaar label uit de eigenschappen die Photon meestuurt. Die
 * velden zijn nogal wisselend gevuld — een bos heeft geen huisnummer, een stad
 * geen straat — dus we pakken wat er is en gooien dubbelingen eruit.
 */
export function labelFor(properties = {}) {
  const naam =
    properties.name ||
    [properties.street, properties.housenumber].filter(Boolean).join(' ') ||
    properties.city ||
    properties.country ||
    'Naamloos';

  const context = [
    properties.city && properties.city !== naam ? properties.city : null,
    properties.county && properties.county !== naam ? properties.county : null,
    properties.state && properties.state !== naam ? properties.state : null,
    properties.country && properties.country !== naam ? properties.country : null,
  ].filter(Boolean);

  // Alleen de twee grofste niveaus, anders wordt het een regel vol komma's.
  const staart = [...new Set(context)].slice(-2);
  return { naam, context: staart.join(' · ') };
}

/** Zet een Photon-antwoord om in iets waar de app mee werkt. */
export function parseResults(json, limit = 6) {
  const features = json?.features;
  if (!Array.isArray(features)) return [];

  const gezien = new Set();
  const uit = [];

  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const { naam, context } = labelFor(feature.properties);

    // Photon geeft soms hetzelfde punt meerdere keren terug (een dorp als
    // plaats én als gemeente). Eén regel per plek is genoeg.
    const sleutel = `${naam}|${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);

    uit.push({ naam, context, lat, lng });
    if (uit.length >= limit) break;
  }

  return uit;
}

/**
 * Zoekt plaatsen. `near` stuurt de volgorde bij: staat de kaart boven
 * Zweden, dan wil je bij "berg" geen resultaten uit Nieuw-Zeeland.
 *
 * Geeft altijd een lijst terug — bij een storing een lege.
 */
export async function searchPlaces(query, { near = null, signal, limit = 6 } = {}) {
  const term = (query || '').trim();
  if (term.length < 2) return [];

  const params = new URLSearchParams({ q: term, limit: String(limit * 2) });
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lon', near.lng.toFixed(4));
  }

  const response = await fetch(`${ENDPOINT}?${params}`, { signal });
  if (!response.ok) throw new Error('Zoeken lukt nu niet.');
  return parseResults(await response.json(), limit);
}
