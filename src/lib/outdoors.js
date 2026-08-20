// Open-Meteo: gratis, geen sleutel, met CORS. Dezelfde bron die Paklijst
// gebruikt voor het vakantieweer.

const CACHE_PREFIX = 'camp:meteo:';
const CACHE_TTL_MS = 3 * 3600 * 1000;

const cached = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null');
    if (raw && Date.now() - raw.ts < CACHE_TTL_MS) return raw.data;
  } catch {
    /* negeren */
  }
  return null;
};
const remember = (key, data) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* negeren */
  }
};

const WMO = [
  [0, '☀️', 'helder'],
  [2, '🌤️', 'halfbewolkt'],
  [3, '☁️', 'bewolkt'],
  [48, '🌫️', 'mist'],
  [57, '🌦️', 'motregen'],
  [67, '🌧️', 'regen'],
  [77, '❄️', 'sneeuw'],
  [82, '🌦️', 'buien'],
  [86, '🌨️', 'sneeuwbuien'],
  [99, '⛈️', 'onweer'],
];

export function weatherIcon(code) {
  if (code == null) return '';
  for (const [max, icon] of WMO) if (code <= max) return icon;
  return '🌡️';
}
export function weatherLabel(code) {
  if (code == null) return '';
  for (const [max, , label] of WMO) if (code <= max) return label;
  return 'onbekend';
}

/** Zeven dagen vooruit voor één plek. */
export async function fetchForecast(lat, lng) {
  const key = `f:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cached(key);
  if (hit) return hit;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max' +
    '&timezone=auto&forecast_days=7';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Het weer is even niet op te halen.');
  const json = await response.json();

  const days = (json.daily?.time || []).map((date, i) => ({
    date,
    code: json.daily.weather_code[i],
    max: Math.round(json.daily.temperature_2m_max[i]),
    min: Math.round(json.daily.temperature_2m_min[i]),
    rain: json.daily.precipitation_sum[i],
    wind: Math.round(json.daily.wind_speed_10m_max[i]),
  }));
  remember(key, days);
  return days;
}

/** Hoogte boven zeeniveau; handig om te weten of het er 's nachts koud wordt. */
export async function fetchElevation(lat, lng) {
  const key = `e:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cached(key);
  if (hit != null) return hit;

  const response = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
  );
  if (!response.ok) throw new Error('Hoogte niet op te halen.');
  const json = await response.json();
  const meters = json.elevation?.[0];
  if (meters == null) return null;
  remember(key, meters);
  return meters;
}

/**
 * Zonsopkomst en -ondergang voor vandaag. Leuk detail bij een plek waarvan je
 * hebt opgeschreven dat het uitzicht op het oosten ligt.
 */
export async function fetchSun(lat, lng) {
  const key = `s:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cached(key);
  if (hit) return hit;

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      '&daily=sunrise,sunset&timezone=auto&forecast_days=1'
  );
  if (!response.ok) throw new Error('Zonstanden niet op te halen.');
  const json = await response.json();
  const time = (value) => (value ? value.slice(11, 16) : null);
  const sun = { sunrise: time(json.daily?.sunrise?.[0]), sunset: time(json.daily?.sunset?.[0]) };
  remember(key, sun);
  return sun;
}
