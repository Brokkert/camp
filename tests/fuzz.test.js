import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { fuzzPoint, previewFuzz, PRECISION_RADIUS } from '../src/lib/fuzz.js';
import { distanceMeters } from '../src/lib/coords.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

// Deze waarden komen rechtstreeks uit PostgreSQL:
//   select public.camp_fuzz_point(50.2, 5.5, <seed>, <straal>);
// Als de browser en de database uit elkaar lopen, klopt de preview van "wat
// ziet de ander" niet meer — dan hoort deze test om te vallen.
const UIT_POSTGRES = [
  { seed: 'abc:def', radius: 250, lat: 50.201124100707396, lng: 5.499080589264479 },
  { seed: 'share-1:spot-1', radius: 2000, lat: 50.20350748762347, lng: 5.510689202601349 },
  { seed: 'x:y', radius: 15000, lat: 50.276673183678746, lng: 5.5583037227022505 },
];

describe('vervaging loopt gelijk met de database', () => {
  for (const geval of UIT_POSTGRES) {
    it(`zelfde punt als camp_fuzz_point voor "${geval.seed}" op ${geval.radius} m`, async () => {
      const p = await fuzzPoint(50.2, 5.5, geval.seed, geval.radius);
      expect(p.lat).toBeCloseTo(geval.lat, 12);
      expect(p.lng).toBeCloseTo(geval.lng, 12);
    });
  }
});

describe('eigenschappen van de vervaging', () => {
  it('laat het punt met rust bij "precies"', async () => {
    expect(await fuzzPoint(50.2, 5.5, 'wat dan ook', 0)).toEqual({ lat: 50.2, lng: 5.5 });
  });

  it('geeft bij hetzelfde zaad altijd hetzelfde punt', async () => {
    const a = await fuzzPoint(50.2, 5.5, 'zaad', 2000);
    const b = await fuzzPoint(50.2, 5.5, 'zaad', 2000);
    expect(a).toEqual(b);
  });

  it('geeft bij een ander zaad een ander punt', async () => {
    const a = await fuzzPoint(50.2, 5.5, 'zaad', 2000);
    const b = await fuzzPoint(50.2, 5.5, 'ander zaad', 2000);
    expect(a).not.toEqual(b);
  });

  it('blijft altijd binnen de beloofde straal', async () => {
    for (const [naam, straal] of Object.entries(PRECISION_RADIUS)) {
      for (let i = 0; i < 200; i++) {
        const p = await fuzzPoint(50.2, 5.5, `${naam}:${i}`, straal);
        const afstand = distanceMeters({ lat: 50.2, lng: 5.5 }, p);
        expect(afstand).toBeLessThanOrEqual(straal + 1);
      }
    }
  });

  it('gebruikt de hele cirkel en niet alleen de rand', async () => {
    const afstanden = [];
    for (let i = 0; i < 300; i++) {
      const p = await fuzzPoint(50.2, 5.5, `spreiding:${i}`, 2000);
      afstanden.push(distanceMeters({ lat: 50.2, lng: 5.5 }, p));
    }
    // Bij een gelijkmatige verdeling over het oppervlak ligt de helft van de
    // punten binnen r/sqrt(2) ≈ 1414 m.
    const binnen = afstanden.filter((d) => d < 1414).length;
    expect(binnen).toBeGreaterThan(300 * 0.35);
    expect(binnen).toBeLessThan(300 * 0.65);
  });

  it('werkt ook vlak bij de polen zonder te ontploffen', async () => {
    const p = await fuzzPoint(89.9, 20, 'noordpool', 15000);
    expect(Number.isFinite(p.lat)).toBe(true);
    expect(Number.isFinite(p.lng)).toBe(true);
  });

  it('previewFuzz geeft de straal terug die erbij hoort', async () => {
    const p = await previewFuzz({ id: 'spot-1', lat: 50.2, lng: 5.5 }, 'area');
    expect(p.radius).toBe(2000);
  });
});
