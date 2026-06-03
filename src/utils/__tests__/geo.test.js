/**
 * geo.test.js — the free distance/travel engine. Pins haversine accuracy and the
 * walk/drive travel model that the distance-aware Trip Check rule relies on.
 */
import { haversineKm, travelLeg, formatKm } from '../geo';

describe('haversineKm', () => {
  test('same point is 0', () => {
    expect(haversineKm({ lat: 40, lng: -73 }, { lat: 40, lng: -73 })).toBeCloseTo(0, 5);
  });
  test('one degree of latitude ≈ 111 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 0);
  });
  test('missing coords → null', () => {
    expect(haversineKm({ lat: 1 }, { lat: 2, lng: 3 })).toBeNull();
    expect(haversineKm(null, { lat: 2, lng: 3 })).toBeNull();
  });
});

describe('travelLeg', () => {
  test('a short hop is a walk', () => {
    const leg = travelLeg({ lat: 0, lng: 0 }, { lat: 0, lng: 0.005 }); // ~0.55 km
    expect(leg.mode).toBe('walk');
    expect(leg.min).toBeGreaterThanOrEqual(2);
  });
  test('a few km is a drive with a sane estimate', () => {
    const leg = travelLeg({ lat: 0, lng: 0 }, { lat: 0, lng: 0.09 }); // ~10 km straight
    expect(leg.mode).toBe('drive');
    expect(leg.km).toBeCloseTo(10, 0);
    expect(leg.min).toBeGreaterThan(20);   // ~30 min incl. detour + urban speed
    expect(leg.min).toBeLessThan(45);
  });
  test('missing coords → null', () => {
    expect(travelLeg({ lat: 0 }, { lat: 0, lng: 1 })).toBeNull();
  });
});

describe('formatKm', () => {
  test('sub-km in metres, else one decimal km', () => {
    expect(formatKm(0.85)).toBe('850 m');
    expect(formatKm(3.2)).toBe('3.2 km');
  });
});
