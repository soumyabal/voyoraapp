/**
 * store.test.js — SAFETY NET (characterization tests).
 *
 * Locks the CURRENT behaviour of the Zustand store's money path — the part with
 * zero tests today and the part that must never silently break (per-family expense
 * splitting = "the moat"). These pin behaviour so the upcoming store-split / config
 * refactors can't change it unnoticed. They are additive: they cannot break prod.
 *
 * Covers: createTrip shape + day generation, the persisted-trip shape guard (so a
 * field change forces a conscious AsyncStorage version bump), addActivity auto-
 * funding the split, the at-least-one-family invariant, payer auto-inclusion, and
 * an end-to-end settlement assertion.
 */

// AsyncStorage isn't available in node — use the mock that ships with the package
// so importing the persisted store doesn't throw on rehydrate.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../index';
import { calcBalances, calcSettlements, getExpSplitBetween } from '../../utils/costs';

const S        = () => useStore.getState();
const tripById = id => S().trips.find(t => t.id === id);

// A deterministic 2-family / 3-member trip (Aye: A1+A2, Bee: B1) over 3 days.
function makeTrip(overrides = {}) {
  return S().createTrip({
    name: 'Net Test', destination: 'Testville',
    startDate: '2026-06-12', endDate: '2026-06-14', mode: 'manual',
    familyForms: [
      { name: 'Aye', members: [{ name: 'A1', age: '30' }, { name: 'A2', age: '8' }] },
      { name: 'Bee', members: [{ name: 'B1', age: '40' }] },
    ],
    ...overrides,
  });
}

// One costed food stop → drives the auto-fund + expense path.
const addDinner = (tripId, cpp = 10) =>
  S().addActivity(tripId, 0, { type: 'food', name: 'Dinner', time: '19:00', costPerPerson: cpp });

describe('createTrip', () => {
  test('builds N days from the date range, individual split, not yet pushed', () => {
    const t = makeTrip();
    expect(t.days).toHaveLength(3);          // Jun 12, 13, 14 inclusive
    expect(t.families).toHaveLength(2);
    expect(t.splitMode).toBe('individual');
    expect(t.itineraryPushed).toBe(false);
    expect(t.expenses).toEqual([]);
    expect(t.origin).toBeNull();
  });

  test('persisted trip shape is locked — adding/removing a field must bump the storage version', () => {
    const t = makeTrip();
    // If this set changes, the AsyncStorage persist config (name/version/migrate)
    // MUST be updated too, or existing users rehydrate a stale shape. See
    // src/store/index.js persist({ name: 'voyara-storage' }).
    expect(Object.keys(t).sort()).toEqual([
      'bgColors', 'budget', 'days', 'destination', 'emoji', 'endDate', 'expenses',
      'families', 'focus', 'id', 'itineraryPushed', 'mode', 'name', 'origin',
      'pace', 'seenPlaces', 'splitMode', 'startDate',
    ]);
  });
});

describe('addActivity — auto-funds the per-family split', () => {
  test('a costed activity creates a frozen expense and marks the trip pushed', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const t2 = tripById(t.id);
    expect(t2.itineraryPushed).toBe(true);
    expect(t2.expenses).toHaveLength(1);
    const exp = t2.expenses[0];
    expect(exp.amount).toBe(30);            // $10/person × 3 members
    expect(exp.estimatedAmount).toBe(30);   // estimatedAmount is FROZEN
    expect(exp.activityId).toBeTruthy();    // linked to its activity
  });

  test('a free activity (costPerPerson 0) creates no expense', () => {
    const t = makeTrip();
    S().addActivity(t.id, 0, { type: 'activity', name: 'Park walk', time: '10:00', costPerPerson: 0 });
    expect(tripById(t.id).expenses).toHaveLength(0);
  });
});

describe('expense moat — invariants that must never break', () => {
  test('toggleFamilySplit always keeps at least one participating family', () => {
    const t = makeTrip();
    addDinner(t.id);
    const exp = tripById(t.id).expenses[0];
    const [f1, f2] = tripById(t.id).families;
    S().toggleFamilySplit(t.id, exp.id, f1.id, false);
    S().toggleFamilySplit(t.id, exp.id, f2.id, false);   // try to remove the last one
    expect(tripById(t.id).expenses[0].participatingFamilies.length).toBeGreaterThanOrEqual(1);
  });

  test('updateExpensePayer auto-includes the payer’s family', () => {
    const t = makeTrip();
    addDinner(t.id);
    let t2 = tripById(t.id);
    const exp = t2.expenses[0];
    const payerFam = t2.families[1];                 // Bee
    const payer    = payerFam.members[0];            // B1
    // drop Bee first, then make B1 the payer → must be re-included
    S().toggleFamilySplit(t.id, exp.id, payerFam.id, false);
    S().updateExpensePayer(t.id, exp.id, payer.id);
    t2 = tripById(t.id);
    expect(t2.expenses[0].paidBy).toBe(payer.id);
    expect(t2.expenses[0].participatingFamilies).toContain(payerFam.id);
  });

  test('getExpSplitBetween reflects the participating members', () => {
    const t = makeTrip();
    addDinner(t.id);
    const t2  = tripById(t.id);
    const ids = getExpSplitBetween(t2.expenses[0], t2);
    expect(ids).toHaveLength(3);                      // all 3 members by default
  });
});

describe('settlement (end-to-end money assertion)', () => {
  test('non-payers settle up to the payer for their share', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                              // $30 total, 3 members → $10 each
    let t2 = tripById(t.id);
    const payer = t2.families[0].members[0];          // A1 pays the whole $30
    S().updateExpensePayer(t.id, t2.expenses[0].id, payer.id);
    t2 = tripById(t.id);

    const settlements = calcSettlements(calcBalances(t2));
    const toPayer = settlements.filter(x => x.to.id === payer.id);
    expect(toPayer.length).toBeGreaterThan(0);        // the two others owe A1
    const totalToPayer = toPayer.reduce((s, x) => s + x.amount, 0);
    expect(totalToPayer).toBeCloseTo(20, 1);          // A1 paid 30, owed 10 → net +20
  });
});
