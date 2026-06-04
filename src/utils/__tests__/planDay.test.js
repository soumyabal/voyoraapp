/**
 * planDay.test.js — the one-tap, day-scoped "Plan my day" wrapper.
 * Locks the convergence guarantee (re-planning a planned day = no change → no loop)
 * and the honest triage (over-capacity → overflow; dark-day closed → unresolved;
 * seasonal closed → soft tip, NOT reported). Nothing is ever dropped.
 */
import { planDay } from '../autoArrange';

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
});
