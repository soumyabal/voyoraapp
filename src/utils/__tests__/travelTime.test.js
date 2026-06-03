/**
 * travelTime.test.js — the distance-aware Trip Check rule (Rule 1b). Two stops
 * far apart whose times don't leave room to travel get flagged; pure overlaps
 * stay with Rule 1; far-in-time or coordinate-less pairs stay silent.
 */
import { validateTrip } from '../tripValidator';

// ~10 km apart (0.09° lng at the equator) → ~30 min drive.
const NEAR = { lat: 0, lng: 0 };
const FAR  = { lat: 0, lng: 0.09 };

const trip = (acts) => ({
  families: [],
  days: [{ label: 'Day 1', date: '2026-06-12', activities: acts }],
});
const act = (id, time, coords, extra = {}) => ({
  id, type: 'activity', name: id, time, durationMins: 120, ...coords, ...extra,
});

const travelWarns = (acts) => validateTrip(trip(acts)).filter(w => w.type === 'travel_time');

describe('distance-aware travel rule', () => {
  test('far apart with too little time between → flagged', () => {
    // A ends 11:00; B starts 11:10 → 10 min gap, but ~30 min away.
    const w = travelWarns([act('A', '09:00', NEAR), act('B', '11:10', FAR)]);
    expect(w).toHaveLength(1);
    expect(w[0].actIds).toEqual(['A', 'B']);
    expect(w[0].severity).toBe('error');     // 20 min short
    expect(w[0].icon).toBe('🚗');
  });

  test('plenty of time to travel → no warning', () => {
    // A ends 11:00; B starts 14:00 → 3h gap covers the drive.
    expect(travelWarns([act('A', '09:00', NEAR), act('B', '14:00', FAR)])).toHaveLength(0);
  });

  test('a pure time overlap is left to Rule 1, not double-counted', () => {
    // A 09:00–11:00 overlaps B at 10:30 → overlap rule, NOT travel rule.
    const all = validateTrip(trip([act('A', '09:00', NEAR), act('B', '10:30', FAR)]));
    expect(all.filter(w => w.type === 'travel_time')).toHaveLength(0);
    expect(all.filter(w => w.type === 'overlap').length).toBeGreaterThanOrEqual(1);
  });

  test('no coordinates → no travel warning', () => {
    expect(travelWarns([act('A', '09:00', {}), act('B', '11:10', {})])).toHaveLength(0);
  });

  test('a transport leg between stops accounts for the travel → no warning', () => {
    const acts = [
      act('A', '09:00', NEAR),
      { id: 'Drive', type: 'transport', subtype: 'car', name: 'Drive', time: '11:00', ...NEAR },
      act('B', '11:10', FAR),
    ];
    expect(travelWarns(acts)).toHaveLength(0);
  });
});
