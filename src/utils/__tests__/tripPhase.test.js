/**
 * tripPhase.test.js — trip lifecycle (before/during/after) + the landing-day fix
 * for "a not-started trip opens on Day 2".
 */
import { tripPhase, defaultDayFor, daysBetweenISO, nowNextOf } from '../helpers';

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

describe('daysBetweenISO', () => {
  test('counts whole days', () => expect(daysBetweenISO('2026-07-10', '2026-07-12')).toBe(2));
  test('handles a month boundary', () => expect(daysBetweenISO('2026-06-30', '2026-07-02')).toBe(2));
  test('same day → 0', () => expect(daysBetweenISO('2026-07-10', '2026-07-10')).toBe(0));
});
