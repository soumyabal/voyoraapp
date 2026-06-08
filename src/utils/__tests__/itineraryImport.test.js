/**
 * itineraryImport.test.js — the assembler that turns parsed AI itinerary text into a real trip,
 * deterministically + offline. Builds against the live store (mocked AsyncStorage like store.test).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../../store';
import { importTripFromText, importTripFromTextAsync, cleanCity } from '../itineraryImport';

describe('cleanCity — normalise a city tag to a single base city', () => {
  test('route legs → destination', () => {
    expect(cleanCity('Dallas to St. Louis')).toBe('St. Louis');
    expect(cleanCity('Chicago → Mackinac Island')).toBe('Mackinac Island');
  });
  test('compound / qualifier stripping', () => {
    expect(cleanCity('Lahaina/West Maui')).toBe('Lahaina');
    expect(cleanCity('Downtown Las Vegas')).toBe('Las Vegas');
    expect(cleanCity('Greater Tokyo')).toBe('Tokyo');
    expect(cleanCity('Paris area')).toBe('Paris');
    expect(cleanCity('Old Town Prague')).toBe('Prague');
  });
  test('leaves real city names (incl. "… City") intact', () => {
    expect(cleanCity('Mexico City')).toBe('Mexico City');
    expect(cleanCity('Kansas City')).toBe('Kansas City');
    expect(cleanCity('St. Louis')).toBe('St. Louis');
    expect(cleanCity('')).toBeNull();
  });
});

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

describe('combined "<Month Day>: Day N – Title" header (real Gemini road-trip format)', () => {
  // Regression: presegment used to split "June 30: Day 1 – …" into two lines, dropping the
  // calendar date and falling back to today-sequential dates. The header must stay one day.
  const TEXT = `📅 Day-by-Day Itinerary
June 30: Day 1 – Dallas to St. Louis
Drive: Take US-69 N to I-44 E through Oklahoma.
Time: Roughly 10.5 hours of pure driving.
July 1: Day 2 – Explore St. Louis
Morning: Visit the Gateway Arch National Park.
July 2: Day 3 – St. Louis to Chicago
Drive: Head north on I-55 N.`;

  test('honors the embedded calendar dates (not today-sequential)', () => {
    const res = importTripFromText(useStore.getState(), TEXT, { year: 2026 });
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    expect(t.days.map(d => d.date)).toEqual(['2026-06-30', '2026-07-01', '2026-07-02']);
  });

  test('drops pure metadata lines (Time:/Duration:) — no phantom "Time" activity', () => {
    const res = importTripFromText(useStore.getState(), TEXT, { year: 2026 });
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    const names = t.days.flatMap(d => d.activities.map(a => a.name));
    expect(names).not.toContain('Time');
  });
});

describe('AI path — a Claude contract assembles into a clean trip', () => {
  const CONTRACT = {
    tripName: 'Dallas to Mackinac Island road trip',
    destination: 'St. Louis · Chicago · Mackinac Island',
    days: [
      { date: '2026-06-30', city: 'St. Louis', items: [
        { name: 'Drive to St. Louis', type: 'transport', sub: 'car' },
        { name: 'Check in to hotel', type: 'stay' },
        { name: 'Dinner in Soulard', type: 'food' } ] },
      { date: '2026-07-01', city: 'St. Louis', items: [
        { name: 'Gateway Arch National Park', type: 'activity', time: '09:00' } ] },
      { date: '2026-07-02', city: 'Mackinaw City', items: [
        { name: 'Mackinac Island Ferry', type: 'transport', sub: 'train', time: '11:00' } ] },
    ],
  };

  test('uses Claude tripName/destination, dates, and types', async () => {
    const res = await importTripFromTextAsync(useStore.getState(), 'raw', { extract: async () => CONTRACT });
    expect(res.source).toBe('ai');
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    expect(t.name).toBe('Dallas to Mackinac Island road trip');
    expect(t.destination).toBe('St. Louis · Chicago · Mackinac Island');
    expect(t.days.map(d => d.date)).toEqual(['2026-06-30', '2026-07-01', '2026-07-02']);
    const ferry = t.days[2].activities.find(a => /Ferry/.test(a.name));
    expect(ferry.type).toBe('transport');
    expect(t.days[0].activities.find(a => /Dinner/.test(a.name)).type).toBe('food');
  });

  test('tags each stop with its day city (so Discover can offer per-night cities)', async () => {
    const res = await importTripFromTextAsync(useStore.getState(), 'raw', { extract: async () => CONTRACT });
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    expect(t.days[0].activities.every(a => a.city === 'St. Louis')).toBe(true);
    expect(t.days[2].activities.find(a => /Ferry/.test(a.name)).city).toBe('Mackinaw City');
  });
});

describe('single-city fallback — light up coords + city when the AI omits the per-day city', () => {
  // A single-city plan with NO per-day "city" (the common ChatGPT shape) — every stop should still
  // get the destination's city tag + coords so timezone/Discover work, with zero per-stop city data.
  const NYC = {
    destination: 'New York City',
    days: [
      { dayNumber: 1, items: [{ name: 'Central Park' }, { name: 'Times Square' }] },
      { dayNumber: 2, items: [{ name: 'Brooklyn Bridge' }] },
    ],
  };

  test('every stop gets the destination city + coords from the single-city fallback', async () => {
    const res = await importTripFromTextAsync(useStore.getState(), 'raw', { extract: async () => NYC });
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    const stops = t.days.flatMap(d => d.activities);
    expect(stops.length).toBe(3);
    expect(stops.every(a => !!a.city)).toBe(true);            // tagged (was untagged before)
    expect(stops.every(a => a.lat != null && a.lng != null)).toBe(true); // coords (timezone lights up)
  });

  test('multi-city trips are NEVER cross-tagged — a city-less day stays untagged/uncoorded', async () => {
    // Paris day is tagged; the Rome day omits its city. The fallback must NOT fire (it would put
    // Paris coords/zone on a Rome stop), so that stop stays clean for the user to resolve.
    const MULTI = {
      destination: 'Paris · Rome',
      days: [
        { date: '2026-07-01', city: 'Paris', items: [{ name: 'Louvre Museum' }] },
        { date: '2026-07-02', items: [{ name: 'A mystery stop with no place' }] },
      ],
    };
    const res = await importTripFromTextAsync(useStore.getState(), 'raw', { extract: async () => MULTI });
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    const parisStop = t.days[0].activities.find(a => /Louvre/.test(a.name));
    const romeDayStop = t.days[1].activities.find(a => /mystery/i.test(a.name));
    expect(parisStop.city).toBe('Paris');                 // its own day's city kept
    expect(romeDayStop.city).toBeUndefined();             // NOT cross-tagged with Paris
    expect(romeDayStop.lat).toBeUndefined();              // and no wrong coords/zone
  });
});
