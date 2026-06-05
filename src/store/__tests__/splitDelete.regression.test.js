/**
 * splitDelete.regression.test.js — the books must stay balanced after a traveler
 * or family is removed mid-trip (a one-tap action via the People-tab swipe).
 *
 * The danger: an expense's `paidBy` (or a participant) points at someone who no
 * longer exists. calcBalances credits/charges by current members only, so a stale
 * reference makes Σ net ≠ 0 → settlements silently mis-state who owes what.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../index';
import { calcBalances, calcSettlements } from '../../utils/costs';

const S = () => useStore.getState();
const tripById = id => S().trips.find(t => t.id === id);
const netSum = t => calcBalances(t).reduce((s, b) => s + b.net, 0);
const residual = (t) => {
  const balances = calcBalances(t);
  const net = {};
  balances.forEach(b => { net[b.member.id] = b.net; });
  calcSettlements(balances).forEach(s => { net[s.from.id] += s.amount; net[s.to.id] -= s.amount; });
  return Math.max(0, ...Object.values(net).map(v => Math.abs(v)));
};

function makeTrip() {
  return S().createTrip({
    name: 'Del', destination: 'X', startDate: '2026-06-12', endDate: '2026-06-13', mode: 'manual',
    familyForms: [
      { name: 'Aye', members: [{ name: 'A1', age: '30' }, { name: 'A2', age: '8' }] },
      { name: 'Bee', members: [{ name: 'B1', age: '40' }] },
    ],
  });
}

describe('books survive a traveler / family removal', () => {
  test('deleting the PAYER keeps Σ net == 0', () => {
    const t = makeTrip();
    const [fA, fB] = t.families;
    S().addExpense(t.id, {
      name: 'Dinner', amount: 60, estimatedAmount: 60, category: '🍽️',
      paidBy: fB.members[0].id, splitMode: 'individual',
      participatingFamilies: [fA.id, fB.id], participatingMembers: null, excluded: false,
    });
    S().deleteTraveler(t.id, fB.id, fB.members[0].id); // remove B1 — the payer
    const t2 = tripById(t.id);
    expect(netSum(t2)).toBeCloseTo(0, 2);
    expect(residual(t2)).toBeLessThan(0.51);
  });

  test('deleting a non-payer participant keeps the books balanced', () => {
    const t = makeTrip();
    const [fA, fB] = t.families;
    S().addExpense(t.id, {
      name: 'Taxi', amount: 60, estimatedAmount: 60, category: '🚕',
      paidBy: fA.members[0].id, splitMode: 'individual',
      participatingFamilies: [fA.id, fB.id], participatingMembers: null, excluded: false,
    });
    S().deleteTraveler(t.id, fA.id, fA.members[1].id); // remove A2 (not the payer)
    const t2 = tripById(t.id);
    expect(netSum(t2)).toBeCloseTo(0, 2);
    expect(residual(t2)).toBeLessThan(0.51);
  });

  test('deleting the payer’s whole family keeps Σ net == 0', () => {
    const t = makeTrip();
    const [fA, fB] = t.families;
    S().addExpense(t.id, {
      name: 'Hotel', amount: 200, estimatedAmount: 200, category: '🏨',
      paidBy: fB.members[0].id, splitMode: 'family',
      participatingFamilies: [fA.id, fB.id], participatingMembers: null, excluded: false,
    });
    S().deleteFamily(t.id, fB.id); // remove Bee — the paying family
    const t2 = tripById(t.id);
    expect(netSum(t2)).toBeCloseTo(0, 2);
    expect(residual(t2)).toBeLessThan(0.51);
  });
});
