/**
 * devSeed.test.js — the dev demo trip seeds REAL data that exercises the timezone features.
 * Season-robust: asserts the zone FAMILY (first letter: C-entral / P-acific) + the season-stable
 * leg duration, never the exact CDT/CST abbreviation (which depends on the run date's DST).
 */
// AsyncStorage isn't available in node — use the package's jest mock so importing the
// persisted store doesn't throw on rehydrate (same as store.test.js).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../../store';
import { seedCrossZoneDemo, seedTokyoDemo, seedMultiFamilyDemo, seedPastedDemo, DEMO_SEEDS } from '../devSeed';
import { crossZoneLeg, resolveDayZones } from '../helpers';

const byName = (trip, dayIdx, name) => trip.days[dayIdx].activities.find(a => a.name === name);

describe('seedCrossZoneDemo', () => {
  let trip;
  beforeAll(() => {
    const created = seedCrossZoneDemo(useStore.getState());
    trip = useStore.getState().trips.find(t => t.id === created.id);
  });

  test('builds a 5-day ORD → LAX → San Diego trip with a home origin', () => {
    expect(trip.days).toHaveLength(5);
    expect(trip.origin.label).toMatch(/ORD/);
  });

  test('outbound flight ORD→LAX crosses Central → Pacific (4h30, same calendar day)', () => {
    const leg = crossZoneLeg(trip, 0, byName(trip, 0, 'Flight ORD → LAX'));
    expect(leg).not.toBeNull();
    expect(leg.departLabel[0]).toBe('C');   // C{D/S}T
    expect(leg.arriveLabel[0]).toBe('P');   // P{D/S}T
    expect(leg.durationMin).toBe(270);      // DST-stable: both zones shift together
    expect(leg.dayOffset).toBe(0);
  });

  test('return flight LAX→ORD crosses Pacific → Central', () => {
    const leg = crossZoneLeg(trip, 3, byName(trip, 3, 'Flight LAX → ORD'));
    expect(leg).not.toBeNull();
    expect(leg.departLabel[0]).toBe('P');
    expect(leg.arriveLabel[0]).toBe('C');
  });

  test('the LA → San Diego drive is same-zone → no cross-zone leg', () => {
    expect(crossZoneLeg(trip, 1, byName(trip, 1, 'Drive to San Diego'))).toBeNull();
  });

  test('every stop carries a zone flag — Pacific in California, Central back in Chicago', () => {
    const z0 = resolveDayZones(trip, 0).zoneById;
    expect(z0[byName(trip, 0, 'Lunch in Santa Monica').id][0]).toBe('P');
    const z4 = resolveDayZones(trip, 4).zoneById;
    expect(z4[byName(trip, 4, 'Welcome-home brunch').id][0]).toBe('C');
  });
});

describe('other demo scenarios build valid trips', () => {
  // Re-read from the store: store actions write a NEW trip object, so the returned reference
  // predates the addActivity calls (the app only needs the id; tests need the live trip).
  const fresh = (created) => useStore.getState().trips.find(t => t.id === created.id);

  test('Tokyo demo: the outbound flight is a red-eye into JST (+1 day)', () => {
    const t = fresh(seedTokyoDemo(useStore.getState()));
    const fl = t.days[0].activities.find(a => /NRT/.test(a.name) && /ORD/.test(a.name));
    const leg = crossZoneLeg(t, 0, fl);
    expect(leg).not.toBeNull();
    expect(leg.dayOffset).toBe(1);          // lands the next calendar day
    expect(leg.arriveLabel).toMatch(/GMT\+9|JST/);
  });

  test('multi-family demo: 2 families + costed activities fund the split', () => {
    const t = fresh(seedMultiFamilyDemo(useStore.getState()));
    expect(t.families).toHaveLength(2);
    expect(t.itineraryPushed).toBe(true);          // costed stops auto-funded the split
    expect(t.expenses.length).toBeGreaterThan(0);
  });

  test('pasted demo: builds a multi-day trip from text with no manual entry', () => {
    const t = fresh(seedPastedDemo(useStore.getState()));
    expect(t).toBeTruthy();
    expect(t.days.length).toBeGreaterThanOrEqual(5);
    expect(t.days.some(d => d.activities.length > 0)).toBe(true);
  });

  test('every registered demo seed returns a trip with days', () => {
    for (const seed of DEMO_SEEDS) {
      const t = fresh(seed.run(useStore.getState()));
      expect(t && t.id).toBeTruthy();
      expect(t.days.length).toBeGreaterThan(0);
    }
  });
});
