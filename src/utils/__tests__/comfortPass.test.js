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
const FAR = { lat: 43.7, lng: -89.0 }; // ~78 km north → a real ~1 h drive at highway speed
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

  test('a venue the travel push would land AFTER it closes is UNSCHEDULED, not placed at a closed time (the 17:45-for-a-5pm-venue bug)', () => {
    // Fri 2026-06-12 = wd 5. A 2h stop far away ends + drive pushes the next stop past 5pm.
    const acts = [
      { id: 'first', type: 'activity', name: 'Big Park', time: '15:00', durationMins: 120, lat: 43.0, lng: -89.0 },
      { id: 'garden', type: 'activity', name: 'Botanic Garden', time: '15:30', durationMins: 90, lat: 43.7, lng: -89.0, openHours: [{ d: 5, o: 10 * 60, c: 17 * 60 }] },
    ];
    const { adjusted } = comfortPass(acts, { date: '2026-06-12' });
    const garden = adjusted.find((a) => a.id === 'garden');
    expect(garden.time).toBeNull();   // unscheduled — never shoved to ~17:45 (after 5pm close)
  });

  test('a LOCKED venue past its close keeps its time (user intent), flagged not unscheduled', () => {
    const acts = [
      { id: 'first', type: 'activity', name: 'Big Park', time: '15:00', durationMins: 120, lat: 43.0, lng: -89.0 },
      { id: 'g', type: 'activity', name: 'Garden', time: '18:00', timeLocked: true, durationMins: 90, lat: 43.7, lng: -89.0, openHours: [{ d: 5, o: 10 * 60, c: 17 * 60 }] },
    ];
    const { adjusted, unresolved } = comfortPass(acts, { date: '2026-06-12' });
    expect(adjusted.find((a) => a.id === 'g').time).toBe('18:00');           // locked → kept
    expect(unresolved.some((u) => u.actId === 'g')).toBe(true);
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

  test('a day too spread out flags day_full instead of wrapping past midnight', () => {
    // Four+ hours of driving between stops can cascade a start past 24:00; minToTime
    // wraps (29:50 → 05:50). The guard must report day_full and never emit a pre-dawn time.
    const A = { lat: 43.0, lng: -89.0 }, B = { lat: 46.0, lng: -89.0 }, C = { lat: 49.0, lng: -89.0 }; // ~333 km apart each
    const acts = [
      { id: 'a', type: 'activity', name: 'A', time: '09:00', ...A },
      { id: 'b', type: 'activity', name: 'B', time: '13:00', ...B },
      { id: 'c', type: 'activity', name: 'C', time: '18:00', ...C },
    ];
    const { adjusted, unresolved } = comfortPass(acts);
    expect(unresolved.some((u) => u.reason === 'day_full')).toBe(true);
    adjusted.forEach((a) => expect(timeToMin(a.time)).toBeGreaterThanOrEqual(9 * 60)); // never wrapped to early AM
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

describe('comfortPass — the first stop clears the drive from where the day STARTS', () => {
  const HQ = { lat: 42.15, lng: -87.98 };    // home (Buffalo Grove area)
  const DEST = { lat: 44.76, lng: -85.62 };  // ~350 km away (Traverse City) — the real bug

  test('a far start anchor pushes the first stop to a realistic arrival (not 8am)', () => {
    const acts = [{ id: 's', type: 'activity', name: 'Maple Bay', time: '08:00', ...DEST }];
    const { adjusted, changes } = comfortPass(acts, { anchor: HQ });
    const leg = travelLeg(HQ, DEST);
    expect(timeToMin(adjusted.find(a => a.id === 's').time)).toBeGreaterThanOrEqual(8 * 60 + leg.min); // 8am depart + drive
    expect(timeToMin(adjusted.find(a => a.id === 's').time)).toBeGreaterThan(11 * 60);                 // an afternoon arrival
    expect(changes.find(c => c.actId === 's')).toBeTruthy();
  });

  test('idempotent with a far anchor — re-running yields no further changes', () => {
    const acts = [{ id: 's', type: 'activity', name: 'Maple Bay', time: '08:00', ...DEST }];
    const once = comfortPass(acts, { anchor: HQ }).adjusted;
    expect(comfortPass(once, { anchor: HQ }).changes).toEqual([]);   // convergent (QA P1)
  });

  test('a NEAR start anchor leaves the morning untouched', () => {
    const hotel = { lat: 44.75, lng: -85.60 };   // ~3 km from the stop
    const acts = [{ id: 's', type: 'activity', name: 'Beach', time: '09:00', ...DEST }];
    const { adjusted, changes } = comfortPass(acts, { anchor: hotel });
    expect(adjusted.find(a => a.id === 's').time).toBe('09:00');   // 8am + a few min < 9am → no push
    expect(changes).toEqual([]);
  });

  test('no anchor → unchanged (today\'s behavior)', () => {
    const acts = [{ id: 's', type: 'activity', name: 'X', time: '08:00', ...DEST }];
    expect(comfortPass(acts, {}).changes).toEqual([]);
  });

  test('a flight-distance anchor caps the first stop at ~15:00 (not a 25h-drive time)', () => {
    const CHI = { lat: 41.88, lng: -87.63 };
    const FLA = { lat: 28.0, lng: -81.7 };   // ~1500 km — a flight, not a drive
    const acts = [{ id: 's', type: 'activity', name: 'Park', time: '08:00', ...FLA }];
    const { adjusted } = comfortPass(acts, { anchor: CHI });
    expect(timeToMin(adjusted.find(a => a.id === 's').time)).toBe(15 * 60);   // capped, never wrapped/day_full
  });

  test('a LOCKED early first stop with a far anchor is flagged tight, not moved', () => {
    const acts = [{ id: 's', type: 'activity', name: 'Maple Bay', time: '08:00', timeLocked: true, ...DEST }];
    const { adjusted, unresolved } = comfortPass(acts, { anchor: HQ });
    expect(adjusted.find(a => a.id === 's').time).toBe('08:00');    // locked → not moved
    expect(unresolved.some(u => u.actId === 's' && u.reason === 'tight')).toBe(true);
  });
});
