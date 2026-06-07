/**
 * tzShiftRule.test.js — the timezone_shift Trip-Check tip (a day whose located stops cross a
 * UTC offset). Kept OUT of the golden snapshot fixtures on purpose: those coords all sit at
 * (0,0)=GMT, so the rule is a no-op there and the snapshot stays byte-identical.
 */
import { validateTrip } from '../tripValidator';

const day  = (date, activities) => ({ label: date, date, activities });
const trip = (days) => ({ families: [], days });
const LA   = { lat: 34.05, lng: -118.24 };   // America/Los_Angeles (PDT in summer, -7)
const NYC  = { lat: 40.71, lng: -74.00 };    // America/New_York  (EDT in summer, -4)
const shifts = (t) => validateTrip(t).filter(w => w.type === 'timezone_shift');

describe('ruleTimezoneShift', () => {
  test('an eastbound day fires one info tip — clocks go forward 3h', () => {
    const w = shifts(trip([day('2026-07-11', [
      { id: 'dep', type: 'transport', name: 'Flight', time: '09:00', ...LA },
      { id: 'arr', type: 'activity',  name: 'Dinner', time: '18:00', ...NYC },
    ])]));
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe('info');
    expect(w[0].message).toMatch(/forward 3h/);
    expect(w[0].actIds).toEqual(['dep', 'arr']);
  });

  test('a westbound day reads "back"', () => {
    const w = shifts(trip([day('2026-07-11', [
      { id: 'dep', type: 'transport', name: 'Flight', time: '09:00', ...NYC },
      { id: 'arr', type: 'activity',  name: 'Hotel',  time: '12:00', ...LA },
    ])]));
    expect(w[0].message).toMatch(/back 3h/);
  });

  test('a single-zone day does NOT fire', () => {
    expect(shifts(trip([day('2026-07-11', [
      { id: 'a', type: 'activity', name: 'A', time: '09:00', ...LA },
      { id: 'b', type: 'activity', name: 'B', time: '18:00', ...LA },
    ])]))).toHaveLength(0);
  });

  test('fewer than two located stops does NOT fire', () => {
    expect(shifts(trip([day('2026-07-11', [
      { id: 'a', type: 'activity', name: 'A', time: '09:00', ...NYC },
      { id: 'b', type: 'activity', name: 'B', time: '18:00' },   // no coords
    ])]))).toHaveLength(0);
  });
});
