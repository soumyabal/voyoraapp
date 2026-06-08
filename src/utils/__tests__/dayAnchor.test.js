/**
 * dayAnchor.test.js — per-day routing anchors derived from lodging + trip.origin.
 * Day 1 starts at the origin; later days start at the previous night's hotel; the
 * route anchor degrades to the day's first located stop when a night is unbooked.
 */
import { dayStartAnchor, dayEndAnchor, dayRouteAnchor, nightCityFor } from '../tripValidator';

const stay = (nights, lat, lng) => ({ id: 'h', type: 'stay', name: 'Hotel', time: '15:00', nights, lat, lng });
const act = (lat, lng) => ({ id: 'a', type: 'activity', name: 'Stop', time: '10:00', lat, lng });

const tripWith = (daysActs, origin = null) => ({
  origin,
  families: [],
  days: daysActs.map((acts, i) => ({ label: `Day ${i + 1}`, date: `2026-06-1${2 + i}`, activities: acts })),
});

describe('per-day routing anchors', () => {
  test('Day 1 start = trip.origin', () => {
    const t = tripWith([[act(1, 1)], []], { label: 'Home', lat: 5, lng: 6 });
    expect(dayStartAnchor(t, 0)).toMatchObject({ lat: 5, lng: 6, source: 'origin' });
  });

  test('Day 1 start is null when no origin set', () => {
    expect(dayStartAnchor(tripWith([[act(1, 1)]]), 0)).toBeNull();
  });

  test('later day starts AND ends at the covering hotel (nights spans it)', () => {
    // 3 days; hotel checks in Day 1 with 2 nights → covers nights of Day 1 & Day 2.
    const t = tripWith([[stay(2, 10, 20)], [act(1, 1)], [act(2, 2)]]);
    expect(dayStartAnchor(t, 1)).toMatchObject({ lat: 10, lng: 20, source: 'stay' }); // woke at hotel
    expect(dayEndAnchor(t, 1)).toMatchObject({ lat: 10, lng: 20, source: 'stay' });   // sleep at hotel
  });

  test('an uncovered night → null anchor; route falls back to the day’s first stop', () => {
    // hotel only 1 night → the 2nd night (Day 3 index 2) is unbooked.
    const t = tripWith([[stay(1, 10, 20)], [act(1, 1)], [act(7, 8)]]);
    expect(dayStartAnchor(t, 2)).toBeNull();
    expect(dayRouteAnchor(t, 2, t.days[2].activities)).toMatchObject({ lat: 7, lng: 8, source: 'stop' });
  });
});

describe('nightCityFor — the city you sleep in that night, not the trip destination', () => {
  const named = (name, type, city) => ({ id: name, name, type, time: '12:00', city });

  test('Day 1 of a road trip resolves to that day’s city (St. Louis), not the final city', () => {
    const t = tripWith([
      [named('Drive to St. Louis', 'transport', 'St. Louis'), named('Gateway Arch', 'activity', 'St. Louis')],
      [named('Fort Mackinac', 'activity', 'Mackinac Island')],
    ]);
    expect(nightCityFor(t, 0)).toBe('St. Louis');
    expect(nightCityFor(t, 1)).toBe('Mackinac Island');
  });

  test('prefers the last NON-transport stop (where you settle) over a later drive leg', () => {
    const t = tripWith([[
      named('Gateway Arch', 'activity', 'St. Louis'),
      named('Drive toward Chicago', 'transport', 'Chicago'),   // a leg that starts the NEXT day's city
    ]]);
    expect(nightCityFor(t, 0)).toBe('St. Louis');
  });

  test('a pure drive day falls back to its destination city tag', () => {
    const t = tripWith([[named('Drive to Memphis', 'transport', 'Memphis')]]);
    expect(nightCityFor(t, 0)).toBe('Memphis');
  });

  test('no city tags → null (caller falls back to the destination)', () => {
    const t = tripWith([[{ id: 'x', name: 'Rest', type: 'activity', time: '12:00' }]]);
    expect(nightCityFor(t, 0)).toBeNull();
  });
});
