/**
 * gazetteer.test.js — the offline place→coords table. The key safety net: every entry's
 * coordinates must resolve (via tz-lookup) to its DECLARED IANA zone — a deterministic guard
 * that catches a fat-fingered lat/lng (wrong hemisphere/continent) without a device.
 */
import { AIRPORTS, CITIES, lookupPlace } from '../gazetteer';
import { tzForCoords } from '../tz';

describe('gazetteer coordinates resolve to their declared timezone', () => {
  test('every airport code maps to coords in its stated zone', () => {
    for (const [code, a] of Object.entries(AIRPORTS)) {
      expect(`${code}:${tzForCoords(a.lat, a.lng)}`).toBe(`${code}:${a.tz}`);
    }
  });
  test('every city maps to coords in its stated zone', () => {
    for (const [name, c] of Object.entries(CITIES)) {
      expect(`${name}:${tzForCoords(c.lat, c.lng)}`).toBe(`${name}:${c.tz}`);
    }
  });
});

describe('lookupPlace', () => {
  test('a flight "ORD → LAX" resolves to the DESTINATION airport (last code)', () => {
    const g = lookupPlace('Flight ORD → LAX');
    expect(tzForCoords(g.lat, g.lng)).toBe('America/Los_Angeles');
  });
  test('"Land at LAX" resolves to LAX', () => {
    expect(tzForCoords(...Object.values(lookupPlace('Land at LAX')))).toBe('America/Los_Angeles');
  });
  test('a city name resolves (longest match wins)', () => {
    expect(tzForCoords(...Object.values(lookupPlace('Dinner in San Diego')))).toBe('America/Los_Angeles');
    expect(tzForCoords(...Object.values(lookupPlace('Explore Tokyo today')))).toBe('Asia/Tokyo');
  });
  test('no known place → null', () => {
    expect(lookupPlace('a quiet afternoon walk')).toBeNull();
    expect(lookupPlace('')).toBeNull();
  });
});
