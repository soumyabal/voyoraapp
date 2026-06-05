/**
 * suggestDay.test.js — suggestDayForVenue picks a confident alternative day for a venue
 * the planner couldn't fit: it must (a) skip days the venue is closed, (b) require a real
 * open-hours gap big enough for the visit, (c) return null when no day fits.
 */
import { suggestDayForVenue } from '../autoArrange';

const H = (days) => days.map((d) => ({ d, o: 10 * 60, c: 17 * 60 })); // 10 AM–5 PM on the given weekdays
// 2026-06-12 Fri(5), 06-13 Sat(6), 06-14 Sun(0)
const venueFriSun = { id: 'V', name: 'V', type: 'activity', openHours: H([5, 0]), durationMins: 180 };

test('suggests the open day with room, skipping the closed weekday', () => {
  const trip = { days: [
    { date: '2026-06-12', activities: [ // Fri — packed 10–16:30
      { id: 'a', type: 'activity', time: '10:00', durationMins: 180 },
      { id: 'b', type: 'activity', time: '13:30', durationMins: 180 },
    ] },
    { date: '2026-06-13', activities: [] }, // Sat — venue closed → skipped
    { date: '2026-06-14', activities: [] }, // Sun — open + empty → the answer
  ] };
  expect(suggestDayForVenue(trip, venueFriSun, { excludeDayIndex: 0 }).best).toBe(2);
});

test('returns null when the venue is closed on every other day of the trip', () => {
  const monOnly = { id: 'V', name: 'V', type: 'activity', openHours: H([1]), durationMins: 180 }; // open Mondays only
  const trip = { days: [
    { date: '2026-06-12', activities: [] }, // Fri
    { date: '2026-06-13', activities: [] }, // Sat
    { date: '2026-06-14', activities: [] }, // Sun
  ] };
  expect(suggestDayForVenue(trip, monOnly, { excludeDayIndex: 0 }).best).toBeNull();
});

test('a day with no big-enough open gap is not suggested', () => {
  const trip = { days: [
    { date: '2026-06-12', activities: [] },
    { date: '2026-06-14', activities: [ // Sun open 10–17 but full
      { id: 'x', type: 'activity', time: '10:00', durationMins: 240 },
      { id: 'y', type: 'activity', time: '14:15', durationMins: 150 }, // → ~16:45, no 180 gap left
    ] },
  ] };
  expect(suggestDayForVenue(trip, venueFriSun, { excludeDayIndex: 0 }).best).toBeNull();
});
