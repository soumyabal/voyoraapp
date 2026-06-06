/**
 * comfortClose.test.js — comfort-first close-time ordering: among near-equidistant stops, see
 * the earliest-closing one first, but NEVER detour beyond a small comfort budget (~2 km).
 * Stops sit on the equator (lat 0); 0.001° lng ≈ 0.111 km, so distances are easy to reason about.
 */
import { comfortClosePass, routeOrder } from '../autoArrange';

const at = (id, lng, close) => ({ id, lat: 0, lng, close });
const closeMin = (a) => (a.close == null ? Infinity : a.close);
const ids = (arr) => arr.map((s) => s.id);
const anchor = { lat: 0, lng: 0 };

describe('comfortClosePass', () => {
  test('pulls a slightly-farther earlier-closing stop to the front (within budget)', () => {
    const late = at('late', 0.001, 1080);   // 18:00, nearest
    const early = at('early', 0.002, 840);   // 14:00, a touch farther
    expect(ids(comfortClosePass([late, early], anchor, null, closeMin))).toEqual(['early', 'late']);
  });

  test('does NOT detour beyond the comfort budget to chase a closing', () => {
    const near = at('near', 0.001, 1080);      // closes late, right here
    const farEarly = at('farEarly', 0.05, 840); // closes early but ~5.5 km away
    expect(ids(comfortClosePass([near, farEarly], anchor, null, closeMin))).toEqual(['near', 'farEarly']);
  });

  test('no closingMinOf → order unchanged (back-compat)', () => {
    const a = at('a', 0.002, 840), b = at('b', 0.001, 1080);
    expect(comfortClosePass([a, b], anchor, null, null)).toEqual([a, b]);
  });

  test('unknown closing times never reorder', () => {
    const a = at('a', 0.001, null), b = at('b', 0.002, null);
    expect(ids(comfortClosePass([a, b], anchor, null, closeMin))).toEqual(['a', 'b']);
  });

  test('deterministic — same input, same order', () => {
    const stops = [at('x', 0.001, 1080), at('y', 0.0015, 600), at('z', 0.002, 900)];
    expect(ids(comfortClosePass(stops, anchor, null, closeMin)))
      .toEqual(ids(comfortClosePass(stops, anchor, null, closeMin)));
  });
});

describe('routeOrder with close-times', () => {
  test('omitting closingMinOf preserves the pure distance order', () => {
    const s = [at('a', 0.003, 600), at('b', 0.001, 1080), at('c', 0.002, 540)];
    expect(ids(routeOrder(s, anchor))).toEqual(['b', 'c', 'a']);   // nearest-first from anchor
  });

  test('with close-times, earlier-closing nearby stops move forward (comfort-bounded)', () => {
    const s = [at('a', 0.003, 600), at('b', 0.001, 1080), at('c', 0.002, 540)];
    const out = routeOrder(s, anchor, null, closeMin);
    expect(out[0].close).toBeLessThanOrEqual(out[out.length - 1].close);
    expect(out[0].id).toBe('c');   // closes earliest (09:00), nearby → seen first
  });
});
