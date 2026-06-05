/**
 * tripHealth.test.js — computeTripHealth derives per-day health from validateTrip output.
 * validateTrip is mocked so each severity scenario is deterministic.
 */
jest.mock('../tripValidator', () => ({ validateTrip: jest.fn() }));
import { validateTrip } from '../tripValidator';
import { computeTripHealth } from '../tripHealth';

const day = (activities) => ({ activities });
const trip = (days, ignoredWarnings) => ({ days, ignoredWarnings });

beforeEach(() => validateTrip.mockReset());

describe('computeTripHealth', () => {
  test('empty day → "empty" (short-circuits before warnings)', () => {
    validateTrip.mockReturnValue([{ type: 'x', dayIndex: 0, severity: 'error' }]);
    expect(computeTripHealth(trip([day([])])).healthByDay[0]).toBe('empty');
  });

  test('planned day with no warnings → "clean"', () => {
    validateTrip.mockReturnValue([]);
    expect(computeTripHealth(trip([day([{ type: 'activity', name: 'A' }])])).healthByDay[0]).toBe('clean');
  });

  test('severity → level: error/warning/info map to conflict/check/tip', () => {
    const days = [day([{ name: 'A' }]), day([{ name: 'B' }]), day([{ name: 'C' }])];
    validateTrip.mockReturnValue([
      { type: 'x', dayIndex: 0, severity: 'error' },
      { type: 'y', dayIndex: 1, severity: 'warning' },
      { type: 'z', dayIndex: 2, severity: 'info' },
    ]);
    const { healthByDay } = computeTripHealth(trip(days));
    expect(healthByDay[0]).toBe('conflict');
    expect(healthByDay[1]).toBe('check');
    expect(healthByDay[2]).toBe('tip');
  });

  test('error outranks info on the same day', () => {
    validateTrip.mockReturnValue([
      { type: 'a', dayIndex: 0, severity: 'info' },
      { type: 'b', dayIndex: 0, severity: 'error' },
    ]);
    expect(computeTripHealth(trip([day([{ name: 'A' }])])).healthByDay[0]).toBe('conflict');
  });

  test('ignored warnings are excluded', () => {
    validateTrip.mockReturnValue([{ type: 'closed', dayIndex: 0, severity: 'error' }]);
    const { healthByDay } = computeTripHealth(trip([day([{ name: 'A' }])], ['closed:0']));
    expect(healthByDay[0]).toBe('clean');
  });

  test('warningsByDay groups by day; trip-scope (null dayIndex) excluded', () => {
    validateTrip.mockReturnValue([
      { type: 'a', dayIndex: 0, severity: 'warning' },
      { type: 'b', dayIndex: 0, severity: 'info' },
      { type: 'c', dayIndex: null, severity: 'warning' },
    ]);
    const { warningsByDay } = computeTripHealth(trip([day([{ name: 'A' }])]));
    expect(warningsByDay[0]).toHaveLength(2);
    expect(warningsByDay[1]).toBeUndefined();
  });

  test('skipped activities do not count as planned', () => {
    validateTrip.mockReturnValue([]);
    expect(computeTripHealth(trip([day([{ name: 'A', status: 'skipped' }])])).healthByDay[0]).toBe('empty');
  });
});
