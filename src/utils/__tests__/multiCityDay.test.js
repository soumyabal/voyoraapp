/**
 * multiCityDay.test.js — the multi_city_day Trip Check tip fires when a day's activities span ≥2
 * tagged cities WITH NO inter-city journey planned. A road-trip travel day (the drive IS there) is
 * normal and must NOT be flagged; a fuel pitstop is not the journey.
 */
import { validateTrip } from '../tripValidator';

const dayOf = (activities) => ({ families: [], days: [{ label: 'Day 1', date: '2026-07-10', activities }] });
const cityWarns = (trip) => validateTrip(trip).filter(w => w.type === 'multi_city_day');

describe('multi_city_day', () => {
  test('two cities with NO transport planned → warns (unplanned mid-day hop)', () => {
    expect(cityWarns(dayOf([
      { id: 'a', type: 'activity', name: 'Gateway Arch', time: '10:00', city: 'St. Louis' },
      { id: 'b', type: 'activity', name: 'Willis Tower', time: '15:00', city: 'Chicago' },
    ]))).toHaveLength(1);
  });

  test('two cities WITH a planned drive between them → no warning (normal travel day)', () => {
    expect(cityWarns(dayOf([
      { id: 'a', type: 'activity', name: 'Gateway Arch', time: '09:00', city: 'St. Louis' },
      { id: 'd', type: 'transport', subtype: 'car', name: 'Drive to Chicago', time: '11:00' },
      { id: 'b', type: 'activity', name: 'Willis Tower', time: '16:00', city: 'Chicago' },
    ]))).toHaveLength(0);
  });

  test('a fuel pitstop is NOT the journey leg → still warns', () => {
    expect(cityWarns(dayOf([
      { id: 'a', type: 'activity', name: 'Gateway Arch', time: '10:00', city: 'St. Louis' },
      { id: 'p', type: 'transport', subtype: 'pitstop', name: 'Gas', time: '12:00' },
      { id: 'b', type: 'activity', name: 'Willis Tower', time: '15:00', city: 'Chicago' },
    ]))).toHaveLength(1);
  });
});
