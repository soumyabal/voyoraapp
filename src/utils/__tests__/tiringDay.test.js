/**
 * tiringDay.test.js — the "long day on your feet" tip: catches a FEW-but-LONG day
 * (e.g. two hikes + a park = 3 stops, ~13h) that the count-based 'packed' rule misses.
 */
import { validateTrip } from '../tripValidator';

const day = (label, date, activities) => ({ label, date, activities });
const A = (name, durationMins, time) => ({ id: name, type: 'activity', name, time, durationMins });
const has = (w, type) => w.some((x) => x.type === type);

describe('tiring_day rule', () => {
  test('a few-but-LONG day (6h hike + 7h park = 13h, 2 stops) flags the tip', () => {
    const trip = { families: [], days: [day('D1', '2026-07-10', [A('Hike', 360, '08:00'), A('Theme Park', 420, '14:30')])] };
    expect(has(validateTrip(trip), 'tiring_day')).toBe(true); // 780 min > 600
  });

  test('a normal day (under ~10h of activities) does NOT flag it', () => {
    const trip = { families: [], days: [day('D1', '2026-07-10', [A('Museum', 120, '10:00'), A('Park', 150, '14:00')])] };
    expect(has(validateTrip(trip), 'tiring_day')).toBe(false); // 270 min < 600
  });

  test('a single long venue does NOT trigger it (needs >= 2 stops)', () => {
    const trip = { families: [], days: [day('D1', '2026-07-10', [{ id: 'p', type: 'activity', name: 'All-day Park', time: '09:00', durationMins: 700 }])] };
    expect(has(validateTrip(trip), 'tiring_day')).toBe(false);
  });

  test('meals and transport do not count toward the hours-on-your-feet total', () => {
    const trip = { families: [], days: [day('D1', '2026-07-10', [
      A('Walk', 300, '09:00'),
      { id: 'lunch', type: 'food', name: 'Long lunch', time: '14:30', durationMins: 200 },
      { id: 'drive', type: 'transport', subtype: 'car', name: 'Drive', time: '18:00', durationMins: 200 },
    ])] };
    // Only the 300-min activity counts → 300 < 600, and only 1 touring stop → no tip.
    expect(has(validateTrip(trip), 'tiring_day')).toBe(false);
  });
});
