/**
 * hours.test.js — opening-hours helpers + the closed_venue Trip Check rule.
 * 2026-06-12 is a Friday (weekday 5).
 */
import { weekdayOf, isOpenAt, hoursLabel } from '../hours';
import { validateTrip } from '../tripValidator';

const FRI = 5;
const NINE_TO_FIVE = [{ d: FRI, o: 9 * 60, c: 17 * 60 }];

describe('weekdayOf', () => {
  test('parses local weekday', () => {
    expect(weekdayOf('2026-06-12')).toBe(5);   // Friday
    expect(weekdayOf('2026-06-14')).toBe(0);   // Sunday
  });
  test('bad input → null', () => {
    expect(weekdayOf('')).toBeNull();
    expect(weekdayOf(null)).toBeNull();
  });
});

describe('isOpenAt', () => {
  test('inside / outside hours', () => {
    expect(isOpenAt(NINE_TO_FIVE, FRI, 13 * 60)).toBe(true);   // 1 PM
    expect(isOpenAt(NINE_TO_FIVE, FRI, 18 * 60)).toBe(false);  // 6 PM
  });
  test('closed that weekday → false', () => {
    expect(isOpenAt(NINE_TO_FIVE, 1 /* Mon */, 13 * 60)).toBe(false);
  });
  test('unknown hours → null', () => {
    expect(isOpenAt(null, FRI, 13 * 60)).toBeNull();
    expect(isOpenAt([], FRI, 13 * 60)).toBeNull();
  });
});

describe('hoursLabel', () => {
  test('formats a range', () => {
    expect(hoursLabel(NINE_TO_FIVE, FRI)).toBe('9 AM–5 PM');
  });
  test('split hours join with a comma', () => {
    const oh = [{ d: FRI, o: 11 * 60, c: 14 * 60 }, { d: FRI, o: 17 * 60, c: 22 * 60 }];
    expect(hoursLabel(oh, FRI)).toBe('11 AM–2 PM, 5 PM–10 PM');
  });
  test('24 h, closed, and unknown', () => {
    expect(hoursLabel([{ d: FRI, o: 0, c: 1440 }], FRI)).toBe('Open 24 h');
    expect(hoursLabel(NINE_TO_FIVE, 1)).toBe('Closed');     // not open Monday
    expect(hoursLabel(null, FRI)).toBe('');
  });
});

describe('closed_venue rule', () => {
  const trip = (acts) => ({ families: [], days: [{ label: 'Day 1', date: '2026-06-12', activities: acts }] });
  const closedWarns = (acts) => validateTrip(trip(acts)).filter(w => w.type === 'closed_venue');

  test('an attraction scheduled after closing is flagged', () => {
    const w = closedWarns([{ id: 'Museum', type: 'activity', name: 'Museum', time: '18:00', openHours: NINE_TO_FIVE }]);
    expect(w).toHaveLength(1);
    expect(w[0].actIds).toEqual(['Museum']);
    expect(w[0].message).toContain('open 9 AM–5 PM');
  });
  test('scheduled within hours → no warning', () => {
    expect(closedWarns([{ id: 'Museum', type: 'activity', name: 'Museum', time: '13:00', openHours: NINE_TO_FIVE }])).toHaveLength(0);
  });
  test('no hours data → no warning', () => {
    expect(closedWarns([{ id: 'X', type: 'activity', name: 'X', time: '23:00' }])).toHaveLength(0);
  });
});
