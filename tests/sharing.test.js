import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { generateToken, hashToken } from '../src/lib/sharing.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

// Deze waarden komen rechtstreeks uit PostgreSQL:
//   select encode(digest(<token>, 'sha256'), 'hex');
//
// Dit is het enige scharnierpunt van het hele deel-mechanisme: de browser
// verzint een token en stuurt alleen de hash, de database zoekt de share op
// diezelfde hash. Lopen die twee ook maar één teken uiteen, dan werkt geen
// enkele deel-link meer — zonder foutmelding, want de database vindt dan
// simpelweg niets en antwoordt netjes 'not_found'.
const UIT_POSTGRES = {
  abc: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'xK3-_9zQam5tVwPq': '7c0f1c51ab6802fc7400ef668a983cf2daae92a152d48806dc9331e77f06c1d7',
  'tokèn-met-accent': 'a74f06c93428a8a8f88ba40ab25e7aee8025961bed32f0d461cd3518a20b0791',
};

describe('token-hash loopt gelijk met de database', () => {
  for (const [token, verwacht] of Object.entries(UIT_POSTGRES)) {
    it(`zelfde hash als digest(…, 'sha256') voor "${token}"`, async () => {
      expect(await hashToken(token)).toBe(verwacht);
    });
  }
});

describe('tokens', () => {
  it('voldoet aan wat camp_create_link_share accepteert', async () => {
    // De functie weigert alles wat niet op ^[0-9a-f]{64}$ lijkt.
    const hash = await hashToken(generateToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is url-veilig, zodat hij heel door de adresbalk komt', () => {
    for (let i = 0; i < 200; i++) {
      const token = generateToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it('is lang genoeg om niet te raden te zijn', () => {
    // 20 bytes = 160 bits, base64url zonder opvulling = 27 tekens.
    expect(generateToken().length).toBeGreaterThanOrEqual(27);
  });

  it('geeft nooit twee keer hetzelfde', () => {
    const gezien = new Set();
    for (let i = 0; i < 2000; i++) gezien.add(generateToken());
    expect(gezien.size).toBe(2000);
  });
});
