import { describe, it, expect } from 'vitest';
import { labelFor, parseResults, searchPlaces } from '../src/lib/search.js';

// Photon vult zijn velden nogal wisselend: een bos heeft geen huisnummer, een
// stad geen straat, en soms komt dezelfde plek twee keer terug. Dit zijn
// antwoorden in de vorm zoals de dienst ze teruggeeft.
const antwoord = {
  features: [
    {
      geometry: { coordinates: [5.5, 50.2] },
      properties: { name: 'Ardennen', state: 'Wallonië', country: 'België' },
    },
    {
      geometry: { coordinates: [15.80294, 58.78032] },
      properties: { name: 'Tiveden', county: 'Örebro', state: 'Örebro', country: 'Zweden' },
    },
    {
      geometry: { coordinates: [4.895, 52.37] },
      properties: { street: 'Damrak', housenumber: '1', city: 'Amsterdam', country: 'Nederland' },
    },
  ],
};

describe('labelFor', () => {
  it('gebruikt de naam als die er is', () => {
    expect(labelFor({ name: 'Ardennen', country: 'België' }).naam).toBe('Ardennen');
  });

  it('valt terug op straat en huisnummer', () => {
    expect(labelFor({ street: 'Damrak', housenumber: '1' }).naam).toBe('Damrak 1');
  });

  it('valt daarna terug op plaats en land', () => {
    expect(labelFor({ city: 'Amsterdam' }).naam).toBe('Amsterdam');
    expect(labelFor({ country: 'Nederland' }).naam).toBe('Nederland');
    expect(labelFor({}).naam).toBe('Naamloos');
  });

  it('herhaalt de naam niet in de context', () => {
    const { naam, context } = labelFor({ name: 'Amsterdam', city: 'Amsterdam', country: 'Nederland' });
    expect(naam).toBe('Amsterdam');
    expect(context).toBe('Nederland');
  });

  it('houdt de context kort', () => {
    const { context } = labelFor({
      name: 'Tiveden', city: 'Karlsborg', county: 'Örebro', state: 'Västra', country: 'Zweden',
    });
    expect(context.split(' · ')).toHaveLength(2);
  });

  it('gooit dubbele niveaus eruit', () => {
    // county en state zijn hier hetzelfde; dat hoort niet twee keer te staan.
    const { context } = labelFor({ name: 'Tiveden', county: 'Örebro', state: 'Örebro' });
    expect(context).toBe('Örebro');
  });
});

describe('parseResults', () => {
  it('zet lengte,breedte om naar breedte,lengte', () => {
    const [eerste] = parseResults(antwoord);
    expect(eerste.lat).toBeCloseTo(50.2);
    expect(eerste.lng).toBeCloseTo(5.5);
  });

  it('levert leesbare regels op', () => {
    const r = parseResults(antwoord);
    expect(r[0].naam).toBe('Ardennen');
    expect(r[2].naam).toBe('Damrak 1');
  });

  it('slaat dezelfde plek niet twee keer op', () => {
    const dubbel = { features: [antwoord.features[0], antwoord.features[0]] };
    expect(parseResults(dubbel)).toHaveLength(1);
  });

  it('slaat onbruikbare rijen over', () => {
    const rommel = {
      features: [
        { geometry: null, properties: { name: 'Geen punt' } },
        { geometry: { coordinates: [999, 999] }, properties: { name: 'Onmogelijk' } },
        { geometry: { coordinates: ['a', 'b'] }, properties: { name: 'Geen getal' } },
        antwoord.features[0],
      ],
    };
    const r = parseResults(rommel);
    expect(r).toHaveLength(1);
    expect(r[0].naam).toBe('Ardennen');
  });

  it('houdt zich aan het maximum', () => {
    const veel = { features: Array.from({ length: 30 }, (_, i) => ({
      geometry: { coordinates: [i / 10, 50 + i / 10] },
      properties: { name: `Plek ${i}` },
    })) };
    expect(parseResults(veel, 6)).toHaveLength(6);
  });

  it('valt niet om over onzin', () => {
    expect(parseResults(null)).toEqual([]);
    expect(parseResults({})).toEqual([]);
    expect(parseResults({ features: 'geen lijst' })).toEqual([]);
  });
});

describe('searchPlaces', () => {
  it('zoekt niet op één letter', async () => {
    // Zou hij dat wel doen, dan zou fetch (die hier niet bestaat) klappen.
    expect(await searchPlaces('a')).toEqual([]);
    expect(await searchPlaces('  ')).toEqual([]);
    expect(await searchPlaces('')).toEqual([]);
  });
});
