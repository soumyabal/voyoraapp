/**
 * expenses.test.js — the money path (the moat). Pins the invariants: per-person
 * cost × members, frozen estimatedAmount, per-family split, manual expenses kept.
 */
import { activityToExpense, rebuildItineraryExpenses } from '../expenses';

const trip = () => ({
  families: [
    { id: 'f1', members: [{ id: 'm1' }, { id: 'm2' }] }, // 2
    { id: 'f2', members: [{ id: 'm3' }] },                // 1  → 3 total
  ],
  days: [
    { label: 'Day 1', activities: [
      { id: 'a1', name: 'Hotel',  type: 'stay',     costPerPerson: 60 },
      { id: 'a2', name: 'Park',   type: 'activity', costPerPerson: 0 },   // free → no expense
    ] },
    { label: 'Day 2', activities: [
      { id: 'a3', name: 'Dinner', type: 'food',     costPerPerson: 35 },
    ] },
  ],
  expenses: [
    { id: 'man1', name: 'Gas',         source: 'manual',    amount: 80 },
    { id: 'old',  name: 'stale itin',  source: 'itinerary', amount: 10 }, // dropped on rebuild
  ],
});

describe('activityToExpense', () => {
  const members = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  test('amount = costPerPerson × member count, estimatedAmount frozen equal', () => {
    const e = activityToExpense({ id: 'a1', name: 'Hotel', type: 'stay', costPerPerson: 60 }, 'Day 1', members, ['f1', 'f2']);
    expect(e.amount).toBe(180);              // 60 × 3
    expect(e.estimatedAmount).toBe(180);     // frozen at creation
    expect(e.participatingFamilies).toEqual(['f1', 'f2']); // ALL families
    expect(e.participatingMembers).toBeNull();
    expect(e.source).toBe('itinerary');
    expect(e.activityId).toBe('a1');
    expect(e.category).toBe('🏨');
    expect(e.paidBy).toBe('m1');
  });

  test('category maps by type, default 🎯', () => {
    const cat = type => activityToExpense({ id: 'x', name: 'x', type, costPerPerson: 1 }, 'D', members, ['f1']).category;
    expect(cat('food')).toBe('🍽️');
    expect(cat('transport')).toBe('✈️');
    expect(cat('activity')).toBe('🎯');
  });
});

describe('rebuildItineraryExpenses', () => {
  test('one expense per COSTED activity, free ones skipped, per-family amounts', () => {
    const out = rebuildItineraryExpenses(trip());
    const itin = out.filter(e => e.source === 'itinerary');
    expect(itin).toHaveLength(2);                                   // hotel + dinner, NOT the free park
    expect(itin.find(e => e.name.startsWith('Hotel')).amount).toBe(180);  // 60 × 3
    expect(itin.find(e => e.name.startsWith('Dinner')).amount).toBe(105); // 35 × 3
    itin.forEach(e => {
      expect(e.participatingFamilies).toEqual(['f1', 'f2']);        // every family participates
      expect(e.estimatedAmount).toBe(e.amount);                     // frozen
    });
  });

  test('manual expenses preserved; stale itinerary expenses replaced', () => {
    const out = rebuildItineraryExpenses(trip());
    expect(out.find(e => e.id === 'man1')).toBeTruthy();            // manual kept
    expect(out.find(e => e.id === 'old')).toBeFalsy();             // stale itinerary dropped
  });

  test('empty / no-cost trip yields only manual expenses', () => {
    const t = { families: [{ id: 'f1', members: [{ id: 'm1' }] }], days: [{ label: 'D1', activities: [{ id: 'a', type: 'activity', costPerPerson: 0 }] }], expenses: [{ id: 'm', source: 'manual' }] };
    const out = rebuildItineraryExpenses(t);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('m');
  });
});
