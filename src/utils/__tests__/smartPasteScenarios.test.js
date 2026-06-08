/**
 * smartPasteScenarios.test.js — a BROAD scenario matrix for Smart Paste, growing over time.
 *
 * Two surfaces, both fully offline:
 *   • DETERMINISTIC path (importTripFromText) — the no-key fallback; tests format robustness.
 *   • ASSEMBLER path (importTripFromTextAsync + an injected Claude contract) — the shared
 *     downstream of the LIVE AI path; tests trip-type correctness (cities, coords, types, dates)
 *     WITHOUT a key or network. (Live EXTRACTION quality is device-verified by the owner.)
 *
 * Add a row whenever a new real-world paste shape surfaces.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../../store';
import { importTripFromText, importTripFromTextAsync } from '../itineraryImport';

const build = (text, opts) => {
  const r = importTripFromText(useStore.getState(), text, { startDate: '2026-08-01', ...opts });
  return r && useStore.getState().trips.find(t => t.id === r.trip.id);
};
const buildAI = async (contract, opts) => {
  const r = await importTripFromTextAsync(useStore.getState(), 'raw', { extract: async () => contract, ...opts });
  return r && useStore.getState().trips.find(t => t.id === r.trip.id);
};
const acts = (t) => t.days.flatMap(d => d.activities);
const hasType = (t, type) => acts(t).some(a => a.type === type);
const citiesOf = (t) => [...new Set(acts(t).map(a => a.city).filter(Boolean))];

// ─────────────────────────────────────────────────────────────────────────────
describe('Scenarios — deterministic format robustness (no key)', () => {
  test('parenthetical date headers: "Day 1 (July 1): …"', () => {
    const t = build(`Day 1 (July 1): Arrival
Morning: Land at the airport.
Afternoon: Check in to your hotel.
Day 2 (July 2): Sightseeing
Morning: City museum.
Day 3 (July 3): Departure
Check out and fly home.`, { year: 2026 });
    expect(t.days.map(d => d.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(hasType(t, 'stay')).toBe(true);
    expect(hasType(t, 'transport')).toBe(true);
  });

  test('24-hour times are preserved and valid', () => {
    const t = build(`Day 1: Tokyo
09:00 Breakfast at the hotel
13:30 Senso-ji Temple
19:45 Dinner in Shibuya`);
    const times = acts(t).map(a => a.time).filter(Boolean);
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times.every(tm => /^\d{2}:\d{2}$/.test(tm) && tm >= '00:00' && tm <= '23:59')).toBe(true);
  });

  test('emoji-prefixed day headers still segment', () => {
    const t = build(`📅 Day 1: Rome
Morning: Colosseum.
📅 Day 2: Vatican
Morning: Vatican Museums.`);
    expect(t.days).toHaveLength(2);
    expect(acts(t).length).toBeGreaterThanOrEqual(2);
  });

  test('YEAR-BOUNDARY: Dec → Jan rolls the year forward', () => {
    const t = build(`December 30: Day 1 – New Year's road trip begins
Morning: Drive out of town.
January 1: Day 3 – New Year's Day
Morning: Watch the parade.
January 2: Day 4 – Head home
Morning: Drive back.`, { year: 2026 });
    // Dec stays 2026; Jan must roll to 2027 (not 2026), and the trip must be in order.
    expect(t.startDate).toBe('2026-12-30');
    expect(t.endDate).toBe('2027-01-02');
    expect(t.days.map(d => d.date)).toEqual(t.days.map(d => d.date).slice().sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Scenarios — assembler/trip-type correctness (injected Claude contract)', () => {
  test('International TZ-crossing: NYC → Tokyo (cities + coords + flight)', async () => {
    const contract = { tripName: 'Tokyo trip', destination: 'Tokyo, Japan', days: [
      { date: '2026-09-01', city: 'New York', items: [
        { name: 'Fly JFK to Tokyo', type: 'transport', sub: 'flight' } ] },
      { date: '2026-09-02', city: 'Tokyo', items: [
        { name: 'Senso-ji Temple', type: 'activity' }, { name: 'Sushi dinner', type: 'food' } ] },
      { date: '2026-09-03', city: 'Tokyo', items: [
        { name: 'Check in to ryokan', type: 'stay' } ] },
    ] };
    const t = await buildAI(contract);
    expect(t.days.map(d => d.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(citiesOf(t).sort()).toEqual(['New York', 'Tokyo']);
    // Tokyo stops resolve to coords via the city fallback (gazetteer has Tokyo + JFK).
    expect(acts(t).find(a => /Senso-ji/.test(a.name)).lat).not.toBeNull();
    expect(hasType(t, 'transport')).toBe(true);
  });

  test('Europe multi-country: Paris · Rome · Barcelona (per-city tags + coords)', async () => {
    const contract = { destination: 'Europe', days: [
      { date: '2026-05-01', city: 'Paris', items: [{ name: 'Louvre', type: 'activity' }] },
      { date: '2026-05-02', city: 'Rome', items: [{ name: 'Colosseum', type: 'activity' }] },
      { date: '2026-05-03', city: 'Barcelona', items: [{ name: 'Sagrada Familia', type: 'activity' }] },
    ] };
    const t = await buildAI(contract);
    expect(citiesOf(t)).toEqual(['Paris', 'Rome', 'Barcelona']);
    expect(acts(t).every(a => a.lat != null)).toBe(true);   // all three cities in the gazetteer
  });

  test('Road trip with newly-added cities gets coords (St. Louis, Memphis)', async () => {
    const contract = { destination: 'Road trip', days: [
      { date: '2026-06-30', city: 'St. Louis', items: [{ name: 'Gateway Arch', type: 'activity' }] },
      { date: '2026-07-01', city: 'Memphis', items: [{ name: 'Graceland', type: 'activity' }] },
    ] };
    const t = await buildAI(contract);
    // Specific POIs aren't in the gazetteer, but the segment city now is → coords via fallback.
    expect(acts(t).every(a => a.lat != null)).toBe(true);
  });

  test('Single-city long weekend: one city across all days', async () => {
    const contract = { tripName: 'NYC weekend', destination: 'New York', days: [
      { date: '2026-10-10', city: 'New York', items: [{ name: 'Central Park', type: 'activity' }] },
      { date: '2026-10-11', city: 'New York', items: [{ name: 'MoMA', type: 'activity' }, { name: 'Broadway show', type: 'activity' }] },
      { date: '2026-10-12', city: 'New York', items: [{ name: 'Brunch in SoHo', type: 'food' }] },
    ] };
    const t = await buildAI(contract);
    expect(citiesOf(t)).toEqual(['New York']);
    expect(t.days).toHaveLength(3);
  });

  test('dayNumber-only contract (no dates) → consecutive dates from startDate', async () => {
    const contract = { destination: 'Somewhere', days: [
      { dayNumber: 1, city: 'Lisbon', items: [{ name: 'Belém Tower', type: 'activity' }] },
      { dayNumber: 2, city: 'Lisbon', items: [{ name: 'Jerónimos Monastery', type: 'activity' }] },
    ] };
    const t = await buildAI(contract, { startDate: '2026-08-01' });
    expect(t.days.map(d => d.date)).toEqual(['2026-08-01', '2026-08-02']);
  });

  test('options in the contract import as skipped (alternative kept visible)', async () => {
    const contract = { destination: 'LA', days: [
      { date: '2026-07-02', city: 'Los Angeles', items: [
        { name: 'Universal Studios', type: 'activity', option: 'A' },
        { name: 'The Getty', type: 'activity', option: 'B' } ] },
    ] };
    const t = await buildAI(contract);
    expect(acts(t).find(a => /Getty/.test(a.name)).status).toBe('skipped');
    expect(acts(t).find(a => /Universal/.test(a.name)).status).toBeFalsy();
  });
});
