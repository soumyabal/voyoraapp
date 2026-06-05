/**
 * slots.test.js — suggested add-times must never land at midnight, and the
 * scheduler must never leave a daytime stop before the day starts. (Regression:
 * the Morning slot's range started at 00:00, so a 2nd morning stop placed in the
 * leading gap landed at "00:00 · Closed".)
 */
import { getSuggestedTime } from '../slots';
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
