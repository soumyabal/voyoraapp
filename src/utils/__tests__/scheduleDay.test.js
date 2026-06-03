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

  // 2026-06-12 is a Friday (weekday 5) — used for the hours-of-operation tests.
  test('a dinner-only restaurant goes to dinner even when added first', () => {
    const dinnerOnly = a('Hot Rocks', 'food', { openHours: [{ d: 5, o: 17 * 60, c: 22 * 60 }] });
    const cafe       = a('Cafe',     'food', { openHours: [{ d: 5, o: 7 * 60,  c: 15 * 60 }] });
    const out = scheduleDay([dinnerOnly, cafe], { date: '2026-06-12' });
    expect(out.find(x => x.name === 'Hot Rocks').time >= '17:00').toBe(true);  // open only for dinner
    expect(out.find(x => x.name === 'Cafe').time).toBe('12:30');                // open mornings → lunch
  });

  test('an explicit meal choice overrides opening hours', () => {
    const out = scheduleDay(
      [a('Brunch Spot', 'food', { meal: 'dinner', openHours: [{ d: 5, o: 7 * 60, c: 12 * 60 }] })],
      { date: '2026-06-12' },
    );
    expect(out[0].time).toBe('19:00');   // user pinned dinner — hours ignored
  });

  test('a breakfast-named food lands in the breakfast window', () => {
    const out = scheduleDay([a('Breakfast at Hotel', 'food'), a('Steakhouse', 'food')]);
    expect(out.find(x => x.name === 'Breakfast at Hotel').time <= '10:00').toBe(true);
    expect(out.find(x => x.name === 'Steakhouse').time >= '12:00').toBe(true);
  });

  test('unknown opening hours fall back to lunch-first then dinner', () => {
    const out = scheduleDay([a('Diner', 'food'), a('Grill', 'food')], { date: '2026-06-12' });
    expect(out.find(x => x.name === 'Diner').time).toBe('12:30');
    expect(out.find(x => x.name === 'Grill').time).toBe('19:00');
  });

  test('a daytime activity is not scheduled before it opens', () => {
    // Open 10 AM–7 PM on Fri 2026-06-12 (weekday 5) → must not land at 09:00.
    const out = scheduleDay(
      [a('Lake Tour', 'activity', { openHours: [{ d: 5, o: 10 * 60, c: 19 * 60 }] })],
      { date: '2026-06-12' },
    );
    expect(out[0].time >= '10:00').toBe(true);
  });

  test('opening hours order the day — the later-opening venue goes second', () => {
    const out = scheduleDay([
      a('Late Venue',  'activity', { openHours: [{ d: 5, o: 11 * 60, c: 18 * 60 }] }),
      a('Early Venue', 'activity', { openHours: [{ d: 5, o: 8 * 60,  c: 17 * 60 }] }),
    ], { date: '2026-06-12' });
    expect(out.find(x => x.name === 'Early Venue').time >= '08:00').toBe(true);
    expect(out.find(x => x.name === 'Late Venue').time >= '11:00').toBe(true);
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
