/**
 * lodging.test.js — derive "where do I sleep tonight" + the lodging Trip-Check
 * rules, without ever duplicating a stay per night (cost stays on one record).
 */
import { lodgingForNight, validateTrip } from '../tripValidator';

const day   = (label, date, activities = []) => ({ label, date, activities });
const stay  = (name, nights, extra = {}) => ({ id: name, type: 'stay', name, time: '16:00', nights, ...extra });
const act   = (name, time = '10:00') => ({ id: name, type: 'activity', name, time });
const trans = (name, time, arriveTime) => ({ id: name, type: 'transport', name, time, arriveTime });

describe('lodgingForNight', () => {
  test('check-in covers each night of its span, then checks out', () => {
    const trip = { days: [
      day('D1', '2026-06-06', [stay('Hotel A', 2)]),
      day('D2', '2026-06-07', [act('Museum')]),
      day('D3', '2026-06-08', [act('Park')]),
    ] };
    const n0 = lodgingForNight(trip, 0);
    expect(n0.stay.name).toBe('Hotel A');
    expect(n0).toMatchObject({ checkInDayIndex: 0, nights: 2, nightNumber: 1, isCheckInDay: true, isLastNight: false });

    const n1 = lodgingForNight(trip, 1);
    expect(n1).toMatchObject({ checkInDayIndex: 0, nightNumber: 2, isCheckInDay: false, isLastNight: true });

    expect(lodgingForNight(trip, 2)).toBeNull(); // checked out → heading home / unbooked
  });

  test('no stay anywhere → null every night', () => {
    const trip = { days: [day('D1', '2026-06-06', [act('x')]), day('D2', '2026-06-07', [act('y')])] };
    expect(lodgingForNight(trip, 0)).toBeNull();
    expect(lodgingForNight(trip, 1)).toBeNull();
  });

  test('overnight transit (crosses midnight) → no hotel that night', () => {
    const trip = { days: [
      day('D1', '2026-06-06', [stay('Hotel A', 3)]),
      day('D2', '2026-06-07', [trans('Sleeper train', '22:00', '06:00')]), // arrives before it departs
    ] };
    const n = lodgingForNight(trip, 1);
    expect(n.overnightTransit).toBeDefined();
    expect(n.stay).toBeUndefined();
  });

  test('multi-city: the newer check-in takes over from its night on', () => {
    const trip = { days: [
      day('D1', '2026-06-06', [stay('Hotel A', 2)]),
      day('D2', '2026-06-07', []),
      day('D3', '2026-06-08', [stay('Hotel B', 1)]),
      day('D4', '2026-06-09', []),
    ] };
    expect(lodgingForNight(trip, 0).stay.name).toBe('Hotel A');
    expect(lodgingForNight(trip, 1).stay.name).toBe('Hotel A');
    expect(lodgingForNight(trip, 2).stay.name).toBe('Hotel B');
    expect(lodgingForNight(trip, 3)).toBeNull(); // B checked out
  });

  test('missing nights defaults to 1; skipped stay is ignored', () => {
    const trip = { days: [
      day('D1', '2026-06-06', [stay('Hotel A', undefined)]),       // nights → 1
      day('D2', '2026-06-07', [stay('Skipped', 2, { status: 'skipped' })]),
    ] };
    expect(lodgingForNight(trip, 0).nights).toBe(1);
    expect(lodgingForNight(trip, 1)).toBeNull(); // A checked out, skipped stay ignored
  });
});

describe('Trip-Check lodging rules', () => {
  const has = (warnings, type, dayIndex) =>
    warnings.some(w => w.type === type && (dayIndex === undefined || w.dayIndex === dayIndex));

  test('unbooked_night fires on an interior gap night, never on the last day', () => {
    const trip = { families: [], homeBase: false, days: [
      day('D1', '2026-06-06', [stay('A', 1), act('Arrive')]), // covers night of D1 only
      day('D2', '2026-06-07', [act('Museum')]),               // interior, uncovered → warn
      day('D3', '2026-06-08', [act('Park')]),                 // last day → never warn
    ] };
    const w = validateTrip(trip);
    expect(has(w, 'unbooked_night', 1)).toBe(true);
    expect(has(w, 'unbooked_night', 2)).toBe(false);
  });

  test('multi-day trip with NO stay flags every night but the last (the zero-lodging bug)', () => {
    const trip = { families: [], homeBase: false, days: [
      day('D1', '2026-07-10', [act('Niagara Falls')]),     // night 0 → warn
      day('D2', '2026-07-11', [act('Cave of the Winds')]), // night 1 → warn
      day('D3', '2026-07-12', [act('Maid of the Mist')]),  // last day → never warn
    ] };
    const w = validateTrip(trip);
    expect(has(w, 'unbooked_night', 0)).toBe(true);
    expect(has(w, 'unbooked_night', 1)).toBe(true);
    expect(has(w, 'unbooked_night', 2)).toBe(false);
  });

  test('an overnight journey covers that night → no unbooked_night', () => {
    const trip = { families: [], days: [
      day('D1', '2026-07-10', [trans('Red-eye flight', '23:00', '06:00')]), // crosses midnight
      day('D2', '2026-07-11', [act('Arrive')]),
    ] };
    expect(has(validateTrip(trip), 'unbooked_night', 0)).toBe(false);
  });

  test('a manual nightPlan ("with friends") covers the night → no unbooked_night', () => {
    const trip = { families: [], homeBase: false, days: [
      { ...day('D1', '2026-07-10', [act('Falls')]), nightPlan: 'with_friends' }, // covered by hand
      day('D2', '2026-07-11', [act('Cave')]),                                    // still open → warns
      day('D3', '2026-07-12', [act('Mist')]),                                    // last day
    ] };
    expect(lodgingForNight(trip, 0)).toEqual({ nightPlan: 'with_friends' });
    const w = validateTrip(trip);
    expect(has(w, 'unbooked_night', 0)).toBe(false);
    expect(has(w, 'unbooked_night', 1)).toBe(true);
  });

  test('a nightPlan covers a night even after a stay has checked out', () => {
    const trip = { families: [], days: [
      day('D1', '2026-07-10', [stay('A', 1), act('x')]),                  // covers night 0
      { ...day('D2', '2026-07-11', [act('y')]), nightPlan: 'camping' },   // A checked out → camping
      day('D3', '2026-07-12', [act('z')]),
    ] };
    expect(lodgingForNight(trip, 1)).toEqual({ nightPlan: 'camping' });
    expect(has(validateTrip(trip), 'unbooked_night', 1)).toBe(false);
  });

  test('no unbooked_night when the booking covers the interior nights', () => {
    const trip = { families: [], days: [
      day('D1', '2026-06-06', [stay('A', 3), act('Arrive')]), // covers D1,D2,D3
      day('D2', '2026-06-07', [act('Museum')]),
      day('D3', '2026-06-08', [act('Park')]),
    ] };
    expect(has(validateTrip(trip), 'unbooked_night')).toBe(false);
  });

  test('homeBase trip never gets unbooked_night', () => {
    const trip = { families: [], homeBase: true, days: [
      day('D1', '2026-06-06', [act('x')]),
      day('D2', '2026-06-07', [act('y')]),
      day('D3', '2026-06-08', [act('z')]),
    ] };
    // (no stay at all anyway, but homeBase also guards the path)
    expect(has(validateTrip(trip), 'unbooked_night')).toBe(false);
  });

  test('lastday_missing_checkout fires when the last day has no way home', () => {
    const trip = { families: [], days: [
      day('D1', '2026-06-06', [stay('A', 2)]),
      day('D2', '2026-06-07', [act('Museum')]),
      day('D3', '2026-06-08', [act('Last sightseeing')]),     // activities but no transport
    ] };
    expect(has(validateTrip(trip), 'lastday_missing_checkout', 2)).toBe(true);
  });

  test('no lastday_missing_checkout when the last day has a departure', () => {
    const trip = { families: [], days: [
      day('D1', '2026-06-06', [stay('A', 2)]),
      day('D2', '2026-06-07', [act('Museum')]),
      day('D3', '2026-06-08', [trans('Flight home', '14:00')]),
    ] };
    expect(has(validateTrip(trip), 'lastday_missing_checkout')).toBe(false);
  });
});
