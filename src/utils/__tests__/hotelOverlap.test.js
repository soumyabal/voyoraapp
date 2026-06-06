/**
 * hotelOverlap.test.js — edge cases for the ruleHotelOverlap Trip Check rule (hotel change /
 * over-booked nights). The golden snapshot pins the two representative shapes; this pins the
 * boundaries the snapshot doesn't: chains, exact fits (no false positive), the trip-end branch,
 * skipped stays, nights defaults, and 1-night trips.
 */
import { validateTrip } from '../tripValidator';

const D = ['2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16'];
const day = (i, activities) => ({ label: `Day ${i + 1}`, date: D[i], activities });
const stay = (id, nights, extra = {}) => ({ id, type: 'stay', name: id, time: '15:00', nights, ...extra });
const act = (id, time = '10:00') => ({ id, type: 'activity', name: id, time, durationMins: 60 });
const tripOf = (...days) => ({ families: [], days });
const overlaps = (trip) => validateTrip(trip).filter(w => w.type === 'hotel_overlap');

describe('ruleHotelOverlap — hotel change', () => {
  test('earlier hotel booked past the next check-in → flagged with a trim to nights actually slept', () => {
    const w = overlaps(tripOf(
      day(0, [stay('A', 2)]),
      day(1, [stay('B', 1)]),
      day(2, [act('x')]),
    ));
    expect(w).toHaveLength(1);
    expect(w[0].trimStayId).toBe('A');
    expect(w[0].trimToNights).toBe(1);
    expect(w[0].severity).toBe('warning');
    expect(w[0].title).toMatch(/next check-in/);
  });

  test('two hotels that fit back-to-back are NOT flagged', () => {
    expect(overlaps(tripOf(
      day(0, [stay('A', 1)]),
      day(1, [stay('B', 1)]),
      day(2, [act('x')]),
    ))).toHaveLength(0);
  });

  test('a chain of three overlapping hotels flags only the two that run over', () => {
    const w = overlaps(tripOf(
      day(0, [stay('A', 3)]),
      day(1, [stay('B', 3)]),
      day(2, [stay('C', 1)]),
      day(3, [act('x')]),
    ));
    expect(w.map(x => x.trimStayId).sort()).toEqual(['A', 'B']);
    w.forEach(x => expect(x.trimToNights).toBe(1));
  });
});

describe('ruleHotelOverlap — booked past the trip', () => {
  test('a single hotel booked longer than the trip is flagged (trip-end branch)', () => {
    const w = overlaps(tripOf(
      day(0, [stay('A', 5)]),
      day(1, [act('x')]),
    ));
    expect(w).toHaveLength(1);
    expect(w[0].trimToNights).toBe(1);            // a 2-day trip is 1 night
    expect(w[0].title).toMatch(/past your trip/);
  });

  test('a single hotel that exactly covers the trip is fine', () => {
    expect(overlaps(tripOf(
      day(0, [stay('A', 2)]),                      // covers nights 0 & 1 of a 3-day (2-night) trip
      day(1, [act('x')]),
      day(2, [act('y')]),
    ))).toHaveLength(0);
  });

  test('a 1-night trip with one hotel is fine', () => {
    expect(overlaps(tripOf(
      day(0, [stay('A', 1)]),
      day(1, [act('x')]),
    ))).toHaveLength(0);
  });
});

describe('ruleHotelOverlap — robustness', () => {
  test('skipped stays are ignored', () => {
    expect(overlaps(tripOf(
      day(0, [stay('A', 3, { status: 'skipped' })]),
      day(1, [act('x')]),
    ))).toHaveLength(0);
  });

  test('a stay with no nights field defaults to 1 and never self-flags', () => {
    expect(overlaps(tripOf(
      day(0, [{ id: 'A', type: 'stay', name: 'A', time: '15:00' }]),
      day(1, [act('x')]),
      day(2, [act('y')]),
    ))).toHaveLength(0);
  });

  test('no stays → no warnings', () => {
    expect(overlaps(tripOf(day(0, [act('x')]), day(1, [act('y')])))).toHaveLength(0);
  });
});
