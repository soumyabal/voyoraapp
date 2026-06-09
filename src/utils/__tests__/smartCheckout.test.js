/**
 * smartCheckout.test.js — a hotel check-out must END before the day's first departure leg. The
 * nominal 11:00 checkout is pulled earlier when a flight / car-return is timed before it (the
 * "check out at 11:00 when the flight is 10:30" bug). No earlier departure → nominal time stands.
 */
import { smartCheckoutTime } from '../autoArrange';

const dep = (time) => ({ type: 'transport', time, status: null });

describe('smartCheckoutTime', () => {
  test('moves checkout before an earlier departure (11:00 nominal, 09:00 car return → 08:45)', () => {
    expect(smartCheckoutTime('11:00', [dep('09:00'), dep('10:30')])).toBe('08:45');
  });
  test('keeps the nominal time when every departure is later', () => {
    expect(smartCheckoutTime('11:00', [dep('14:00')])).toBe('11:00');
  });
  test('no departures → nominal time unchanged', () => {
    expect(smartCheckoutTime('11:00', [{ type: 'activity', time: '12:00' }])).toBe('11:00');
  });
  test('skipped departures are ignored', () => {
    expect(smartCheckoutTime('11:00', [{ type: 'transport', time: '08:00', status: 'skipped' }])).toBe('11:00');
  });
  test('the EARLIEST departure wins', () => {
    expect(smartCheckoutTime('11:00', [dep('10:30'), dep('07:30'), dep('09:00')])).toBe('07:15');
  });
});
