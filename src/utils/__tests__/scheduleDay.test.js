/**
 * scheduleDay.test.js — the per-day arranger: hotel check-in → late afternoon,
 * meals → meal windows, sunset → evening, activities flow from the morning with
 * no pre-dawn times. Pure, so easy to pin.
 */
import { scheduleDay } from '../autoArrange';

const a = (name, type = 'activity', extra = {}) => ({ id: name, name, type, time: '00:00', ...extra });

describe('scheduleDay', () => {
  test('hotel check-in lands in the late afternoon; sights flow before it', () => {
    const out = scheduleDay([a('Hotel', 'stay'), a('Museum', 'activity')], { dayRole: 'normal' });
    const hotel = out.find(x => x.name === 'Hotel');
    const museum = out.find(x => x.name === 'Museum');
    expect(hotel.time >= '15:00').toBe(true);     // check-in window ~16:00, never morning
    expect(museum.time >= '09:00').toBe(true);     // no pre-dawn
    expect(museum.time < hotel.time).toBe(true);   // sightsee, then check in
  });

  test('check-out goes to the morning on the departure day', () => {
    const out = scheduleDay([a('Hotel', 'stay')], { dayRole: 'departure' });
    expect(out[0].time).toBe('10:00');
  });

  test('meals land at lunch and dinner', () => {
    const out = scheduleDay([a('Lakeside Cafe', 'food'), a('Steakhouse', 'food')]);
    expect(out.find(x => x.name === 'Lakeside Cafe').time).toBe('12:30');
    expect(out.find(x => x.name === 'Steakhouse').time).toBe('19:00');
  });

  test('a sunset activity is pushed to the evening', () => {
    const out = scheduleDay([a('Sunset Point', 'activity'), a('Museum', 'activity')]);
    expect(out.find(x => x.name === 'Sunset Point').time >= '18:00').toBe(true);
    expect(out.find(x => x.name === 'Museum').time < '12:00').toBe(true);
  });

  test('activities flow from 09:00, time-ordered, no overlap, no pre-dawn', () => {
    const out = scheduleDay([a('A'), a('B'), a('C')]);
    out.forEach(x => expect(x.time >= '09:00').toBe(true));
    const times = out.map(x => x.time);
    expect(times).toEqual([...times].sort());            // already in time order
    expect(new Set(times).size).toBe(times.length);      // distinct (spaced)
  });

  test('notes and skipped items are preserved', () => {
    const out = scheduleDay([
      a('Rest day note', 'note', { time: '11:00' }),
      a('Closed thing', 'activity', { status: 'skipped' }),
      a('Museum', 'activity'),
    ]);
    expect(out.find(x => x.name === 'Rest day note')).toBeTruthy();
    expect(out.find(x => x.name === 'Closed thing')).toBeTruthy();
    expect(out.find(x => x.name === 'Museum').time >= '09:00').toBe(true);
  });

  test('does not mutate the input', () => {
    const input = [a('Hotel', 'stay'), a('Museum')];
    const snapshot = JSON.parse(JSON.stringify(input));
    scheduleDay(input);
    expect(input).toEqual(snapshot);
  });

  test('empty / null input is safe', () => {
    expect(scheduleDay([])).toEqual([]);
    expect(scheduleDay(null)).toEqual([]);
  });
});
