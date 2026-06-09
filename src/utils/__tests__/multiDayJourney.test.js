/**
 * multiDayJourney.test.js — the "Overnight journey" rule is timezone-aware.
 *
 * A WESTWARD zone hop (clocks go back) makes the arrival wall-clock read earlier than departure
 * without crossing midnight — that must NOT be flagged as an overnight journey. A genuine same-zone
 * red-eye still is. (Reported on the Holland, MI → Buffalo Grove, IL day-trip return.)
 */
import { validateTrip } from '../tripValidator';

const HOLLAND = { lat: 42.7875, lng: -86.1089 };        // west Michigan — Eastern (EDT)
const BUFFALO_GROVE = { lat: 42.1675, lng: -87.9590 };  // Illinois — Central (CDT)
const tripOf = (activities) => ({ families: [], days: [{ label: 'Day 1', date: '2026-06-13', activities }] });

describe('multi_day_journey — timezone-aware', () => {
  test('a westward zone drive (EDT → CDT, clocks back 1h) is NOT flagged overnight', () => {
    // Depart 19:10 EDT, arrive 18:29 CDT — earlier on the wall clock, but ~19 min later in UTC.
    const trip = tripOf([
      { id: 'a', type: 'activity', name: 'Koi Pond', time: '15:09', ...HOLLAND },
      { id: 'r', type: 'transport', name: 'Drive home', time: '19:10', arriveTime: '18:29', ...BUFFALO_GROVE },
    ]);
    expect(validateTrip(trip).filter(w => w.type === 'multi_day_journey')).toHaveLength(0);
  });

  test('a same-zone red-eye (22:00 → 06:00) IS still flagged overnight', () => {
    const trip = tripOf([
      { id: 'f', type: 'transport', subtype: 'train', name: 'Night train', time: '22:00', arriveTime: '06:00', lat: 41.88, lng: -87.63 },
    ]);
    expect(validateTrip(trip).filter(w => w.type === 'multi_day_journey')).toHaveLength(1);
  });

  test('no coords → falls back to the wall-clock signal (still flags arriveTime < departTime)', () => {
    const trip = tripOf([
      { id: 'f', type: 'transport', subtype: 'flight', name: 'Red-eye', time: '23:00', arriveTime: '05:00' },
    ]);
    expect(validateTrip(trip).filter(w => w.type === 'multi_day_journey')).toHaveLength(1);
  });
});
