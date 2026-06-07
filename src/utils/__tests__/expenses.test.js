/**
 * expenses.test.js — the money path (the moat). Pins the invariants: per-person
 * cost × members, frozen estimatedAmount, per-family split, manual expenses kept.
 */
import { activityToExpense, rebuildItineraryExpenses, summariseExpenses } from '../expenses';

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
    expect(cat('weird')).toBe('🎯');          // unknown type → default
  });

  test('lodging splits by family; everything else inherits the trip mode', () => {
    const sm = type => activityToExpense({ id: 'x', name: 'x', type, costPerPerson: 1 }, 'D', members, ['f1']).splitMode;
    expect(sm('stay')).toBe('family');        // a shared hotel is a per-group cost
    expect(sm('food')).toBeNull();            // null = inherit trip splitMode
    expect(sm('activity')).toBeNull();
  });

  test('no members → amount 0 and paidBy null (no crash, no phantom payer)', () => {
    const e = activityToExpense({ id: 'a', name: 'Solo', type: 'activity', costPerPerson: 50 }, 'D', [], ['f1']);
    expect(e.amount).toBe(0);
    expect(e.paidBy).toBeNull();
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

describe('summariseExpenses', () => {
  const t = () => ({
    expenses: [
      { id: 'i1', source: 'itinerary', amount: 100, excluded: false },
      { id: 'i2', source: 'itinerary', amount: 50,  excluded: true },   // skipped
      { id: 'm1', source: 'manual',    amount: 80,  excluded: false },
      { id: 'm2', source: 'manual',    amount: 20,  excluded: true },   // skipped
    ],
  });

  test('splits by source into included/skipped buckets', () => {
    const s = summariseExpenses(t());
    expect(s.itinExpenses.map(e => e.id)).toEqual(['i1', 'i2']);
    expect(s.manualExpenses.map(e => e.id)).toEqual(['m1', 'm2']);
    expect(s.itinIncluded.map(e => e.id)).toEqual(['i1']);
    expect(s.itinSkipped.map(e => e.id)).toEqual(['i2']);
  });

  test('totals omit excluded expenses', () => {
    const s = summariseExpenses(t());
    expect(s.itinTotal).toBe(100);          // i1 only (i2 excluded)
    expect(s.manualTotal).toBe(80);         // m1 only (m2 excluded)
    expect(s.grandTotal).toBe(180);         // i1 + m1
  });

  test('handles a trip with no expenses', () => {
    const s = summariseExpenses({});
    expect(s.itinExpenses).toEqual([]);
    expect(s.grandTotal).toBe(0);
  });
});
