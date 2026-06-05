/**
 * hours.test.js — opening-hours helpers + the closed_venue Trip Check rule.
 * 2026-06-12 is a Friday (weekday 5).
 */
import { weekdayOf, isOpenAt, hoursLabel, weeklyHoursLabel, compactHours } from '../hours';
import { validateTrip } from '../tripValidator';

const FRI = 5;
const NINE_TO_FIVE = [{ d: FRI, o: 9 * 60, c: 17 * 60 }];

describe('compactHours (the 24/7 "shows Closed" bug)', () => {
  test('a 24/7 place (single open period, NO close) is open EVERY day, all day', () => {
    // Google represents open-24/7 as one period: open Sunday 00:00, no close.
    const oh = compactHours({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] });
    expect(oh).toHaveLength(7);
    // the actual bug: it must read OPEN on a Tuesday at 6pm (Mackinac Bridge), not Closed.
    expect(isOpenAt(oh, 2, 18 * 60)).toBe(true);
    expect(isOpenAt(oh, 5, 17 * 60)).toBe(true);
  });

  test('normal same-day hours map to one interval that day', () => {
    const oh = compactHours({ periods: [{ open: { day: 5, hour: 9 }, close: { day: 5, hour: 17 } }] });
    expect(oh).toEqual([{ d: 5, o: 540, c: 1020 }]);
    expect(isOpenAt(oh, 5, 12 * 60)).toBe(true);
    expect(isOpenAt(oh, 5, 18 * 60)).toBe(false);
  });

  test('a span past midnight splits into the open day + the early hours of the next', () => {
    // Fri 18:00 → Sat 02:00
    const oh = compactHours({ periods: [{ open: { day: 5, hour: 18 }, close: { day: 6, hour: 2 } }] });
    expect(oh).toEqual([{ d: 5, o: 1080, c: 1440 }, { d: 6, o: 0, c: 120 }]);
    expect(isOpenAt(oh, 6, 1 * 60)).toBe(true);   // 1am Saturday → still open
  });

  test('per-day 24h (open Mon 00:00, close Tue 00:00) → Monday only, all day', () => {
    const oh = compactHours({ periods: [{ open: { day: 1, hour: 0 }, close: { day: 2, hour: 0 } }] });
    expect(oh).toEqual([{ d: 1, o: 0, c: 1440 }]);
  });

  test('unknown hours → null', () => {
    expect(compactHours(null)).toBeNull();
    expect(compactHours({})).toBeNull();
    expect(compactHours({ periods: [] })).toBeNull();
  });
});

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

describe('weeklyHoursLabel — hours of operation, not a today status', () => {
  // The real bug: Boardman River Nature Center is open Tue–Fri 10–4, closed Mon/Sat/Sun.
  // Landing on a closed day must show WHEN it's open, not a bare "Closed".
  const NATURE_CTR = [2, 3, 4, 5].map((d) => ({ d, o: 10 * 60, c: 16 * 60 }));

  test('groups consecutive same-hours days into a range', () => {
    expect(weeklyHoursLabel(NATURE_CTR)).toBe('Tue–Fri 10 AM–4 PM');
  });
  test('Mon-first, with a separate weekend group', () => {
    const oh = [
      ...[1, 2, 3, 4, 5].map((d) => ({ d, o: 9 * 60, c: 17 * 60 })),
      { d: 6, o: 10 * 60, c: 14 * 60 },
    ];
    expect(weeklyHoursLabel(oh)).toBe('Mon–Fri 9 AM–5 PM, Sat 10 AM–2 PM');
  });
  test('a single open day is not a range', () => {
    expect(weeklyHoursLabel([{ d: 5, o: 9 * 60, c: 17 * 60 }])).toBe('Fri 9 AM–5 PM');
  });
  test('open 24/7 collapses to "Open 24 h"', () => {
    const oh = Array.from({ length: 7 }, (_, d) => ({ d, o: 0, c: 1440 }));
    expect(weeklyHoursLabel(oh)).toBe('Open 24 h');
  });
  test('a closed day breaks the range (not merged across the gap)', () => {
    const oh = [{ d: 1, o: 9 * 60, c: 17 * 60 }, { d: 3, o: 9 * 60, c: 17 * 60 }];
    expect(weeklyHoursLabel(oh)).toBe('Mon 9 AM–5 PM, Wed 9 AM–5 PM');
  });
  test('unknown / empty → ""', () => {
    expect(weeklyHoursLabel(null)).toBe('');
    expect(weeklyHoursLabel([])).toBe('');
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
