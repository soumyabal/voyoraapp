/**
 * tripPhase.test.js — trip lifecycle (before/during/after) + the landing-day fix
 * for "a not-started trip opens on Day 2".
 */
import { tripPhase, defaultDayFor, daysBetweenISO, nowNextOf, openFocusFor } from '../helpers';

const trip = (start, end, nDays) => ({
  startDate: start, endDate: end,
  days: Array.from({ length: nDays }, (_, i) => ({ label: `Day ${i + 1}` })),
});

describe('tripPhase', () => {
  const t = trip('2026-07-10', '2026-07-13', 4);
  test('upcoming before the start date', () => expect(tripPhase(t, '2026-07-04')).toBe('upcoming'));
  test('active on the start day', () => expect(tripPhase(t, '2026-07-10')).toBe('active'));
  test('active mid-trip', () => expect(tripPhase(t, '2026-07-12')).toBe('active'));
  test('active on the end day', () => expect(tripPhase(t, '2026-07-13')).toBe('active'));
  test('past after the end date', () => expect(tripPhase(t, '2026-07-14')).toBe('past'));
  test('undated when no dates', () => expect(tripPhase({ days: [] }, '2026-07-10')).toBe('undated'));
});

describe('defaultDayFor — the "Day 2 before you start" fix', () => {
  const t = trip('2026-07-10', '2026-07-13', 4);
  test('UPCOMING trip lands on Day 1 (index 0), never Day 2', () => expect(defaultDayFor(t, '2026-07-04')).toBe(0));
  test('ACTIVE: start day → index 0', () => expect(defaultDayFor(t, '2026-07-10')).toBe(0));
  test('ACTIVE: third day → index 2 (today is day 3 of the trip)', () => expect(defaultDayFor(t, '2026-07-12')).toBe(2));
  test('ACTIVE: clamps to the last day', () => expect(defaultDayFor(t, '2026-07-13')).toBe(3));
  test('PAST trip lands on Day 1 (recap)', () => expect(defaultDayFor(t, '2026-07-20')).toBe(0));
  test('undated trip → Day 1', () => expect(defaultDayFor({ days: [{}, {}] }, '2026-07-10')).toBe(0));
  test('no days → 0', () => expect(defaultDayFor({ startDate: '2026-07-10', endDate: '2026-07-13', days: [] }, '2026-07-11')).toBe(0));
});

describe('nowNextOf — live "now / next" orientation', () => {
  const day = { activities: [
    { name: 'Breakfast', time: '08:00' },
    { name: 'Museum', time: '10:00' },
    { name: 'Lunch', time: '13:00', status: 'skipped' }, // skipped → ignored
    { name: 'Park', time: '15:00' },
    { name: 'Note', time: '16:00', type: 'note' },        // note → ignored
  ] };
  test('mid-day: now = the latest started, next = the first upcoming', () => {
    const r = nowNextOf(day, 11 * 60); // 11:00
    expect(r.now.name).toBe('Museum');
    expect(r.next.name).toBe('Park'); // Lunch is skipped → next real is Park
  });
  test('before the first stop: no now, next is the first', () => {
    const r = nowNextOf(day, 7 * 60);
    expect(r.now).toBeNull();
    expect(r.next.name).toBe('Breakfast');
  });
  test('after the last stop: a now, no next', () => {
    const r = nowNextOf(day, 20 * 60);
    expect(r.now.name).toBe('Park');
    expect(r.next).toBeNull();
  });
  test('empty day → empty flag', () => {
    expect(nowNextOf({ activities: [] }, 600).empty).toBe(true);
  });
});

describe('openFocusFor — timezone-aware "open to now"', () => {
  // 4-day trip in LA; days carry activities so we can find now/next.
  const t = {
    startDate: '2026-07-10', endDate: '2026-07-13', defaultTz: 'America/Los_Angeles',
    days: [
      { label: 'Day 1', activities: [{ id: 'd1a', time: '09:00' }] },
      { label: 'Day 2', activities: [{ id: 'd2morning', time: '09:00' }, { id: 'd2afternoon', time: '14:00' }] },
      { label: 'Day 3', activities: [] },
      { label: 'Day 4', activities: [{ id: 'd4a', time: '09:00' }] },
    ],
  };

  test('ACTIVE: lands on the destination day + the current (already-started) activity', () => {
    // 2026-07-11 19:00 UTC = 12:00 PDT on the 11th → Day 2, 12:00 → "now" = the 09:00 stop
    const f = openFocusFor(t, Date.UTC(2026, 6, 11, 19, 0));
    expect(f).toEqual({ dayIndex: 1, activityId: 'd2morning' });
  });

  test('ACTIVE before the first stop → focuses the NEXT activity', () => {
    // 2026-07-11 15:00 UTC = 08:00 PDT → Day 2, before 09:00 → next = the 09:00 stop
    expect(openFocusFor(t, Date.UTC(2026, 6, 11, 15, 0)).activityId).toBe('d2morning');
  });

  test('the destination zone, not the device, decides the day', () => {
    // Same instant, but a Tokyo trip is a calendar day ahead → Day 3, not Day 2.
    const tokyo = { ...t, defaultTz: 'Asia/Tokyo' };
    // 2026-07-11 19:00 UTC = 2026-07-12 04:00 JST → Day 3 (index 2), which is empty → no activity
    expect(openFocusFor(tokyo, Date.UTC(2026, 6, 11, 19, 0))).toEqual({ dayIndex: 2, activityId: null });
  });

  test('UPCOMING → Day 1, no activity focus', () => {
    expect(openFocusFor(t, Date.UTC(2026, 6, 1, 19, 0))).toEqual({ dayIndex: 0, activityId: null });
  });

  test('PAST → Day 1 (recap), no activity focus', () => {
    expect(openFocusFor(t, Date.UTC(2026, 6, 20, 19, 0))).toEqual({ dayIndex: 0, activityId: null });
  });
});

describe('daysBetweenISO', () => {
  test('counts whole days', () => expect(daysBetweenISO('2026-07-10', '2026-07-12')).toBe(2));
  test('handles a month boundary', () => expect(daysBetweenISO('2026-06-30', '2026-07-02')).toBe(2));
  test('same day → 0', () => expect(daysBetweenISO('2026-07-10', '2026-07-10')).toBe(0));
});
