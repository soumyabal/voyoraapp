/**
 * validatorHelpers.test.js — the two pure display helpers around validateTrip:
 * groupWarningsByDay (bucket by dayIndex, trip-level → 'trip') and summariseWarnings
 * (severity counts). Tiny + deterministic; previously uncovered.
 */
import { groupWarningsByDay, summariseWarnings } from '../tripValidator';

const w = (severity, dayIndex) => ({ severity, dayIndex, type: 't' });

describe('groupWarningsByDay', () => {
  test('buckets warnings under their dayIndex', () => {
    const g = groupWarningsByDay([w('info', 0), w('warning', 0), w('error', 2)]);
    expect(g[0]).toHaveLength(2);
    expect(g[2]).toHaveLength(1);
    expect(g[1]).toBeUndefined();
  });

  test('a trip-level warning (no dayIndex) lands under the "trip" key', () => {
    const g = groupWarningsByDay([w('warning', undefined), w('info', 1)]);
    expect(g.trip).toHaveLength(1);
    expect(g[1]).toHaveLength(1);
  });

  test('empty input → empty object', () => {
    expect(groupWarningsByDay([])).toEqual({});
  });
});

describe('summariseWarnings', () => {
  test('counts each severity tier independently', () => {
    const s = summariseWarnings([w('error'), w('error'), w('warning'), w('info'), w('info'), w('info')]);
    expect(s).toEqual({ errors: 2, warnings: 1, infos: 3 });
  });

  test('all-zero on an empty list', () => {
    expect(summariseWarnings([])).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });
});
