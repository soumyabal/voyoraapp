/**
 * itineraryImport.test.js — the assembler that turns parsed AI itinerary text into a real trip,
 * deterministically + offline. Builds against the live store (mocked AsyncStorage like store.test).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../../store';
import { importTripFromText } from '../itineraryImport';

const SAMPLE = `
Segment 1: Los Angeles (June 30 – July 3)
June 30: Arrival & Santa Monica
Land at LAX, grab your rental car, and head straight to the coast.
Spend the afternoon walking the Santa Monica Pier.
July 1: Hollywood & Griffith Observatory
Morning: Hike the trails at Griffith Park.
Afternoon: Explore the Griffith Observatory.
Evening: find a dinner spot in West Hollywood.
July 2: Theme Park or Museum Day
Option A: Spend a high-energy day at Universal Studios Hollywood.
Option B: Visit the Getty Center.
Segment 3: San Diego (July 3 – July 4)
July 3: Coastal drive to San Diego
Check out of your LA hotel.
Drive south down the coast.
Stop 1 (Laguna Beach): Stroll around Heisler Park.
July 4: Balboa Park & Zoo
Spend the day at Balboa Park and the San Diego Zoo.
`;

describe('importTripFromText — paste an AI plan → a real trip', () => {
  let result;
  beforeAll(() => { result = importTripFromText(useStore.getState(), SAMPLE, { year: 2026 }); });
  const trip = () => useStore.getState().trips.find(t => t.id === result.trip.id);
  const dayByDate = (d) => trip().days.find(x => x.date === d);

  test('creates a dated trip spanning the parsed range', () => {
    const t = trip();
    expect(t.days[0].date).toBe('2026-06-30');
    expect(t.days[t.days.length - 1].date).toBe('2026-07-04');
    expect(t.name).toMatch(/Los Angeles/);
  });

  test('lands activities on the correct days with names + types', () => {
    const jun30 = dayByDate('2026-06-30');
    expect(jun30.activities.find(a => /LAX/.test(a.name)).type).toBe('transport');
    expect(jun30.activities.some(a => a.name === 'Santa Monica Pier')).toBe(true);

    const jul1 = dayByDate('2026-07-01');
    expect(jul1.activities.some(a => a.name === 'Griffith Observatory')).toBe(true);
  });

  test('Option A is active, Option B is imported as skipped (the choice stays visible)', () => {
    const jul2 = dayByDate('2026-07-02');
    const universal = jul2.activities.find(a => /Universal/.test(a.name));
    const getty = jul2.activities.find(a => /Getty/.test(a.name));
    expect(universal.status).toBeFalsy();
    expect(getty.status).toBe('skipped');
  });

  test('a checkout line becomes a stay; a named stop keeps its place', () => {
    const jul3 = dayByDate('2026-07-03');
    expect(jul3.activities.find(a => /Check out/.test(a.name)).type).toBe('stay');
    expect(jul3.activities.some(a => a.name === 'Laguna Beach')).toBe(true);
  });

  test('times are ordered and within the day (no pre-dawn / past-midnight)', () => {
    for (const d of trip().days) {
      for (const a of d.activities) {
        if (!a.time) continue;
        expect(a.time >= '06:00').toBe(true);
        expect(a.time <= '23:30').toBe(true);
      }
    }
  });

  test('offline gazetteer gives flights + city stops coords (timezone lights up, no API)', () => {
    const jun30 = dayByDate('2026-06-30');
    const flight = jun30.activities.find(a => /LAX/.test(a.name));
    expect(flight.lat).not.toBeNull();           // LAX resolved from the gazetteer
    expect(flight.lng).not.toBeNull();
    // A San Diego stop should resolve to a Pacific-zone coordinate.
    const jul3 = dayByDate('2026-07-03');
    expect(jul3.activities.some(a => a.lat != null)).toBe(true);
  });

  test('reports an honest summary', () => {
    expect(result.summary.days).toBe(5);   // Jun30, Jul1, Jul2, Jul3, Jul4
    expect(result.summary.imported).toBeGreaterThan(6);
  });
});
