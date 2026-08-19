import { describe, it, expect } from 'vitest';
import {
  parseCoordinates,
  formatDecimal,
  formatDms,
  distanceMeters,
  formatDistance,
} from '../src/lib/coords.js';

const ARDENNEN = { lat: 50.2, lng: 5.5 };
const near = (got, want, tol = 1e-4) =>
  expect(Math.abs(got - want)).toBeLessThan(tol);

describe('parseCoordinates', () => {
  it('leest een gewoon decimaal paar', () => {
    expect(parseCoordinates('50.2, 5.5')).toEqual(ARDENNEN);
    expect(parseCoordinates('50.2 5.5')).toEqual(ARDENNEN);
    expect(parseCoordinates('  50.2;5.5  ')).toEqual(ARDENNEN);
  });

  it('accepteert Nederlandse decimale komma s', () => {
    const p = parseCoordinates('52,371 4,896');
    near(p.lat, 52.371);
    near(p.lng, 4.896);
  });

  it('leest een geo:-URI', () => {
    expect(parseCoordinates('geo:50.2,5.5?z=15')).toEqual(ARDENNEN);
  });

  it('leest Google Maps in al zijn vormen', () => {
    expect(parseCoordinates('https://www.google.com/maps/@50.2,5.5,15z')).toEqual(ARDENNEN);
    expect(parseCoordinates('https://maps.google.com/?q=50.2,5.5')).toEqual(ARDENNEN);
  });

  it('pakt bij een Google-place het exacte punt (!3d!4d), niet het beeldmidden (@)', () => {
    const url =
      'https://www.google.com/maps/place/Bos/@50.19,5.49,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d50.2!4d5.5';
    expect(parseCoordinates(url)).toEqual(ARDENNEN);
  });

  it('leest OpenStreetMap en Apple Maps', () => {
    expect(parseCoordinates('https://www.openstreetmap.org/#map=15/50.2/5.5')).toEqual(ARDENNEN);
    expect(parseCoordinates('https://maps.apple.com/?ll=50.2,5.5')).toEqual(ARDENNEN);
  });

  it('leest graden/minuten/seconden', () => {
    const p = parseCoordinates('52°22\'12.3"N 4°53\'42.1"E');
    near(p.lat, 52.3701, 1e-3);
    near(p.lng, 4.895, 1e-3);
  });

  it('leest DMS met de hemisfeer vooraan en zonder symbolen', () => {
    const p = parseCoordinates('N 52 22 12.3 E 4 53 42.1');
    near(p.lat, 52.3701, 1e-3);
    near(p.lng, 4.895, 1e-3);
  });

  it('draait lengte en breedte om als de hemisfeer daarom vraagt', () => {
    const p = parseCoordinates('E 4°53\'42.1" N 52°22\'12.3"');
    near(p.lat, 52.3701, 1e-3);
    near(p.lng, 4.895, 1e-3);
  });

  it('herkent zuid en west als negatief', () => {
    const p = parseCoordinates('33°55\'00"S 18°25\'00"W');
    expect(p.lat).toBeLessThan(0);
    expect(p.lng).toBeLessThan(0);
  });

  it('geeft null bij onzin of onmogelijke waarden', () => {
    expect(parseCoordinates('ergens in de bossen')).toBeNull();
    expect(parseCoordinates('999, 999')).toBeNull();
    expect(parseCoordinates('91, 5')).toBeNull();
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates(null)).toBeNull();
    expect(parseCoordinates(undefined)).toBeNull();
  });
});

describe('weergeven', () => {
  it('rondt af op ongeveer een meter', () => {
    expect(formatDecimal(50.2000004, 5.5000004)).toBe('50.20000, 5.50000');
  });

  it('maakt leesbare DMS', () => {
    expect(formatDms(52.3701, 4.895)).toMatch(/^52°22'.*N 4°53'.*E$/);
  });

  it('kan zijn eigen DMS weer teruglezen', () => {
    const round = parseCoordinates(formatDms(50.2, 5.5));
    near(round.lat, 50.2, 1e-4);
    near(round.lng, 5.5, 1e-4);
  });
});

describe('afstand', () => {
  it('rekent Amsterdam - Ardennen ongeveer goed uit', () => {
    const d = distanceMeters({ lat: 52.37, lng: 4.89 }, ARDENNEN);
    expect(d).toBeGreaterThan(240000);
    expect(d).toBeLessThan(250000);
  });

  it('is nul voor hetzelfde punt', () => {
    expect(distanceMeters(ARDENNEN, ARDENNEN)).toBeCloseTo(0, 5);
  });

  it('schrijft afstanden leesbaar op', () => {
    expect(formatDistance(320)).toBe('320 m');
    expect(formatDistance(2500)).toBe('2.5 km');
    expect(formatDistance(248000)).toBe('248 km');
  });
});
