/**
 * dayAnchor.test.js — per-day routing anchors derived from lodging + trip.origin.
 * Day 1 starts at the origin; later days start at the previous night's hotel; the
 * route anchor degrades to the day's first located stop when a night is unbooked.
 */
import { dayStartAnchor, dayEndAnchor, dayRouteAnchor, lodgingSearchAnchor } from '../tripValidator';

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

describe('lodgingSearchAnchor — book the night where you END UP, not the trip destination', () => {
  const named = (name, type, lat, lng, city) => ({ id: name, name, type, time: '12:00', lat, lng, city });

  test('Day 1 of a road trip anchors to that day’s located stop (St. Louis), not the final city', () => {
    const t = tripWith([
      [named('Drive to St. Louis', 'transport', 38.6, -90.2), named('Gateway Arch', 'activity', 38.62, -90.18, 'St. Louis')],
      [named('Fort Mackinac', 'activity', 45.85, -84.61, 'Mackinac Island')],
    ]);
    // Even though the trip "ends" at Mackinac, Day 0's hotel search opens at St. Louis.
    expect(lodgingSearchAnchor(t, 0)).toMatchObject({ lat: 38.62, lng: -90.18, label: 'St. Louis' });
  });

  test('prefers the last NON-transport stop (where you settle) over a drive pin', () => {
    const t = tripWith([[
      named('Gateway Arch', 'activity', 38.62, -90.18, 'St. Louis'),
      named('Drive to Chicago', 'transport', 41.88, -87.63),   // a later transport leg
    ]]);
    expect(lodgingSearchAnchor(t, 0)).toMatchObject({ lat: 38.62, lng: -90.18 });
  });

  test('a pure drive day falls back to its destination pin', () => {
    const t = tripWith([[named('Drive to Memphis', 'transport', 35.15, -90.05)]]);
    expect(lodgingSearchAnchor(t, 0)).toMatchObject({ lat: 35.15, lng: -90.05 });
  });

  test('no located stops → null (caller falls back to the destination city)', () => {
    const t = tripWith([[{ id: 'x', name: 'Rest', type: 'activity', time: '12:00' }]]);
    expect(lodgingSearchAnchor(t, 0)).toBeNull();
  });
});
