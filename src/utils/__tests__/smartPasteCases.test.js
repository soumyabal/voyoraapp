/**
 * smartPasteCases.test.js — robustness corpus for Smart Paste. Runs realistic pasted itineraries
 * (the shapes ChatGPT/Gemini/blogs actually produce) through the FULL deterministic path
 * (importTripFromText → parser + assembler), asserting a sane trip every time. This is the path
 * that runs WITHOUT an API key (the graceful fallback), and the AI path shares the same downstream.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../../store';
import { importTripFromText } from '../itineraryImport';

const build = (text, opts) => {
  const created = importTripFromText(useStore.getState(), text, { startDate: '2026-08-01', ...opts });
  return useStore.getState().trips.find(t => t.id === created.trip.id);
};
const allActs = (trip) => trip.days.flatMap(d => d.activities);
const hasType = (trip, type) => allActs(trip).some(a => a.type === type);

describe('Smart Paste — realistic format corpus (deterministic path)', () => {
  test('ChatGPT: "Day N" + bold + bullets (no calendar dates)', () => {
    const t = build(`**Day 1 – Arrival in Rome**
- Check in to your hotel near the Colosseum.
- Evening: Dinner in Trastevere.
**Day 2 – Ancient Rome**
- Morning: Colosseum and Roman Forum.
- Afternoon: Lunch near Palatine Hill.
**Day 3 – Vatican City**
- Vatican Museums and St. Peter's Basilica.`);
    expect(t.days).toHaveLength(3);
    expect(t.days.map(d => d.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(hasType(t, 'stay')).toBe(true);   // "check in to your hotel"
    expect(hasType(t, 'food')).toBe(true);   // dinner / lunch
    expect(allActs(t).length).toBeGreaterThanOrEqual(5);
  });

  test('Gemini: segments + calendar dates + Stop N + Option A/B', () => {
    const t = build(`Segment 1: Los Angeles (June 30 – July 2)
June 30: Arrival
Land at LAX and check in to your hotel.
July 1: Sights
Morning: Griffith Observatory.
Option A: Universal Studios Hollywood.
Option B: The Getty Center.
Segment 2: San Diego (July 2 – July 3)
July 2: Drive south
Stop 1 (Laguna Beach): Heisler Park.
July 3: Departure
Check out and fly home from LAX.`, { year: 2026 });
    expect(t.days.map(d => d.date)).toEqual(['2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03']);
    expect(hasType(t, 'transport')).toBe(true);   // land / fly
    // Option B imported as skipped (alternative kept visible, not double-booked)
    const optB = allActs(t).find(a => /Getty/.test(a.name));
    expect(optB && optB.status).toBe('skipped');
  });

  test('Bulleted markdown with explicit times', () => {
    const t = build(`Day 1: Tokyo
* 09:00 Breakfast at the hotel
* 11:00 Senso-ji Temple
* 19:30 Dinner in Shibuya
Day 2: Day trip
* 08:00 Train to Hakone
* 18:00 Return to Tokyo`);
    expect(t.days).toHaveLength(2);
    const times = allActs(t).map(a => a.time).filter(Boolean);
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times.every(tm => tm >= '00:00' && tm <= '23:59')).toBe(true);
  });

  test('Wall of text (newlines lost) still segments into days', () => {
    const t = build(`Day 1: Arrival Check in to the hotel. Evening: Dinner downtown. ` +
      `Day 2: Exploring Morning: City museum. Afternoon: Riverside walk. ` +
      `Day 3: Departure Check out and head to the airport.`);
    expect(t.days).toHaveLength(3);
    expect(allActs(t).length).toBeGreaterThanOrEqual(4);
  });

  test('Sparse / messy notes still yield a usable trip (never crashes)', () => {
    const t = build(`day 1 - land, hotel
day 2 - beach + lunch
day 3 - fly home`);
    expect(t.days).toHaveLength(3);
    expect(allActs(t).length).toBeGreaterThanOrEqual(3);
  });

  test('every imported activity has a valid time and a name', () => {
    const t = build(`Day 1: Paris
Morning: Louvre
Afternoon: Lunch near the Seine
Evening: Eiffel Tower at sunset`);
    for (const a of allActs(t)) {
      expect(typeof a.name).toBe('string');
      expect(a.name.length).toBeGreaterThan(0);
      if (a.time) expect(/^\d{2}:\d{2}$/.test(a.time)).toBe(true);
    }
  });
});
