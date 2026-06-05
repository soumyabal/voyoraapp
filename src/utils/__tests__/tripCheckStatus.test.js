/**
 * tripCheckStatus.test.js — the Trip-Check chip state machine.
 * validateTrip is mocked so each branch is deterministic.
 */
jest.mock('../tripValidator', () => ({ validateTrip: jest.fn() }));
import { validateTrip } from '../tripValidator';
import { tripCheckStatus } from '../tripCheckStatus';

const planned = () => ({ activities: [{ type: 'activity', name: 'A' }] });
const empty = () => ({ activities: [] });

beforeEach(() => validateTrip.mockReset());

describe('tripCheckStatus', () => {
  test('errors → "fix" with the conflict count', () => {
    validateTrip.mockReturnValue([
      { type: 'a', dayIndex: 0, severity: 'error' },
      { type: 'b', dayIndex: 1, severity: 'error' },
    ]);
    const s = tripCheckStatus({ days: [planned(), planned()] });
    expect(s.state).toBe('fix');
    expect(s.conflicts).toBe(2);
  });

  test('warnings but no errors → "look" with the check count', () => {
    validateTrip.mockReturnValue([{ type: 'a', dayIndex: 0, severity: 'warning' }]);
    const s = tripCheckStatus({ days: [planned()] });
    expect(s.state).toBe('look');
    expect(s.checks).toBe(1);
  });

  test('clean but an unplanned day → "building"', () => {
    validateTrip.mockReturnValue([]);
    expect(tripCheckStatus({ days: [planned(), empty()] }).state).toBe('building');
  });

  test('every day planned + nothing flagged → "clear"', () => {
    validateTrip.mockReturnValue([]);
    const s = tripCheckStatus({ days: [planned(), planned()] });
    expect(s.state).toBe('clear');
    expect(s.allPlanned).toBe(true);
  });

  test('a conflict outranks an unplanned day (fix beats building)', () => {
    validateTrip.mockReturnValue([{ type: 'a', dayIndex: 0, severity: 'error' }]);
    expect(tripCheckStatus({ days: [planned(), empty()] }).state).toBe('fix');
  });

  test('ignored warnings are excluded from the counts', () => {
    validateTrip.mockReturnValue([{ type: 'closed', dayIndex: 0, severity: 'error' }]);
    expect(tripCheckStatus({ days: [planned()], ignoredWarnings: ['closed:0'] }).state).toBe('clear');
  });

  test('a day of only skipped/note items does not count as planned', () => {
    validateTrip.mockReturnValue([]);
    const day = { activities: [{ type: 'activity', status: 'skipped' }, { type: 'note' }] };
    expect(tripCheckStatus({ days: [day] }).state).toBe('building');
  });

  test('no days at all → "building"', () => {
    validateTrip.mockReturnValue([]);
    const s = tripCheckStatus({ days: [] });
    expect(s.state).toBe('building');
    expect(s.allPlanned).toBe(false);
  });
});
