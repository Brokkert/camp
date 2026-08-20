// Offline in het veld.
//
// Twee dingen worden bewaard: de app zelf (zodat hij opent zonder bereik) en
// de kaarttegels die je al eens hebt bekeken (zodat de kaart niet leeg is als
// je op de plek zelf staat). Je plekken staan al in localStorage — zie
// vault.js.

const APP_CACHE = 'camp-app-v1';
const TILE_CACHE = 'camp-tiles-v1';
const MAX_TILES = 1200; // ruwweg 60 MB aan tegels

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(['./', './index.html'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== APP_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isTile = (url) =>
  /tiles\.openfreemap\.org|tile\.opentopomap\.org|services\.arcgisonline\.com/.test(url.hostname + url.pathname);

const isAppAsset = (url) =>
  url.origin === self.location.origin &&
  /\.(js|css|html|svg|webmanifest|woff2?)$/.test(url.pathname);

/** Oudste tegels weggooien zodra het er te veel worden. */
async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_TILES) return;
  for (const key of keys.slice(0, keys.length - MAX_TILES)) await cache.delete(key);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nooit iets van de database of de authenticatie cachen: dat moet altijd
  // vers zijn, en het gaat om gegevens die niet op schijf horen rond te
  // slingeren.
  if (/supabase\.co|api\.open-meteo\.com/.test(url.hostname)) return;

  if (isTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
            trimTiles();
          }
          return response;
        } catch (e) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  if (isAppAsset(url) || request.mode === 'navigate') {
    // Eerst het netwerk, met de cache als vangnet: zo krijg je updates meteen,
    // maar werkt de app ook zonder bereik.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          return hit || caches.match('./index.html');
        })
    );
  }
});
