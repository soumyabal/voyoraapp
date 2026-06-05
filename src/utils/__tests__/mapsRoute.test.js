/**
 * mapsRoute.test.js — building a day's Google Maps route from its anchors + stops.
 */
import { dayRoutePoints, googleMapsDayUrl, googleMapsDayShareUrl, googleMapsPlaceUrl } from '../mapsRoute';

const stay = (nights, lat, lng) => ({ id: 'h', type: 'stay', name: 'Hotel', time: '15:00', nights, lat, lng });
const act = (id, time, lat, lng) => ({ id, type: 'activity', name: id, time, lat, lng });
const tripWith = (daysActs, origin = null) => ({
  origin,
  families: [],
  days: daysActs.map((acts, i) => ({ label: `Day ${i + 1}`, date: `2026-06-1${2 + i}`, activities: acts })),
});

describe('dayRoutePoints', () => {
  test('orders origin → time-sorted stops → tonight’s hotel (hotel not a mid-stop)', () => {
    const t = tripWith([[stay(2, 10, 20), act('B', '14:00', 2, 2), act('A', '10:00', 1, 1)]], { label: 'Home', lat: 5, lng: 6 });
    expect(dayRoutePoints(t, 0).map((p) => `${p.lat},${p.lng}`)).toEqual(['5,6', '1,1', '2,2', '10,20']);
  });

  test('skips stops without coords and skipped/transport items', () => {
    const t = tripWith([[
      act('A', '10:00', 1, 1),
      { id: 'd', type: 'transport', name: 'Drive', time: '11:00', lat: 9, lng: 9 },
      { id: 'x', type: 'activity', name: 'NoCoords', time: '12:00' },
      { id: 's', type: 'activity', name: 'Skipped', time: '13:00', lat: 3, lng: 3, status: 'skipped' },
      act('B', '14:00', 2, 2),
    ]]);
    expect(dayRoutePoints(t, 0).map((p) => p.label)).toEqual(['A', 'B']);
  });
});

describe('googleMapsDayUrl', () => {
  test('encodes origin, destination and waypoints', () => {
    const t = tripWith([[act('A', '10:00', 1, 1), act('B', '14:00', 2, 2), act('C', '16:00', 3, 3)]], { label: 'Home', lat: 5, lng: 6 });
    const url = googleMapsDayUrl(t, 0);
    expect(url).toContain('origin=5%2C6');
    expect(url).toContain('destination=3%2C3');
    expect(url).toContain('waypoints=');
    expect(url).toContain('1%2C1');
  });

  test('null when there are fewer than 2 routable points', () => {
    expect(googleMapsDayUrl(tripWith([[act('A', '10:00', 1, 1)]]), 0)).toBeNull();
  });
});

describe('googleMapsDayShareUrl (chat-safe path style)', () => {
  test('path form: /maps/dir/lat,lng/lat,lng/... — no query string, no pipes', () => {
    const t = tripWith([[act('A', '10:00', 1, 1), act('B', '14:00', 2, 2), act('C', '16:00', 3, 3)]], { label: 'Home', lat: 5, lng: 6 });
    const url = googleMapsDayShareUrl(t, 0);
    expect(url).toBe('https://www.google.com/maps/dir/5.00000,6.00000/1.00000,1.00000/2.00000,2.00000/3.00000,3.00000');
    expect(url).not.toContain('?');   // no query string
    expect(url).not.toContain('|');   // no pipe (chat-truncation hazard)
    expect(url).not.toContain('%7C');
  });

  test('null when fewer than 2 routable points', () => {
    expect(googleMapsDayShareUrl(tripWith([[act('A', '10:00', 1, 1)]]), 0)).toBeNull();
  });
});

describe('googleMapsPlaceUrl', () => {
  test('single-place query link, 5 dp', () => {
    expect(googleMapsPlaceUrl(44.881, -85.482)).toBe('https://www.google.com/maps/search/?api=1&query=44.88100,-85.48200');
  });
  test('null without coords', () => {
    expect(googleMapsPlaceUrl(null, 5)).toBeNull();
    expect(googleMapsPlaceUrl(5, undefined)).toBeNull();
  });
});
