/**
 * tripGrouping.test.js — pure trip phase classification + grouping.
 * Uses fixed dates + an explicit `now` (local noon) with day-level gaps, so a sub-24h TZ offset
 * can't flip a classification.
 */
import { classifyTrip, groupTrips } from '../tripGrouping';

const NOW = new Date('2026-06-09T12:00:00').getTime(); // local noon, "today" = 2026-06-09

const trip = (over) => ({ id: 't', name: 'T', startDate: '2026-06-20', endDate: '2026-06-25', ...over });

describe('classifyTrip', () => {
  test('a trip whose range contains today is ongoing', () => {
    const r = classifyTrip(trip({ startDate: '2026-06-08', endDate: '2026-06-10' }), NOW);
    expect(r.phase).toBe('ongoing');
    expect(r.label).toBe('Happening now');
  });

  test('a future trip is upcoming with a countdown label', () => {
    const r = classifyTrip(trip({ startDate: '2026-06-20' }), NOW); // 11 days out
    expect(r.phase).toBe('upcoming');
    expect(r.days).toBe(11);
    expect(r.label).toBe('In 11 days');
  });

  test('upcoming edge labels: today / tomorrow', () => {
    expect(classifyTrip(trip({ startDate: '2026-06-09', endDate: '2026-06-09' }), NOW).phase).toBe('ongoing');
    expect(classifyTrip(trip({ startDate: '2026-06-10', endDate: '2026-06-12' }), NOW).label).toBe('Tomorrow');
  });

  test('a trip that already ended is past', () => {
    const r = classifyTrip(trip({ startDate: '2026-01-01', endDate: '2026-01-05' }), NOW);
    expect(r.phase).toBe('past');
    expect(r.label).toBe('Ended');
  });

  test('an archived trip is past (Completed) even if its dates are in the future', () => {
    const r = classifyTrip(trip({ startDate: '2026-06-20', archived: true }), NOW);
    expect(r.phase).toBe('past');
    expect(r.label).toBe('Completed');
  });
});

describe('groupTrips', () => {
  const trips = [
    trip({ id: 'past1',  startDate: '2026-01-01', endDate: '2026-01-05' }),
    trip({ id: 'soon',   startDate: '2026-06-12', endDate: '2026-06-14' }),
    trip({ id: 'later',  startDate: '2026-07-01', endDate: '2026-07-05' }),
    trip({ id: 'now',    startDate: '2026-06-08', endDate: '2026-06-10' }),
    trip({ id: 'past2',  startDate: '2026-03-01', endDate: '2026-03-03' }),
  ];

  test('splits into active / upcoming / past', () => {
    const g = groupTrips(trips, NOW);
    expect(g.active.map((x) => x.trip.id)).toEqual(['now']);
    expect(g.upcoming.map((x) => x.trip.id)).toEqual(['soon', 'later']); // soonest first
    expect(g.past.map((x) => x.trip.id)).toEqual(['past2', 'past1']);    // most recent first
  });

  test('spotlight is the next upcoming trip', () => {
    expect(groupTrips(trips, NOW).spotlight.trip.id).toBe('soon');
  });

  test('empty / nullish input is safe', () => {
    expect(groupTrips([], NOW)).toEqual({ active: [], upcoming: [], past: [], spotlight: null });
    expect(groupTrips(undefined, NOW).spotlight).toBeNull();
  });
});
