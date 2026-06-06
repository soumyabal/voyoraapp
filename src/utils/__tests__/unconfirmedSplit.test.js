/**
 * unconfirmedSplit.test.js — unconfirmedSplitItems(): past activities that carry a split
 * expense but were never checked off. Time-aware + pure (now passed in), so fully deterministic.
 */
import { unconfirmedSplitItems } from '../expenses';

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
});
