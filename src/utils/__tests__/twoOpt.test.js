/**
 * twoOpt.test.js — the bounded 2-opt refinement of the day route. Invariants:
 * preserves the stop set, never lengthens the path, and fixes a known crossing.
 */
import { routeOrder, twoOptOrder, pathCost } from '../autoArrange';

const P = (lat, lng, name) => ({ name, lat, lng });
const ids = (arr) => arr.map((a) => a.name).join(',');

describe('twoOptOrder / routeOrder', () => {
  test('preserves the stop set (a permutation, nothing dropped or added)', () => {
    const stops = [P(0, 0, 'A'), P(0, 2, 'B'), P(2, 2, 'C'), P(2, 0, 'D')];
    const out = routeOrder(stops, P(0, 0, 'anchor'));
    expect(out).toHaveLength(stops.length);
    expect([...out].map((s) => s.name).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  test('2-opt never lengthens the path (monotone improvement)', () => {
    const anchor = P(0, 0, 'o');
    // A deliberately crossing initial order.
    const bad = [P(2, 2, 'C'), P(0, 2, 'B'), P(2, 0, 'D'), P(0, 4, 'E')];
    const before = pathCost(bad, anchor);
    const after = pathCost(twoOptOrder(bad, anchor), anchor);
    expect(after).toBeLessThanOrEqual(before + 1e-9);
  });

  test('fixes a crossing: a self-intersecting order is straightened', () => {
    const anchor = P(0, 0, 'o');
    // Square corners fed in a crossing order (A→C diagonal, B→D diagonal).
    const crossing = [P(0, 0.01, 'A'), P(0.02, 0.03, 'C'), P(0.02, 0.01, 'B'), P(0, 0.03, 'D')];
    const fixed = twoOptOrder(crossing, anchor);
    expect(pathCost(fixed, anchor)).toBeLessThan(pathCost(crossing, anchor));
  });

  test('un-located stops ride along without breaking (neutral legs)', () => {
    const anchor = P(0, 0, 'o');
    const mixed = [P(0, 2, 'A'), { name: 'X' }, P(2, 2, 'C'), P(2, 0, 'D')];
    const out = routeOrder(mixed, anchor);
    expect([...out].map((s) => s.name).sort()).toEqual(['A', 'C', 'D', 'X']);
  });

  test('fewer than 4 stops are returned unchanged (2-opt needs ≥4)', () => {
    const three = [P(0, 0, 'A'), P(0, 1, 'B'), P(0, 2, 'C')];
    expect(ids(twoOptOrder(three, null))).toBe('A,B,C');
  });
});
