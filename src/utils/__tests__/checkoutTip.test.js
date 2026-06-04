/**
 * checkoutTip.test.js — the calm "check out by X this morning" tip. Fires once, on the
 * morning a hotel's coverage ends (checkInDay + nights), only when that day is planned;
 * carries the hotel's real check-out time (default 11:00). Soft 'info', never an alarm.
 */
import { validateTrip } from '../tripValidator';

const day = (label, date, activities) => ({ label, date, activities });
const tips = (trip) => validateTrip(trip).filter((w) => w.type === 'check_out_by');

describe('check_out_by tip', () => {
  test('fires on the departure morning with the hotel name + its check-out time', () => {
    const trip = { families: [], days: [
      day('D1', '2026-07-10', [{ id: 's', type: 'stay', name: 'Marriott', nights: 2, checkOutTime: '10:30' }]),
      day('D2', '2026-07-11', [{ id: 'a', type: 'activity', name: 'Beach', time: '14:00' }]),
      day('D3', '2026-07-12', [{ id: 'b', type: 'activity', name: 'Museum', time: '11:00' }]),
    ] };
    const t = tips(trip);
    expect(t).toHaveLength(1);
    expect(t[0].dayIndex).toBe(2);            // check-out = day 0 + 2 nights
    expect(t[0].severity).toBe('info');
    expect(t[0].message).toContain('Marriott');
    expect(t[0].message).toContain('10:30');  // the hotel's real check-out time
  });

  test('defaults to 11:00 when no check-out time is set', () => {
    const trip = { families: [], days: [
      day('D1', '2026-07-10', [{ id: 's', type: 'stay', name: 'Inn', nights: 1 }]),
      day('D2', '2026-07-11', [{ id: 'a', type: 'activity', name: 'X', time: '09:00' }]),
    ] };
    expect(tips(trip)[0].message).toContain('11:00');
  });

  test('no tip on a checkout morning with nothing planned', () => {
    const trip = { families: [], days: [
      day('D1', '2026-07-10', [{ id: 's', type: 'stay', name: 'Inn', nights: 1 }]),
      day('D2', '2026-07-11', []),
    ] };
    expect(tips(trip)).toHaveLength(0);
  });

  test('no tip mid-stay — only on the morning coverage ends', () => {
    const trip = { families: [], days: [
      day('D1', '2026-07-10', [{ id: 's', type: 'stay', name: 'Inn', nights: 3 }]),
      day('D2', '2026-07-11', [{ id: 'a', type: 'activity', name: 'X', time: '10:00' }]),
    ] };
    expect(tips(trip)).toHaveLength(0);
  });
});
