/**
 * crossZoneTimeRules.test.js — the time rules (overlap / travel_time) read BOTH stops on one clock
 * across a timezone. On a day that crosses a zone, two wall-clocks aren't directly comparable
 * (16:30 CDT is *later* than 17:00 EDT). Single-zone / no-coords days keep the naive wall-clock rule.
 */
import { validateTrip } from '../tripValidator';

const HOLLAND = { lat: 42.79, lng: -86.11 };   // west Michigan — Eastern (EDT, UTC−4 in June)
const CHICAGO = { lat: 41.88, lng: -87.63 };   // Illinois — Central (CDT, UTC−5)
const DETROIT = { lat: 42.33, lng: -83.05 };   // Michigan — Eastern (EDT)
const dayOf = (activities) => ({ families: [], days: [{ label: 'Day 1', date: '2026-06-13', activities }] });
const overlaps = (trip) => validateTrip(trip).filter(w => w.type === 'overlap');

describe('overlap is timezone-aware', () => {
  test('westward (EDT→CDT): a 16:30 CDT stop after a 16:00–17:00 EDT stop is NOT a false overlap', () => {
    // 16:30 CDT = 17:30 EDT — AFTER the 17:00 EDT end. The naive wall-clock (16:30 < 17:00) is wrong.
    expect(overlaps(dayOf([
      { id: 'm', type: 'activity', name: 'Holland Museum', time: '16:00', durationMins: 60, ...HOLLAND },
      { id: 'd', type: 'activity', name: 'Chicago Dinner', time: '16:30', durationMins: 60, ...CHICAGO },
    ]))).toHaveLength(0);
  });

  test('eastward (CDT→EDT): a real overlap the naive wall-clock would MISS is caught', () => {
    // 19:00 EDT = 18:00 CDT — BEFORE the 18:30 CDT museum end (a true 30-min overlap).
    expect(overlaps(dayOf([
      { id: 'm', type: 'activity', name: 'Chicago Museum', time: '17:00', durationMins: 90, ...CHICAGO },
      { id: 'd', type: 'activity', name: 'Detroit Dinner', time: '19:00', durationMins: 60, ...DETROIT },
    ]))).toHaveLength(1);
  });

  test('control — same wall-clocks with NO coords keep the naive overlap (unchanged behaviour)', () => {
    expect(overlaps(dayOf([
      { id: 'm', type: 'activity', name: 'Museum', time: '16:00', durationMins: 60 },
      { id: 'd', type: 'activity', name: 'Dinner', time: '16:30', durationMins: 60 },
    ])).length).toBeGreaterThan(0);
  });
});
