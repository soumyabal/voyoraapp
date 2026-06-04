/**
 * familyBalances.test.js — calcFamilyBalances aggregates the per-MEMBER ledger up to
 * a per-FAMILY net (paid − owed). This is the data behind the During-trip running tally
 * ("the Garcias owe you ~$210"). Sorted most-fronted-first; the books always balance.
 */
import { calcFamilyBalances } from '../costs';

const TRIP = {
  splitMode: 'family',
  families: [
    { id: 'A', name: 'Sharma', color: '#000', members: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] },
    { id: 'B', name: 'Gupta', color: '#111', members: [{ id: 'b1' }, { id: 'b2' }] },
  ],
  expenses: [
    // Sharma's a1 fronts a $300 hotel split equally between the two families.
    { id: 'h', amount: 300, splitMode: 'family', participatingFamilies: ['A', 'B'], category: '🏨', paidBy: 'a1' },
  ],
};

describe('calcFamilyBalances', () => {
  test('the family that fronted is up, the other owes, and the nets cancel', () => {
    const fb = calcFamilyBalances(TRIP);
    const A = fb.find(x => x.family.id === 'A');
    const B = fb.find(x => x.family.id === 'B');
    expect(A.paid).toBe(300);
    expect(A.net).toBeCloseTo(150);   // paid 300, owed its $150 share
    expect(B.net).toBeCloseTo(-150);  // paid 0, owes $150
    expect(A.net + B.net).toBeCloseTo(0);
  });

  test('sorted most-fronted-first', () => {
    expect(calcFamilyBalances(TRIP).map(x => x.family.id)).toEqual(['A', 'B']);
  });

  test('excluded expenses are ignored', () => {
    const trip = { ...TRIP, expenses: [{ ...TRIP.expenses[0], excluded: true }] };
    const fb = calcFamilyBalances(trip);
    expect(fb.every(x => x.net === 0)).toBe(true);
  });

  test('no families → empty array (no crash)', () => {
    expect(calcFamilyBalances({ families: [], expenses: [] })).toEqual([]);
  });
});
