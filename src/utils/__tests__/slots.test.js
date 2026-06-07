/**
 * slots.test.js — suggested add-times must never land at midnight, and the
 * scheduler must never leave a daytime stop before the day starts. (Regression:
 * the Morning slot's range started at 00:00, so a 2nd morning stop placed in the
 * leading gap landed at "00:00 · Closed".)
 */
import {
  getSuggestedTime, getSlotKey, getSlotDefaultTime, getSlotCount,
  getSmartTime, timeToMin, minToTime,
} from '../slots';
import { scheduleDay } from '../autoArrange';

const tripWith = (acts) => ({ families: [], days: [{ label: 'Day 1', date: '2026-06-12', activities: acts }] });

describe('slot suggested time never lands at midnight', () => {
  test('empty morning → 09:00', () => {
    expect(getSuggestedTime(tripWith([]), 0, 'morning', 60)).toBe('09:00');
  });

  test('2nd morning stop with a leading gap → 09:00, NOT 00:00 (the bug)', () => {
    const t = tripWith([{ id: 'a', type: 'activity', name: 'Falls', time: '10:00' }]);
    const s = getSuggestedTime(t, 0, 'morning', 60);
    expect(s).not.toBe('00:00');
    expect(s >= '09:00').toBe(true);
  });

  test('a 2nd stop when one already sits AT the slot default does NOT stack at 09:00', () => {
    // The reported bug: manual entry seeded 09:00 every time, so two fuel stops both
    // landed at 09:00. The seed now uses getSuggestedTime → the 2nd must move past it.
    const t = tripWith([{ id: 'fuel', type: 'activity', name: 'Fuel stop', time: '09:00', durationMins: 120 }]);
    const s = getSuggestedTime(t, 0, 'morning');
    expect(s).not.toBe('09:00');
    expect(s > '09:00').toBe(true);
    expect(s < '12:00').toBe(true); // still a morning time
  });

  test('a FULL morning suggests a morning time, not an afternoon spill', () => {
    const t = tripWith([
      { id: 'a', type: 'activity', name: 'X', time: '09:00', durationMins: 90 },
      { id: 'b', type: 'activity', name: 'Y', time: '10:45', durationMins: 90 },
    ]);
    const s = getSuggestedTime(t, 0, 'morning', 60);
    expect(s < '12:00').toBe(true); // stays inside the morning slot
  });
});

describe('getSuggestedTime respects the place opening hours', () => {
  // 2026-06-12 is a Friday (weekday 5).
  const HOURS_10_5 = [{ d: 5, o: 10 * 60, c: 17 * 60 }]; // Fri 10 AM–5 PM

  test('a place that closes at 5 is NOT suggested for the evening — snapped into hours (the bug)', () => {
    // Evening slot would suggest 18:00; a 10–5 venue must land while it is open.
    const t = getSuggestedTime(tripWith([]), 0, 'evening', 0, HOURS_10_5);
    expect(t <= '16:00').toBe(true); // 60-min visit still ends by 17:00
    expect(t >= '10:00').toBe(true);
  });

  test('an afternoon slot for a 10–5 place stays in the afternoon (already open)', () => {
    const t = getSuggestedTime(tripWith([]), 0, 'afternoon', 0, HOURS_10_5);
    expect(t >= '12:00' && t <= '16:00').toBe(true);
  });

  test('a morning-only venue requested in the afternoon snaps back into the morning window', () => {
    const MORNING_ONLY = [{ d: 5, o: 8 * 60, c: 11 * 60 }]; // Fri 8–11
    const t = getSuggestedTime(tripWith([]), 0, 'afternoon', 0, MORNING_ONLY);
    expect(t >= '08:00' && t <= '10:00').toBe(true);
  });

  test('no openHours → unchanged slot behaviour', () => {
    expect(getSuggestedTime(tripWith([]), 0, 'evening')).toBe('18:00');
  });

  test('closed that weekday → leaves the slot suggestion (closed_venue Trip Check owns it)', () => {
    const MON_ONLY = [{ d: 1, o: 10 * 60, c: 17 * 60 }]; // open Mondays only; trip day is Friday
    expect(getSuggestedTime(tripWith([]), 0, 'evening', 0, MON_ONLY)).toBe('18:00');
  });
});

describe('time <-> minute helpers', () => {
  test('timeToMin parses HH:MM; missing/blank → 0', () => {
    expect(timeToMin('00:00')).toBe(0);
    expect(timeToMin('09:30')).toBe(570);
    expect(timeToMin('9:30')).toBe(570);   // unpadded
    expect(timeToMin('23:59')).toBe(1439);
    expect(timeToMin('')).toBe(0);
    expect(timeToMin(null)).toBe(0);
  });

  test('minToTime pads, clamps negatives to 00:00, wraps the hour by 24', () => {
    expect(minToTime(0)).toBe('00:00');
    expect(minToTime(570)).toBe('09:30');
    expect(minToTime(-30)).toBe('00:00');  // clamped
    expect(minToTime(1500)).toBe('01:00'); // 25:00 wraps to 01:00
  });
});

describe('getSlotKey — classification by time of day (every band)', () => {
  test('morning < 12:00, afternoon < 17:00, evening < 21:00, else night', () => {
    expect(getSlotKey('06:00')).toBe('morning');
    expect(getSlotKey('11:59')).toBe('morning');
    expect(getSlotKey('12:00')).toBe('afternoon');
    expect(getSlotKey('16:59')).toBe('afternoon');
    expect(getSlotKey('17:00')).toBe('evening');
    expect(getSlotKey('20:59')).toBe('evening');
    expect(getSlotKey('21:00')).toBe('night');
    expect(getSlotKey('23:30')).toBe('night');
    expect(getSlotKey('')).toBe('morning');   // blank → 00:00 → morning
  });
});

describe('getSlotDefaultTime', () => {
  test('each slot returns its default; unknown key falls back to 09:00', () => {
    expect(getSlotDefaultTime('morning')).toBe('09:00');
    expect(getSlotDefaultTime('afternoon')).toBe('13:00');
    expect(getSlotDefaultTime('evening')).toBe('18:00');
    expect(getSlotDefaultTime('night')).toBe('21:00');
    expect(getSlotDefaultTime('nope')).toBe('09:00');
  });
});

describe('getSlotCount — non-skipped activities in a slot', () => {
  test('counts only matching, non-skipped stops; missing day → 0', () => {
    const t = tripWith([
      { id: 'a', type: 'activity', name: 'A', time: '09:00' },
      { id: 'b', type: 'activity', name: 'B', time: '10:30' },
      { id: 'c', type: 'activity', name: 'C', time: '13:00' },          // afternoon
      { id: 'd', type: 'activity', name: 'D', time: '11:00', status: 'skipped' }, // excluded
    ]);
    expect(getSlotCount(t, 0, 'morning')).toBe(2);
    expect(getSlotCount(t, 0, 'afternoon')).toBe(1);
    expect(getSlotCount(t, 0, 'night')).toBe(0);
    expect(getSlotCount(t, 99, 'morning')).toBe(0); // no such day
  });
});

describe('getSmartTime — gap finder edges', () => {
  test('an unknown slot key → null', () => {
    expect(getSmartTime(tripWith([]), 0, 'nope', 60)).toBeNull();
  });

  test('a missing day → the slot default time', () => {
    expect(getSmartTime(tripWith([]), 99, 'morning', 60)).toBe('09:00');
  });

  test('a packed slot with no gap that fits → null (Full)', () => {
    // Morning window is 540–720 (180 min); one 180-min stop fills it entirely.
    const t = tripWith([{ id: 'a', type: 'activity', name: 'Long', time: '09:00', durationMins: 180 }]);
    expect(getSmartTime(t, 0, 'morning', 60)).toBeNull();
  });
});

describe('getSuggestedTime — fallbacks', () => {
  test('an unknown slot key still returns a safe 09:00 (never blocks)', () => {
    expect(getSuggestedTime(tripWith([]), 0, 'nope')).toBe('09:00');
  });

  test('a full morning still yields a morning time (clamped inside the slot)', () => {
    const t = tripWith([{ id: 'a', type: 'activity', name: 'Long', time: '09:00', durationMins: 180 }]);
    const s = getSuggestedTime(t, 0, 'morning', 60);
    expect(s >= '09:00' && s <= '11:00').toBe(true); // inside morning, end by 12:00
  });
});

describe('scheduleDay never places a daytime activity before the day starts', () => {
  test('a stop stuck at 00:00 is re-timed to >= 09:00', () => {
    const out = scheduleDay(
      [{ id: 'a', type: 'activity', name: 'Park', time: '00:00', lat: 0, lng: 0, durationMins: 60 }],
      { date: '2026-06-12' },
    );
    expect(out[0].time >= '09:00').toBe(true);
  });

  test('multiple midnight stops all re-time into the day', () => {
    const acts = ['A', 'B', 'C'].map((id, i) => ({
      id, type: 'activity', name: id, time: '00:00', lat: 0, lng: 0.001 * i, durationMins: 60,
    }));
    const out = scheduleDay(acts, { date: '2026-06-12' });
    out.filter((a) => a.type === 'activity').forEach((a) => expect(a.time >= '09:00').toBe(true));
  });
});
