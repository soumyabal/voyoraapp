/**
 * lodgingSplit.test.js — lodging defaults to an EQUAL per-family split, and the
 * uneven-split balance guard keeps settlement from leaking when custom amounts
 * don't sum to the total.
 */
import { activityToExpense } from '../expenses';
import { famExpenseShare, unevenActive } from '../costs';

const TRIP = {
  splitMode: 'individual', // trip default is per-person — lodging must override to family
  families: [
    { id: 'A', name: 'Sharma', color: '#000', members: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] },
    { id: 'B', name: 'Gupta', color: '#111', members: [{ id: 'b1' }, { id: 'b2' }] },
  ],
};
const ALL = [...TRIP.families[0].members, ...TRIP.families[1].members];

describe('lodging defaults to an equal per-family split', () => {
  test('a stay expense gets splitMode "family"; a meal inherits (null)', () => {
    const stay = activityToExpense({ id: 's', type: 'stay', name: 'Hotel', costPerPerson: 75.6 }, 'Day 1', ALL, ['A', 'B']);
    expect(stay.splitMode).toBe('family');
    const meal = activityToExpense({ id: 'm', type: 'food', name: 'Dinner', costPerPerson: 20 }, 'Day 1', ALL, ['A', 'B']);
    expect(meal.splitMode).toBeNull();
  });

  test('two families split a $378 hotel equally ($189 each), not by headcount', () => {
    const stay = { id: 's', amount: 378, splitMode: 'family', participatingFamilies: ['A', 'B'], category: '🏨' };
    expect(famExpenseShare(TRIP.families[0], stay, TRIP)).toBeCloseTo(189);  // 3 members
    expect(famExpenseShare(TRIP.families[1], stay, TRIP)).toBeCloseTo(189);  // 2 members — same, by family
  });
});

describe('uneven-split balance guard', () => {
  const base = { id: 's', amount: 300, splitMode: 'family', participatingFamilies: ['A', 'B'], category: '🏨', unevenSplit: true };

  test('BALANCED custom shares (200 / 100) are used', () => {
    const exp = { ...base, customShares: { A: 200, B: 100 } };
    expect(unevenActive(exp, TRIP)).toBe(true);
    expect(famExpenseShare(TRIP.families[0], exp, TRIP)).toBe(200);
    expect(famExpenseShare(TRIP.families[1], exp, TRIP)).toBe(100);
  });

  test('UNBALANCED custom shares (200 / 50 = 250 ≠ 300) fall back to even — no leak', () => {
    const exp = { ...base, customShares: { A: 200, B: 50 } };
    expect(unevenActive(exp, TRIP)).toBe(false);
    const a = famExpenseShare(TRIP.families[0], exp, TRIP);
    const b = famExpenseShare(TRIP.families[1], exp, TRIP);
    expect(a).toBe(150);
    expect(b).toBe(150);
    expect(a + b).toBeCloseTo(exp.amount); // the books always balance
  });
});
