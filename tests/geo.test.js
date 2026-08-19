import { describe, it, expect } from 'vitest';
import { toGpx, toKml, toGeoJson, importSpots, mapLinks } from '../src/lib/geo.js';

const PLEKKEN = [
  {
    id: '1',
    name: 'Beukenbos aan de Ourthe',
    lat: 50.2,
    lng: 5.5,
    kind: 'wild',
    notes: 'Vlak stukje achter de bocht.',
    access: 'Parkeer bij de brug.',
    tags: ['water', 'vuur-ok'],
    rating: 5,
    elevation: 240,
  },
  {
    id: '2',
    name: 'Duin & "Kreupelhout" <test>',
    lat: 52.1,
    lng: 4.3,
    kind: 'bivak',
    notes: '',
    access: '',
    tags: [],
    rating: null,
    elevation: null,
  },
];

describe('exporteren', () => {
  it('maakt GPX met de juiste coordinaten', () => {
    const gpx = toGpx(PLEKKEN);
    expect(gpx).toContain('<wpt lat="50.2" lon="5.5">');
    expect(gpx).toContain('Beukenbos aan de Ourthe');
    expect(gpx).toContain('<ele>240</ele>');
  });

  it('ontsnapt tekens die XML zouden breken', () => {
    const gpx = toGpx(PLEKKEN);
    expect(gpx).toContain('&quot;Kreupelhout&quot;');
    expect(gpx).toContain('&lt;test&gt;');
    expect(gpx).not.toContain('<test>');
  });

  it('zet KML in lengte,breedte-volgorde (andersom dan de rest)', () => {
    expect(toKml(PLEKKEN)).toContain('<coordinates>5.5,50.2,240</coordinates>');
  });

  it('maakt geldige GeoJSON', () => {
    const gj = toGeoJson(PLEKKEN);
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.features[0].geometry.coordinates).toEqual([5.5, 50.2]);
    expect(gj.features[0].properties.name).toBe('Beukenbos aan de Ourthe');
  });
});

describe('importeren', () => {
  it('leest zijn eigen GPX weer in', () => {
    const terug = importSpots(toGpx(PLEKKEN));
    expect(terug).toHaveLength(2);
    expect(terug[0].name).toBe('Beukenbos aan de Ourthe');
    expect(terug[0].lat).toBeCloseTo(50.2);
    expect(terug[0].lng).toBeCloseTo(5.5);
  });

  it('leest zijn eigen KML weer in, met de assen goed om', () => {
    const terug = importSpots(toKml(PLEKKEN));
    expect(terug[0].lat).toBeCloseTo(50.2);
    expect(terug[0].lng).toBeCloseTo(5.5);
  });

  it('leest zijn eigen GeoJSON weer in, inclusief kenmerken', () => {
    const terug = importSpots(JSON.stringify(toGeoJson(PLEKKEN)));
    expect(terug[0].tags).toEqual(['water', 'vuur-ok']);
    expect(terug[0].access).toBe('Parkeer bij de brug.');
  });

  it('pakt ook trackpunten uit een GPX', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
      <trkpt lat="50.1" lon="5.4"><name>Onderweg</name></trkpt>
    </trkseg></trk></gpx>`;
    const terug = importSpots(gpx);
    expect(terug).toHaveLength(1);
    expect(terug[0].name).toBe('Onderweg');
  });

  it('leest geplakte regels met coordinaten', () => {
    const terug = importSpots('Mooie plek bij het meer, 50.2, 5.5\nAndere plek 52.1 4.3');
    expect(terug).toHaveLength(2);
    expect(terug[0].name).toBe('Mooie plek bij het meer');
    expect(terug[1].lat).toBeCloseTo(52.1);
  });

  it('slaat regels zonder coordinaat gewoon over', () => {
    expect(importSpots('gewoon wat tekst\nnog een regel')).toEqual([]);
    expect(importSpots('')).toEqual([]);
  });

  it('klaagt netjes over kapotte XML', () => {
    expect(() => importSpots('<gpx <<< kapot')).toThrow();
  });
});

describe('kaart-links', () => {
  it('maakt links voor de gangbare apps', () => {
    const links = mapLinks(50.2, 5.5, 'Beukenbos');
    expect(links.google).toContain('50.2,5.5');
    expect(links.geo).toBe('geo:50.2,5.5?q=50.2,5.5(Beukenbos)');
    expect(links.osm).toContain('mlat=50.2');
  });
});
