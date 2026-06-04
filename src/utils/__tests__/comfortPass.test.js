/**
 * comfortPass.test.js — the gentle feasibility sweep that fixes the gap scheduleDay's
 * per-TYPE placement misses: the travel leg between a meal and the next far-away sight
 * (the real "leave breakfast 09:45 for a stop 52 min away at 10:00" bug). Soft stops get
 * pushed just enough to clear the drive + opening hours; LOCKED stops never move; the
 * pass is idempotent and returns an explicit diff for the preview.
 */
import { comfortPass } from '../autoArrange';
import { travelLeg } from '../geo';
import { estimateDuration } from '../tripValidator';
import { timeToMin } from '../slots';

const HOME = { lat: 43.0, lng: -89.0 };
const FAR = { lat: 43.16, lng: -89.0 }; // ~17–18 km north → a real ~50 min drive
const endOf = (a) => timeToMin(a.time) + Math.max(15, estimateDuration(a)); // mirrors BUFFER_MIN

describe('comfortPass — travel feasibility across types', () => {
  test('pushes a soft sight late enough to clear the drive from breakfast', () => {
    const acts = [
      { id: 'b', type: 'food', name: 'Breakfast', time: '09:00', ...HOME },
      { id: 'c', type: 'activity', name: 'Circus World', time: '10:00', ...FAR },
    ];
    const { adjusted, changes } = comfortPass(acts);
    const b = adjusted.find((a) => a.id === 'b');
    const c = adjusted.find((a) => a.id === 'c');
    const leg = travelLeg(b, c);
    expect(leg.min).toBeGreaterThan(30); // it really is a long drive
    expect(timeToMin(c.time)).toBeGreaterThanOrEqual(endOf(b) + leg.min); // gap now clears it
    expect(b.time).toBe('09:00'); // the anchor (first stop) didn't move
    expect(changes.find((ch) => ch.actId === 'c')).toBeTruthy(); // reported in the diff
  });

  test('idempotent — re-running a comfortable day yields no changes', () => {
    const acts = [
      { id: 'b', type: 'food', name: 'Breakfast', time: '09:00', ...HOME },
      { id: 'c', type: 'activity', name: 'Circus World', time: '10:00', ...FAR },
    ];
    const once = comfortPass(acts).adjusted;
    expect(comfortPass(once).changes).toEqual([]);
  });

  test('a day that already clears its legs is left untouched', () => {
    const acts = [
      { id: 'a', type: 'activity', name: 'A', time: '09:00', ...HOME },
      { id: 'b', type: 'activity', name: 'B', time: '14:00', ...HOME },
    ];
    expect(comfortPass(acts).changes).toEqual([]);
  });
});

describe('comfortPass — locks & hours', () => {
  test('a LOCKED stop is never moved — reported as tight instead', () => {
    const acts = [
      { id: 'b', type: 'food', name: 'Breakfast', time: '09:00', ...HOME },
      { id: 'c', type: 'activity', name: 'Booked Tour', time: '10:00', timeLocked: true, ...FAR },
    ];
    const { adjusted, changes, unresolved } = comfortPass(acts);
    expect(adjusted.find((a) => a.id === 'c').time).toBe('10:00'); // immovable
    expect(changes.find((ch) => ch.actId === 'c')).toBeFalsy();
    expect(unresolved.some((u) => u.actId === 'c' && u.reason === 'tight')).toBe(true);
  });

  test("respects opening hours — won't start a venue before it opens", () => {
    // Fri 2026-06-12 = weekday 5; venue opens 11:00.
    const acts = [
      { id: 'a', type: 'activity', name: 'Early', time: '09:00', ...HOME },
      { id: 'b', type: 'activity', name: 'Opens 11', time: '10:00', ...HOME, openHours: [{ d: 5, o: 11 * 60, c: 18 * 60 }] },
    ];
    const { adjusted } = comfortPass(acts, { date: '2026-06-12' });
    expect(timeToMin(adjusted.find((a) => a.id === 'b').time)).toBeGreaterThanOrEqual(11 * 60);
  });

  test('missing coords → falls back to a buffer, never crashes', () => {
    const acts = [
      { id: 'a', type: 'activity', name: 'A', time: '09:00' },
      { id: 'b', type: 'activity', name: 'B', time: '09:05' },
    ];
    const { adjusted } = comfortPass(acts);
    expect(timeToMin(adjusted.find((a) => a.id === 'b').time)).toBeGreaterThanOrEqual(endOf(adjusted.find((a) => a.id === 'a')));
  });
});
