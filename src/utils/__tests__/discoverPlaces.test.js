/**
 * discoverPlaces.test.js — pure Places transforms used by Discover.
 */
import { mapPlace, inferActivityType, metersBetween, isVegFriendly, PRICE_TO_COST } from '../discoverPlaces';

describe('inferActivityType', () => {
  test('lodging wins even when food/restaurant types are also present (the Great Wolf Lodge bug)', () => {
    expect(inferActivityType(['resort_hotel', 'restaurant', 'food'])).toBe('stay');
    expect(inferActivityType(['lodging'])).toBe('stay');
  });
  test('food when only eatery types', () => {
    expect(inferActivityType(['restaurant', 'food'])).toBe('food');
    expect(inferActivityType(['cafe'])).toBe('food');
  });
  test('falls back to activity (and handles no types)', () => {
    expect(inferActivityType(['tourist_attraction'])).toBe('activity');
    expect(inferActivityType()).toBe('activity');
  });
});

describe('metersBetween', () => {
  test('zero for the same point', () => {
    expect(metersBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });
  test('~111 km for one degree of latitude', () => {
    const d = metersBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111400);
  });
});

describe('isVegFriendly', () => {
  test('matches a veg-ish name', () => {
    expect(isVegFriendly({ name: 'Green Salad Bar', types: [] })).toBe(true);
  });
  test('matches a veg-ish type', () => {
    expect(isVegFriendly({ name: 'Corner Spot', types: ['juice_bar'] })).toBe(true);
  });
  test('neither → false', () => {
    expect(isVegFriendly({ name: 'Steakhouse', types: ['restaurant'] })).toBe(false);
  });
});

describe('mapPlace', () => {
  test('normalizes a raw Places result + derives cost / type / veg flag', () => {
    const raw = {
      displayName: { text: 'Joe Pizza' }, formattedAddress: '1 Main St',
      rating: 4.6, userRatingCount: 1200, priceLevel: 'PRICE_LEVEL_MODERATE',
      types: ['restaurant', 'food'], websiteUri: 'https://joe.example',
      location: { latitude: 40.5, longitude: -74.1 },
      accessibilityOptions: { wheelchairAccessibleEntrance: true },
    };
    const m = mapPlace(raw);
    expect(m.name).toBe('Joe Pizza');
    expect(m.costPerPerson).toBe(PRICE_TO_COST.PRICE_LEVEL_MODERATE);
    expect(m.activityType).toBe('food');
    expect(m.wheelchairOk).toBe(true);
    expect(m.lat).toBe(40.5);
    expect(m.lng).toBe(-74.1);
    expect(m.vegFriendly).toBe(false);
    expect(m.photo).toBeNull();   // no photos array
  });

  test('fills safe defaults for a sparse result', () => {
    const m = mapPlace({});
    expect(m.name).toBe('Place');
    expect(m.address).toBe('');
    expect(m.costPerPerson).toBe(0);
    expect(m.activityType).toBe('activity');
    expect(m.lat).toBeNull();
    expect(m.types).toEqual([]);
  });

  test('builds a photo URL from the first photo resource name', () => {
    const m = mapPlace({ displayName: { text: 'X' }, photos: [{ name: 'places/abc/photos/xyz' }] });
    expect(typeof m.photo).toBe('string');
    expect(m.photo).toContain('places/abc/photos/xyz/media');
  });
});
