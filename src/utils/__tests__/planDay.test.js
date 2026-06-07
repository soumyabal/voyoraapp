/**
 * planDay.test.js — the one-tap, day-scoped "Plan my day" wrapper.
 * Locks the convergence guarantee (re-planning a planned day = no change → no loop)
 * and the honest triage (over-capacity → overflow; dark-day closed → unresolved;
 * seasonal closed → soft tip, NOT reported). Nothing is ever dropped.
 */
import { planDay } from '../autoArrange';
import { timeToMin } from '../slots';

const FRI = '2026-06-12'; // weekday 5
const act = (id, time, extra = {}) => ({
  id, type: 'activity', name: id, time, lat: 0, lng: 0, durationMins: 60, ...extra,
});

describe('planDay — convergence', () => {
  test('re-planning an already-planned day changes nothing (no loop)', () => {
    const acts = [act('A', '10:00'), act('B', '12:00'), act('C', '14:00')];
    const first = planDay(acts, { date: FRI, pace: 'moderate' });
    const second = planDay(first.scheduled, { date: FRI, pace: 'moderate' });
    expect(second.changed).toBe(false);
  });
});

describe('planDay — reorders into a clean route+time order, honoring locks', () => {
  test('a far/near/mid set is reordered by route (nearest from the anchor goes first)', () => {
    // A far, B near, C mid — nearest-neighbour from the origin puts B (nearest) first.
    // Plan-my-day now SORTS the day cleanly; it no longer keeps the typed A,B,C order.
    const at = (id, time, lat, lng) => ({ id, type: 'activity', name: id, time, durationMins: 60, lat, lng });
    const acts = [at('A', '09:00', 0.5, 0.5), at('B', '11:00', 0.01, 0.01), at('C', '13:00', 0.2, 0.2)];
    const r = planDay(acts, { date: FRI, pace: 'moderate', anchor: { lat: 0, lng: 0 } });
    const order = r.scheduled
      .filter((a) => a.type === 'activity' && a.time)
      .sort((x, y) => timeToMin(x.time) - timeToMin(y.time))
      .map((a) => a.id);
    expect(order).not.toEqual(['A', 'B', 'C']);                  // typed order no longer forced
    expect(order[0]).toBe('B');                                  // nearest to the anchor first
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A')); // near before far
  });

  test('a LOCKED stop stays at its time while the others reorder around it', () => {
    const at = (id, time, lat, lng, extra = {}) =>
      ({ id, type: 'activity', name: id, time, durationMins: 60, lat, lng, ...extra });
    // C is locked at 09:30; A (far) and B (near) reorder around it, but C never moves.
    const acts = [
      at('A', '09:00', 0.5, 0.5),
      at('B', '13:00', 0.01, 0.01),
      at('C', '09:30', 0.2, 0.2, { timeLocked: true }),
    ];
    const r = planDay(acts, { date: FRI, pace: 'moderate', anchor: { lat: 0, lng: 0 } });
    expect(r.scheduled.find((a) => a.id === 'C').time).toBe('09:30'); // locked anchor, unmoved
    const order = r.scheduled
      .filter((a) => a.type === 'activity' && a.time)
      .sort((x, y) => timeToMin(x.time) - timeToMin(y.time))
      .map((a) => a.id);
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));  // others still route-ordered
  });
});

describe('planDay — over-capacity', () => {
  test('reports overflow beyond the pace cap but keeps every item', () => {
    const acts = ['A', 'B', 'C', 'D', 'E'].map((id, i) => act(id, `${9 + i * 2}:00`));
    const r = planDay(acts, { date: FRI, pace: 'relaxed' }); // cap = 3
    expect(r.overflow).toHaveLength(2);
    expect(r.summary.overflowCount).toBe(2);
    expect(r.scheduled.filter((a) => a.type === 'activity')).toHaveLength(5); // nothing dropped
  });
});

describe('planDay — closed handling', () => {
  test('dark-day, non-seasonal closure → unresolved', () => {
    const acts = [act('History Museum', '11:00', { openHours: [{ d: 1, o: 540, c: 1020 }] })]; // open Mondays only
    const r = planDay(acts, { date: FRI, pace: 'moderate' });
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0].reason).toBe('closed');
  });

  test('seasonal venue is a soft tip, NOT reported as unresolved', () => {
    const acts = [act('Riverside Water Park', '11:00', { openHours: [{ d: 1, o: 540, c: 1020 }] })];
    const r = planDay(acts, { date: FRI, pace: 'moderate' });
    expect(r.unresolved).toHaveLength(0);
  });
});

describe('planDay — a day that runs past 22:00 is honestly flagged', () => {
  test('long stops crammed past day-end (within the cap) report day_full, not "planned"', () => {
    // 3 five-hour sights (under moderate cap 4 → not overflow), same spot so no travel
    // push — scheduleDay flows them 09:00, 14:15, 19:30 → the last ends ~00:35, past 22:00.
    const acts = [
      act('A', '09:00', { durationMins: 300 }),
      act('B', '14:00', { durationMins: 300 }),
      act('C', '19:00', { durationMins: 300 }),
    ];
    const r = planDay(acts, { date: FRI, pace: 'moderate' });
    expect(r.unresolved.some((u) => u.reason === 'day_full')).toBe(true);
    expect(r.scheduled.filter((a) => a.type === 'activity')).toHaveLength(3); // nothing dropped
  });

  test('a normal day that finishes by 22:00 has no day_full', () => {
    const acts = [act('A', '09:00'), act('B', '12:00'), act('C', '15:00')];
    const r = planDay(acts, { date: FRI, pace: 'moderate' });
    expect(r.unresolved.some((u) => u.reason === 'day_full')).toBe(false);
  });
});

describe('planDay — a locked stop is intent, not overflow', () => {
  test('a LOCKED substantial stop past the cap is never reported as capacity overflow', () => {
    // relaxed cap = 3. Four sights, the LATEST one pinned by the user → it lands in the
    // slice(cap) tail, but it's their booking, not an over-pack. Must NOT be flagged.
    const acts = [
      act('A', '09:00'), act('B', '11:00'), act('C', '13:00'),
      act('Booked Tour', '20:00', { timeLocked: true }),
    ];
    const r = planDay(acts, { date: FRI, pace: 'relaxed' });
    expect(r.overflow.find((o) => o.actId === 'Booked Tour')).toBeFalsy();
    expect(r.scheduled.find((a) => a.id === 'Booked Tour').time).toBe('20:00'); // locked, unmoved
  });

  test('a locked stop is never a movable leftover — not day_full, not checkout_heavy', () => {
    const at = (id, time, lat, lng, extra = {}) =>
      ({ id, type: 'activity', name: id, time, durationMins: 300, lat, lng, ...extra });
    // A locked 5-hour stop at 20:00 runs past day-end, and it's far on a checkout day —
    // but it's pinned intent, so neither flag should fire for it.
    const acts = [at('Pinned Late Far', '20:00', 1, 1, { timeLocked: true })];
    const r = planDay(acts, { date: FRI, pace: 'moderate', dayRole: 'departure', anchor: { lat: 0, lng: 0 } });
    expect(r.unresolved.some((u) => u.actId === 'Pinned Late Far')).toBe(false);
  });
});

describe('planDay — checkout-day intelligence', () => {
  const at = (id, time, lat, lng, extra = {}) =>
    ({ id, type: 'activity', name: id, time, durationMins: 60, lat, lng, ...extra });

  test('inserts a locked Check-out anchor at the hotel time when the caller asks', () => {
    const acts = [at('A', '11:00', 0, 0)];
    const r = planDay(acts, {
      date: FRI, pace: 'moderate', dayRole: 'departure', anchor: { lat: 0, lng: 0 },
      checkout: { name: 'Grand Hotel', time: '10:00', lat: 0, lng: 0 },
    });
    const co = r.scheduled.find((a) => a.checkout);
    expect(co).toBeTruthy();
    expect(co.time).toBe('10:00');                 // at the hotel's check-out time
    expect(co.timeLocked).toBe(true);              // fixed anchor
    expect(r.changes.some((c) => c.actId === co.id && c.from == null)).toBe(true); // shown as a new add
  });

  test('does not add a second check-out if one already exists (idempotent)', () => {
    const existing = { id: 'checkout-x', checkout: true, type: 'activity', timeLocked: true, name: 'Check out', time: '10:00', lat: 0, lng: 0, durationMins: 15 };
    const r = planDay([existing, at('A', '11:00', 0, 0)], {
      date: FRI, pace: 'moderate', dayRole: 'departure', anchor: { lat: 0, lng: 0 },
      checkout: { name: 'Grand Hotel', time: '10:00', lat: 0, lng: 0 },
    });
    expect(r.scheduled.filter((a) => a.checkout)).toHaveLength(1);
  });

  test('the check-out anchor does not eat a sightseeing slot (not counted as capacity)', () => {
    // relaxed cap = 3; exactly 3 sights + a checkout → checkout must not push a sight to overflow.
    const acts = ['A', 'B', 'C'].map((id, i) => at(id, `${9 + i * 2}:00`, 0, 0));
    const r = planDay(acts, {
      date: FRI, pace: 'relaxed', dayRole: 'departure', anchor: { lat: 0, lng: 0 },
      checkout: { name: 'Hotel', time: '10:00', lat: 0, lng: 0 },
    });
    expect(r.overflow).toHaveLength(0);
    expect(r.summary.scheduledCount).toBe(3);      // the checkout is not a "scheduled" sight
  });

  test('a far stop on the departure day is flagged checkout_heavy (move it earlier)', () => {
    const acts = [at('Near', '10:00', 0.01, 0.01), at('Far', '13:00', 1, 1)]; // ~157 km away
    const r = planDay(acts, { date: FRI, pace: 'moderate', dayRole: 'departure', anchor: { lat: 0, lng: 0 } });
    const heavy = r.unresolved.filter((u) => u.reason === 'checkout_heavy').map((u) => u.actId);
    expect(heavy).toContain('Far');
    expect(heavy).not.toContain('Near');
  });

  test('checkout_heavy only applies to the departure day, not a normal day', () => {
    const acts = [at('Far', '13:00', 1, 1)];
    const r = planDay(acts, { date: FRI, pace: 'moderate', dayRole: 'normal', anchor: { lat: 0, lng: 0 } });
    expect(r.unresolved.some((u) => u.reason === 'checkout_heavy')).toBe(false);
  });
});

describe('planDay — unpadded times sort chronologically (not as strings)', () => {
  test('a single-digit-hour time orders before a two-digit one (no "9:30 after 10:00")', () => {
    // Manually-entered "9:30" used to localeCompare AFTER "10:00" → mis-sequenced + drift.
    const acts = [act('Early', '9:30'), act('Late', '10:00')];
    const r = planDay(acts, { date: FRI, pace: 'moderate' });
    const early = r.scheduled.findIndex((a) => a.id === 'Early');
    const late = r.scheduled.findIndex((a) => a.id === 'Late');
    expect(early).toBeLessThan(late); // chronological, not "1" < "9"
  });

  test('idempotent even with unpadded input times (no string-sort drift)', () => {
    const acts = [act('A', '9:00'), act('B', '13:30'), act('C', '16:00')];
    const first = planDay(acts, { date: FRI, pace: 'moderate' });
    const second = planDay(first.scheduled, { date: FRI, pace: 'moderate' });
    expect(second.changed).toBe(false);
  });

  test('a stop entered unpadded but landing on the same minute shows NO cosmetic change', () => {
    // A lone 9am stop: scheduleDay places it at 09:00 (== "9:00" by minute). The padding
    // alone must NOT surface a "9:00 → 09:00" no-op in the preview diff.
    const acts = [act('A', '9:00')];
    const r = planDay(acts, { date: FRI, pace: 'moderate' });
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
  });
});

describe('planDay honors opening hours — unfit venues are unscheduled, never crammed past close', () => {
  const H_10_5 = [{ d: 5, o: 10 * 60, c: 17 * 60 }]; // Fri 10 AM–5 PM
  // 3h visits at the same spot (no travel): only ~2 fit a 10–5 window.
  const lh = (id, extra = {}) => ({ id, type: 'activity', name: id, time: '10:00', durationMins: 180, lat: 0, lng: 0, openHours: H_10_5, ...extra });

  test('three 10–5 venues: the ones that fit stay within hours, the rest are unscheduled (never after 17:00)', () => {
    const r = planDay([lh('A'), lh('B'), lh('C')], { date: FRI, pace: 'moderate' });
    const placed = r.scheduled.filter(a => a.time);
    const unsched = r.scheduled.filter(a => !a.time);
    placed.forEach(a => expect(timeToMin(a.time) + 180).toBeLessThanOrEqual(17 * 60)); // ends by close
    expect(unsched.length).toBeGreaterThanOrEqual(1);  // at least one can't fit
    expect(r.scheduled).toHaveLength(3);               // nothing dropped
    expect(r.unresolved.some(u => u.reason === 'no_fit_hours')).toBe(true);
  });

  test('convergent: re-running on a day with an unfit venue changes nothing (no loop)', () => {
    const first = planDay([lh('A'), lh('B'), lh('C')], { date: FRI, pace: 'moderate' });
    const second = planDay(first.scheduled, { date: FRI, pace: 'moderate' });
    expect(second.changed).toBe(false);
  });

  test('unknown-hours venue is never marked no_fit (flows freely)', () => {
    const free = { id: 'X', type: 'activity', name: 'X', time: '10:00', durationMins: 180, lat: 0, lng: 0 }; // no openHours
    const r = planDay([lh('A'), lh('B'), free], { date: FRI, pace: 'moderate' });
    expect(r.scheduled.find(a => a.id === 'X').time).toBeTruthy();
    expect(r.unresolved.some(u => u.actId === 'X')).toBe(false);
  });

  test('seasonal venue that cannot fit is placed (low-confidence hours), not declared no_fit', () => {
    const park = lh('Water Park'); // SEASONAL_RE matches "water park"
    const r = planDay([lh('A'), lh('B'), park], { date: FRI, pace: 'moderate' });
    expect(r.scheduled.find(a => a.id === 'Water Park').time).toBeTruthy();
    expect(r.unresolved.some(u => u.actId === 'Water Park' && u.reason === 'no_fit_hours')).toBe(false);
  });
});
