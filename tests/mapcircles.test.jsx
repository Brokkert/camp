import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// Maplibre nabootsen: we willen niet weten of er pixels verschijnen, maar of de
// kaart de juiste vorm te tekenen krijgt. Dat is precies waar het misging.
const kaart = {
  handlers: {},
  bron: null,
  lagen: [],
  stijlKlaar: true,

  on(event, fn) {
    (this.handlers[event] ||= []).push(fn);
  },
  off(event, fn) {
    this.handlers[event] = (this.handlers[event] || []).filter((f) => f !== fn);
  },
  vuur(event) {
    (this.handlers[event] || []).forEach((fn) => fn());
  },

  isStyleLoaded() {
    return this.stijlKlaar;
  },
  getSource(id) {
    return this.bron && this.bron.id === id ? this.bron : undefined;
  },
  addSource(id, spec) {
    this.bron = { id, data: spec.data, setData(d) { this.data = d; } };
  },
  addLayer(spec) {
    this.lagen.push(spec.id);
  },

  triggerRepaint() {},
  addControl() {},
  setStyle() {
    // Net als in het echt: een stijlwissel gooit alle bronnen en lagen weg.
    this.bron = null;
    this.lagen = [];
  },
  remove() {},
  flyTo() {},
  jumpTo() {},
  fitBounds() {},
};

vi.mock('maplibre-gl', () => {
  class Marker {
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
  }
  class LngLatBounds {
    extend() { return this; }
  }
  return {
    default: {
      Map: function Map() { return kaart; },
      Marker,
      LngLatBounds,
      NavigationControl: class {},
    },
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const { default: MapView } = await import('../src/components/MapView.jsx');

const plek = (radius) => [
  { id: 'preview', name: 'Östergötland', kind: 'camper', lat: 58.78, lng: 15.8, radius_m: radius },
];

const aantalCirkels = () => kaart.bron?.data?.features?.length ?? null;

beforeEach(() => {
  kaart.handlers = {};
  kaart.bron = null;
  kaart.lagen = [];
  kaart.stijlKlaar = true;
});

describe('de onzekerheidscirkel vertelt de waarheid', () => {
  it('tekent een cirkel bij een vervaagde share', () => {
    render(<MapView spots={plek(2000)} interactive={false} />);
    expect(aantalCirkels()).toBe(1);
  });

  it('tekent geen cirkel bij "precies"', () => {
    render(<MapView spots={plek(0)} interactive={false} />);
    expect(aantalCirkels()).toBe(0);
  });

  it('wist de cirkel zodra je naar "precies" schakelt', () => {
    const { rerender } = render(<MapView spots={plek(2000)} interactive={false} />);
    expect(aantalCirkels()).toBe(1);

    rerender(<MapView spots={plek(0)} interactive={false} />);
    expect(aantalCirkels()).toBe(0);
  });

  it('houdt geen cirkel op het scherm als de stijl nog laadt', () => {
    // Dit is de fout die Laurens zag: na een wissel naar satelliet was de stijl
    // nog niet klaar, stapte het tekenen er stilletjes uit, en bleef de cirkel
    // van de vorige keuze staan bij een share die de exacte plek geeft.
    const { rerender } = render(<MapView spots={plek(2000)} interactive={false} />);
    expect(aantalCirkels()).toBe(1);

    kaart.stijlKlaar = false;
    rerender(<MapView spots={plek(0)} interactive={false} />);

    // Zolang de stijl laadt kan er niets getekend worden — maar zodra hij klaar
    // is, moet het alsnog kloppen en niet blijven hangen op de oude situatie.
    kaart.stijlKlaar = true;
    kaart.vuur('styledata');
    expect(aantalCirkels()).toBe(0);
  });

  it('zet de cirkels terug na een wissel van kaartlaag', () => {
    render(<MapView spots={plek(2000)} interactive={false} />);
    expect(aantalCirkels()).toBe(1);

    kaart.setStyle();
    expect(kaart.bron).toBeNull();

    kaart.vuur('styledata');
    expect(aantalCirkels()).toBe(1);
    expect(kaart.lagen).toContain('camp-fuzz-line');
  });

  it('wist de cirkel ook terwijl de stijl nog laadt', () => {
    // Dit is het pad dat de fout verklaart. Na een wissel naar satelliet houdt
    // maplibre de bestaande bron, maar blijft isStyleLoaded() false zolang de
    // tegels laden. Zit daar een slot voor het bijwerken, dan blijft de cirkel
    // van de vorige keuze staan bij een share die de exacte plek geeft.
    const { rerender } = render(<MapView spots={plek(2000)} interactive={false} />);
    expect(aantalCirkels()).toBe(1);

    kaart.stijlKlaar = false;
    rerender(<MapView spots={plek(0)} interactive={false} />);
    expect(aantalCirkels()).toBe(0);
  });

  it('een late styledata zet geen oude situatie terug', () => {
    const { rerender } = render(<MapView spots={plek(2000)} interactive={false} />);
    rerender(<MapView spots={plek(0)} interactive={false} />);
    expect(aantalCirkels()).toBe(0);

    // Een gebeurtenis die nog van de vorige render onderweg was.
    kaart.vuur('styledata');
    expect(aantalCirkels()).toBe(0);
  });
});
