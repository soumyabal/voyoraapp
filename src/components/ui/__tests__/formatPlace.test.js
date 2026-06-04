/**
 * formatPlace.test.js — the address-autocomplete label builder. The bug: a typed STREET
 * ADDRESS (Photon returns housenumber+street but NO `name`) showed nothing, so only a
 * nearby named POI (a Metra station) appeared. The label must build from the address too.
 */
import { formatPlace } from '../LocationSearchField';

describe('formatPlace', () => {
  test('a pure street address (no name) builds a real label', () => {
    const label = formatPlace({
      housenumber: '1243', street: 'Deerfield Pkwy', city: 'Buffalo Grove', state: 'Illinois', country: 'United States',
    });
    expect(label).toBe('1243 Deerfield Pkwy, Buffalo Grove, Illinois, United States');
  });

  test('a named POI uses its name (city not duplicated)', () => {
    const label = formatPlace({ name: 'Chicago', city: 'Chicago', state: 'Illinois', country: 'United States' });
    expect(label).toBe('Chicago, Illinois, United States');
  });

  test('a named landmark keeps its name + locality', () => {
    expect(formatPlace({ name: "O'Hare Airport", city: 'Chicago', state: 'Illinois', country: 'United States' }))
      .toBe("O'Hare Airport, Chicago, Illinois, United States");
  });

  test('street-only (no house number) still labels', () => {
    expect(formatPlace({ street: 'Main St', city: 'Mackinac Island', state: 'Michigan' }))
      .toBe('Main St, Mackinac Island, Michigan');
  });
});
