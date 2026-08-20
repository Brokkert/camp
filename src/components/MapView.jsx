import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { kindOf } from '../data/taxonomy.js';

// Alle drie gratis en zonder sleutel. OpenFreeMap draait op eigen kosten van
// de maker en heeft geen limiet; de andere twee zijn rastertegels met een
// bronvermelding als voorwaarde.
export const BASEMAPS = [
  { id: 'liberty', label: 'Kaart', style: 'https://tiles.openfreemap.org/styles/liberty' },
  {
    id: 'topo',
    label: 'Hoogte',
    raster: {
      tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
      maxzoom: 17,
      attribution:
        '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), &copy; OpenStreetMap',
    },
  },
  {
    id: 'satelliet',
    label: 'Satelliet',
    raster: {
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      maxzoom: 19,
      attribution: 'Luchtbeelden &copy; Esri, Maxar, Earthstar Geographics',
    },
  },
];

function styleFor(basemap) {
  if (basemap.style) return basemap.style;
  return {
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles: basemap.raster.tiles,
        tileSize: 256,
        maxzoom: basemap.raster.maxzoom,
        attribution: basemap.raster.attribution,
      },
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
  };
}

/**
 * Eén kaartcomponent voor alle schermen.
 *
 * spots      lijst met { id, name, lat, lng, kind, radius_m?, shared? }
 * onPick     aangeroepen met {lat,lng} als je op de kaart tikt (of null)
 * onSelect   aangeroepen met een plek als je op een speld tikt
 * follow     center + zoom die van buitenaf gezet mag worden
 */
export default function MapView({
  spots = [],
  onPick = null,
  onSelect = null,
  center = [5.5, 50.2],
  zoom = 5,
  follow = null,
  fit = null,
  here = null,
  className = 'map-full',
  interactive = true,
  hint = null,
}) {
  const holder = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [basemap, setBasemap] = useState(() => localStorage.getItem('camp:basemap') || 'liberty');
  const [locating, setLocating] = useState(false);
  const hasFitted = useRef(false);
  const meMarker = useRef(null);
  const [myPos, setMyPos] = useState(here);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Kaart opzetten. Bewust maar één keer: bij elke stijlwissel hergebruiken we
  // dezelfde instantie via setStyle().
  useEffect(() => {
    if (map.current || !holder.current) return;
    const chosen = BASEMAPS.find((b) => b.id === basemap) || BASEMAPS[0];

    map.current = new maplibregl.Map({
      container: holder.current,
      style: styleFor(chosen),
      center,
      zoom,
      attributionControl: { compact: true },
      interactive,
    });

    if (interactive) {
      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    }
    map.current.on('click', (event) => {
      onPickRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const chosen = BASEMAPS.find((b) => b.id === basemap) || BASEMAPS[0];
    map.current.setStyle(styleFor(chosen));
    localStorage.setItem('camp:basemap', basemap);
  }, [basemap]);

  // Spelden en onzekerheidscirkels tekenen.
  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((m) => m.remove());
    markers.current = [];

    for (const spot of spots) {
      if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) continue;

      // Maplibre zet zijn positionering als inline transform op het element dat
      // je meegeeft. Geef je daar de speld zelf, dan overschrijft dat de
      // rotate(-45deg) die de druppelvorm maakt — en blijft alleen de
      // tegen-rotatie van de emoji staan, die dan scheef hangt. Vandaar een
      // omhulsel: maplibre verplaatst dat, de speld houdt zijn eigen draai.
      const wrapper = document.createElement('div');
      wrapper.className = 'pin-wrap';

      const element = document.createElement('div');
      element.className = `pin${spot.shared ? ' shared' : ''}${spot.radius_m ? ' fuzzy' : ''}`;
      element.innerHTML = `<span>${kindOf(spot.kind).emoji}</span>`;
      wrapper.title = spot.name;
      wrapper.appendChild(element);
      wrapper.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect?.(spot);
      });

      markers.current.push(
        new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
          .setLngLat([spot.lng, spot.lat])
          .addTo(map.current)
      );
    }

    const drawCircles = () => {
      if (!map.current?.isStyleLoaded()) return;
      const features = spots
        .filter((s) => s.radius_m > 0 && Number.isFinite(s.lat))
        .map((s) => ({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [circlePolygon(s.lat, s.lng, s.radius_m)] },
          properties: {},
        }));

      const data = { type: 'FeatureCollection', features };
      const existing = map.current.getSource('camp-fuzz');
      if (existing) {
        existing.setData(data);
        return;
      }
      map.current.addSource('camp-fuzz', { type: 'geojson', data });
      map.current.addLayer({
        id: 'camp-fuzz-fill',
        type: 'fill',
        source: 'camp-fuzz',
        paint: { 'fill-color': '#63b3e8', 'fill-opacity': 0.14 },
      });
      map.current.addLayer({
        id: 'camp-fuzz-line',
        type: 'line',
        source: 'camp-fuzz',
        paint: { 'line-color': '#63b3e8', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });
    };

    drawCircles();
    map.current.on('styledata', drawCircles);
    return () => map.current?.off('styledata', drawCircles);
  }, [spots, onSelect]);

  /**
   * Bij het openen naar je eigen plekken toe. Zonder dit staat de kaart altijd
   * op een vast punt en zie je niets als je plek ergens anders ligt — de speld
   * staat er dan wel, maar buiten beeld.
   *
   * Eén keer, want daarna is het jouw kaart: niemand wil dat hij terugspringt
   * zodra je hebt weggesleept.
   */
  const fitToSpots = useCallback((punten) => {
    const bruikbaar = (punten || []).filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)
    );
    if (!map.current || !bruikbaar.length) return false;

    if (bruikbaar.length === 1) {
      map.current.jumpTo({ center: [bruikbaar[0].lng, bruikbaar[0].lat], zoom: 13 });
      return true;
    }

    const bounds = bruikbaar.reduce(
      (b, s) => b.extend([s.lng, s.lat]),
      new maplibregl.LngLatBounds(
        [bruikbaar[0].lng, bruikbaar[0].lat],
        [bruikbaar[0].lng, bruikbaar[0].lat]
      )
    );
    // Bewust zonder animatie. Een geanimeerde flyTo leunt op de render-lus van
    // de kaart, en die staat stil zolang de stijl niet geladen is — precies
    // wanneer je hem het hardst nodig hebt: traag netwerk, tegelserver eruit.
    // Dan blijft de knop hangen zonder dat er iets gebeurt.
    map.current.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 0 });
    return true;
  }, []);

  useEffect(() => {
    if (hasFitted.current || !fit?.length) return;
    if (fitToSpots(fit)) hasFitted.current = true;
  }, [fit, fitToSpots]);

  // Van buitenaf ergens naartoe vliegen.
  useEffect(() => {
    if (!map.current || !follow) return;
    map.current.flyTo({
      center: [follow.lng, follow.lat],
      zoom: follow.zoom ?? 14,
      duration: follow.instant ? 0 : 900,
    });
  }, [follow]);

  // Waar jij staat, als stip op de kaart. Zonder dit vliegt de kaart wel naar je
  // toe, maar zie je niets — en dan weet je dus nog steeds niet waar je bent.
  useEffect(() => {
    if (here) setMyPos(here);
  }, [here]);

  useEffect(() => {
    if (!map.current || !myPos) return;
    if (!meMarker.current) {
      const dot = document.createElement('div');
      dot.className = 'here-dot';
      dot.title = 'Hier sta jij';
      meMarker.current = new maplibregl.Marker({ element: dot })
        .setLngLat([myPos.lng, myPos.lat])
        .addTo(map.current);
    } else {
      meMarker.current.setLngLat([myPos.lng, myPos.lat]);
    }
  }, [myPos]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const punt = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMyPos(punt);
        map.current?.jumpTo({ center: [punt.lng, punt.lat], zoom: 14 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="mapwrap">
      <div ref={holder} className={`map ${className}`} />
      {interactive && (
        <div className="map-tools">
          <button
            onClick={() => {
              const index = BASEMAPS.findIndex((b) => b.id === basemap);
              setBasemap(BASEMAPS[(index + 1) % BASEMAPS.length].id);
            }}
            title={`Kaartlaag: ${BASEMAPS.find((b) => b.id === basemap)?.label}`}
          >
            🗺️
          </button>
          <button onClick={locate} title="Waar ben ik?">
            {locating ? <span className="spinner" /> : '📍'}
          </button>
          {fit?.length > 0 && (
            <button onClick={() => fitToSpots(fit)} title="Toon al mijn plekken">
              ⛺
            </button>
          )}
        </div>
      )}
      {hint && <div className="map-hint">{hint}</div>}
    </div>
  );
}

/** Ruwe cirkel als polygoon; op deze schalen is een platte benadering prima. */
function circlePolygon(lat, lng, radiusMeters, steps = 64) {
  const points = [];
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    points.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return points;
}
