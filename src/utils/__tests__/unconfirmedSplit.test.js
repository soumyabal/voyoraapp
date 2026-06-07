/**
 * unconfirmedSplit.test.js — unconfirmedSplitItems(): past activities that carry a split
 * expense but were never checked off. Time-aware + pure (now passed in), so fully deterministic.
 */
import { unconfirmedSplitItems, withUnconfirmedExcluded } from '../expenses';

const NOW = new Date('2026-06-13T12:00:00').getTime();   // "past" = ends before this
const PAST = '2026-06-12';
const TODAY = '2026-06-13';
const FUTURE = '2026-06-20';

const act = (id, extra = {}) => ({ id, type: 'activity', name: id, time: '10:00', durationMins: 60, ...extra });
const exp = (activityId, extra = {}) => ({ id: `e_${activityId}`, source: 'itinerary', activityId, amount: 40, excluded: false, ...extra });
const trip = (date, activities, expenses) => ({ days: [{ label: 'Day 1', date, activities }], expenses });
const ids = (trip2, now = NOW) => unconfirmedSplitItems(trip2, now).map(x => x.activity.id);

describe('unconfirmedSplitItems', () => {
  test('past + split expense + unchecked → flagged', () => {
    expect(ids(trip(PAST, [act('A')], [exp('A')]))).toEqual(['A']);
  });

  test('checked off (done) → not flagged', () => {
    expect(ids(trip(PAST, [act('A', { status: 'done' })], [exp('A')]))).toEqual([]);
  });

  test('skipped → not flagged (already decided)', () => {
    expect(ids(trip(PAST, [act('A', { status: 'skipped' })], [exp('A')]))).toEqual([]);
  });

  test('expense excluded from the split → not flagged', () => {
    expect(ids(trip(PAST, [act('A')], [exp('A', { excluded: true })]))).toEqual([]);
  });

  test('manual expense (not an itinerary line) → not flagged', () => {
    expect(ids(trip(PAST, [act('A')], [exp('A', { source: 'manual' })]))).toEqual([]);
  });

  test('activity with no linked expense → not flagged', () => {
    expect(ids(trip(PAST, [act('A')], []))).toEqual([]);
  });

  test('FUTURE event (not yet over) → not flagged', () => {
    expect(ids(trip(FUTURE, [act('A')], [exp('A')]))).toEqual([]);
  });

  test('time-aware on the same day: finished is flagged, still-upcoming is not', () => {
    const done   = trip(TODAY, [act('A', { time: '10:00', durationMins: 60 })], [exp('A')]); // ends 11:00 < 12:00
    const later  = trip(TODAY, [act('B', { time: '14:00', durationMins: 60 })], [exp('B')]); // 14:00 > 12:00
    expect(ids(done)).toEqual(['A']);
    expect(ids(later)).toEqual([]);
  });

  test('still-running event (duration extends past now) → not flagged', () => {
    // starts 11:30, 2h → ends 13:30 > NOW 12:00
    expect(ids(trip(TODAY, [act('A', { time: '11:30', durationMins: 120 })], [exp('A')]))).toEqual([]);
  });

  test('no clock (now null) → empty (deterministic no-op)', () => {
    expect(unconfirmedSplitItems(trip(PAST, [act('A')], [exp('A')]), null)).toEqual([]);
  });

  test('a trip with no itinerary expenses → empty fast-path', () => {
    expect(ids(trip(PAST, [act('A')], undefined))).toEqual([]);
  });

  test('a no-time activity uses end-of-day: flagged once the whole day has passed', () => {
    const noTime = { id: 'A', type: 'activity', name: 'A' };           // no time → ends 23:59
    expect(ids(trip(PAST, [noTime], [exp('A')]))).toEqual(['A']);      // yesterday is over → flagged
    expect(ids(trip(TODAY, [noTime], [exp('A')]))).toEqual([]);        // today not over yet → not flagged
  });

  test('an unparseable date is guarded (no crash, not flagged)', () => {
    expect(ids(trip('not-a-date', [act('A')], [exp('A')]))).toEqual([]);
  });
});

describe('withUnconfirmedExcluded — auto-exclude past unchecked items from the split view', () => {
  const exId = (id) => `e_${id}`;

  test('marks a past, unchecked itinerary expense excluded in the view', () => {
    const t = trip(PAST, [act('A')], [exp('A')]);
    const v = withUnconfirmedExcluded(t, NOW);
    expect(v.expenses.find(e => e.id === exId('A')).excluded).toBe(true);
  });

  test('does NOT touch the stored trip (immutable view)', () => {
    const t = trip(PAST, [act('A')], [exp('A')]);
    withUnconfirmedExcluded(t, NOW);
    expect(t.expenses[0].excluded).toBe(false);     // original untouched
  });

  test('a checked-off item is left counted (not excluded)', () => {
    const t = trip(PAST, [act('A', { status: 'done' })], [exp('A')]);
    const v = withUnconfirmedExcluded(t, NOW);
    expect(v.expenses.find(e => e.id === exId('A')).excluded).toBe(false);
  });

  test('a future item is left counted (not yet over)', () => {
    const t = trip(FUTURE, [act('A')], [exp('A')]);
    expect(withUnconfirmedExcluded(t, NOW)).toBe(t);  // nothing unconfirmed → same ref
  });

  test('returns the SAME trip object when nothing is unconfirmed', () => {
    const t = trip(PAST, [act('A', { status: 'done' })], [exp('A')]);
    expect(withUnconfirmedExcluded(t, NOW)).toBe(t);
  });

  test('null clock → no-op (same trip), deterministic', () => {
    const t = trip(PAST, [act('A')], [exp('A')]);
    expect(withUnconfirmedExcluded(t, null)).toBe(t);
  });

  test('only the unconfirmed expense is flipped; others pass through untouched', () => {
    const manual = { id: 'man', source: 'manual', amount: 10, excluded: false };
    const t = trip(PAST, [act('A')], [exp('A'), manual]);
    const v = withUnconfirmedExcluded(t, NOW);
    expect(v.expenses.find(e => e.id === exId('A')).excluded).toBe(true);
    expect(v.expenses.find(e => e.id === 'man')).toBe(manual);   // same object — untouched
  });
});
