/**
 * endAnchor.test.js — the route can be fixed at BOTH ends: "wake → stops → departure".
 * On the last day, the finish anchor = the airport you fly home from, so stops flow
 * toward it instead of stranding you across town. (pathCost adds a final leg; 2-opt
 * optimizes the bracketed path.)
 */
import { routeOrder, pathCost } from '../autoArrange';

describe('end-anchored routing', () => {
  test('pathCost adds the final leg to the end anchor', () => {
    const start = { lat: 0, lng: 0 };
    const seq = [{ lat: 0, lng: 0 }, { lat: 0, lng: 5 }];
    const open = pathCost(seq, start);
    const bracketed = pathCost(seq, start, { lat: 0, lng: 10 });
    expect(bracketed).toBeGreaterThan(open); // + the leg from lng 5 → the lng 10 finish
  });

  test('the end anchor reorders 4+ stops to finish near the departure point', () => {
    // Wake at O; depart from E (far east). Start-only NN ends at B (north, away from E);
    // end-anchoring should reorder so the route finishes near E instead.
    const O = { lat: 0, lng: 0 }, E = { lat: 0, lng: 10 };
    const A = { id: 'A', lat: 0, lng: 1 }, C = { id: 'C', lat: 0, lng: 8 };
    const B = { id: 'B', lat: 8, lng: 0 }, D = { id: 'D', lat: 8, lng: 1 };
    const stops = [A, C, B, D];
    const open = routeOrder(stops, O);
    const bracketed = routeOrder(stops, O, E);
    // The end-anchored order is strictly cheaper once you must finish at E...
    expect(pathCost(bracketed, O, E)).toBeLessThan(pathCost(open, O, E));
    // ...so the two orders genuinely differ (the finish was taken into account).
    expect(bracketed.map(s => s.id)).not.toEqual(open.map(s => s.id));
  });

  test('no end anchor → identical to today (start-anchored only)', () => {
    const O = { lat: 0, lng: 0 };
    const stops = [{ id: 'A', lat: 0, lng: 3 }, { id: 'B', lat: 0, lng: 1 }, { id: 'C', lat: 0, lng: 2 }, { id: 'D', lat: 0, lng: 4 }];
    expect(routeOrder(stops, O, null).map(s => s.id)).toEqual(routeOrder(stops, O).map(s => s.id));
  });
});
