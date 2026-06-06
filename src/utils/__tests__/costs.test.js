/**
 * costs.test.js — direct unit coverage for the split/settlement engine (THE MOAT).
 *
 * The store-level splitEngine.regression tests exercise the engine end-to-end; this pins the
 * pure per-expense/per-family/per-member share functions directly — including the branches the
 * regression suite doesn't hit (empty participating family, individual vs family uneven splits,
 * non-participants, the itinerary-cost rollups). Deterministic literal fixtures, no store.
 */
import {
  resolveMode, getEffectiveFamilies, getEffectiveMembers,
  expSharePerFamily, expSharePerPerson, unevenActive,
  famExpenseShare, memberExpenseShare,
  calcTripItineraryTotal, calcDayCostForTrip, calcDayPerPersonCost, calcFamilyItineraryCost,
  calcFamilyExpenseTotal, calcMemberExpenseShare,
  calcBalances, calcSettlements, calcFamilyBalances, paymentsOf,
} from '../costs';

// Two paying families (A: 2 members, head A1; B: 1 member) + an EMPTY family C (no members).
// The empty family is the key edge: it must never absorb a share (or the books leak).
const famA = { id: 'A', name: 'Aye', members: [{ id: 'A1', name: 'A1' }, { id: 'A2', name: 'A2' }] };
const famB = { id: 'B', name: 'Bee', members: [{ id: 'B1', name: 'B1' }] };
const famC = { id: 'C', name: 'Empty', members: [] };
const trip = (over = {}) => ({ families: [famA, famB, famC], splitMode: 'individual', expenses: [], days: [], ...over });
const exp = (o) => ({ amount: 0, participatingFamilies: ['A', 'B', 'C'], participatingMembers: null, excluded: false, ...o });
const close = (a, b) => Math.abs(a - b) < 1e-6;

describe('mode + participant resolution', () => {
  test('resolveMode: exp overrides trip, falls back to individual', () => {
    expect(resolveMode({ splitMode: 'family' }, trip({ splitMode: 'individual' }))).toBe('family');
    expect(resolveMode({}, trip({ splitMode: 'family' }))).toBe('family');
    expect(resolveMode({}, { families: [] })).toBe('individual');
  });
  test('getEffectiveFamilies defaults to all families', () => {
    expect(getEffectiveFamilies({ participatingFamilies: undefined }, trip()).map(f => f.id)).toEqual(['A', 'B', 'C']);
    expect(getEffectiveFamilies(exp({ participatingFamilies: ['B'] }), trip()).map(f => f.id)).toEqual(['B']);
  });
  test('getEffectiveMembers: individual mode narrows by participatingMembers', () => {
    const t = trip();
    expect(getEffectiveMembers(exp({}), t).map(m => m.id)).toEqual(['A1', 'A2', 'B1']); // C empty contributes none
    expect(getEffectiveMembers(exp({ participatingMembers: ['A1', 'B1'] }), t).map(m => m.id)).toEqual(['A1', 'B1']);
  });
});

describe('per-unit shares', () => {
  test('expSharePerFamily divides by PAYING families only (empty C excluded)', () => {
    expect(expSharePerFamily(exp({ amount: 100 }), trip())).toBe(50); // A & B, not C
  });
  test('expSharePerFamily → 0 when no paying family', () => {
    expect(expSharePerFamily(exp({ amount: 100, participatingFamilies: ['C'] }), trip())).toBe(0);
  });
  test('expSharePerPerson divides by member count; 0 when none', () => {
    expect(expSharePerPerson(exp({ amount: 90 }), trip())).toBe(30);          // A1,A2,B1
    expect(expSharePerPerson(exp({ amount: 90, participatingFamilies: ['C'] }), trip())).toBe(0);
  });
});

describe('famExpenseShare', () => {
  test('individual (even): family pays per involved member', () => {
    const e = exp({ amount: 90 }); // 30/person
    expect(famExpenseShare(famA, e, trip())).toBe(60); // A1 + A2
    expect(famExpenseShare(famB, e, trip())).toBe(30);
    expect(famExpenseShare(famC, e, trip())).toBe(0);  // empty
  });
  test('individual (even): narrowed participants', () => {
    const e = exp({ amount: 40, participatingMembers: ['A1', 'B1'] }); // 20/person
    expect(famExpenseShare(famA, e, trip())).toBe(20); // only A1 involved
    expect(famExpenseShare(famB, e, trip())).toBe(20);
  });
  test('family (even): equal per paying family', () => {
    const e = exp({ amount: 100, splitMode: 'family' });
    expect(famExpenseShare(famA, e, trip())).toBe(50);
    expect(famExpenseShare(famC, e, trip())).toBe(0);
  });
  test('non-participating family owes 0', () => {
    expect(famExpenseShare(famB, exp({ amount: 50, participatingFamilies: ['A'] }), trip())).toBe(0);
  });
  test('family uneven (balanced): uses customShares[famId]', () => {
    const e = exp({ amount: 100, splitMode: 'family', unevenSplit: true, customShares: { A: 70, B: 30 } });
    expect(unevenActive(e, trip())).toBe(true);
    expect(famExpenseShare(famA, e, trip())).toBe(70);
    expect(famExpenseShare(famB, e, trip())).toBe(30);
  });
  test('individual uneven (balanced): sums family members’ customShares', () => {
    const e = exp({ amount: 100, unevenSplit: true, customShares: { A1: 40, A2: 25, B1: 35 } });
    expect(unevenActive(e, trip())).toBe(true);
    expect(famExpenseShare(famA, e, trip())).toBe(65); // 40 + 25
    expect(famExpenseShare(famB, e, trip())).toBe(35);
  });
  test('uneven but UNBALANCED → falls back to even split', () => {
    const e = exp({ amount: 100, splitMode: 'family', unevenSplit: true, customShares: { A: 10, B: 10 } });
    expect(unevenActive(e, trip())).toBe(false);
    expect(famExpenseShare(famA, e, trip())).toBe(50); // even fallback
  });
});

describe('memberExpenseShare', () => {
  test('family mode: only the head carries the family share', () => {
    const e = exp({ amount: 100, splitMode: 'family' });
    expect(memberExpenseShare({ id: 'A1' }, e, trip())).toBe(50); // head
    expect(memberExpenseShare({ id: 'A2' }, e, trip())).toBe(0);  // dependent
  });
  test('individual mode: per-person if a participant, else 0', () => {
    const e = exp({ amount: 90 });
    expect(memberExpenseShare({ id: 'A2' }, e, trip())).toBe(30);
    expect(memberExpenseShare({ id: 'A2' }, exp({ amount: 90, participatingMembers: ['A1'] }), trip())).toBe(0);
  });
  test('family uneven: head carries customShares[famId]', () => {
    const e = exp({ amount: 100, splitMode: 'family', unevenSplit: true, customShares: { A: 70, B: 30 } });
    expect(memberExpenseShare({ id: 'A1' }, e, trip())).toBe(70);
    expect(memberExpenseShare({ id: 'A2' }, e, trip())).toBe(0);
  });
  test('individual uneven: member’s own custom amount when still a participant', () => {
    const e = exp({ amount: 100, unevenSplit: true, customShares: { A1: 40, A2: 25, B1: 35 } });
    expect(memberExpenseShare({ id: 'A1' }, e, trip())).toBe(40);
    // a stale custom entry for a non-participant can't leak in
    const narrowed = exp({ amount: 75, unevenSplit: true, participatingMembers: ['A1', 'B1'], customShares: { A1: 40, A2: 25, B1: 35 } });
    expect(memberExpenseShare({ id: 'A2' }, narrowed, trip())).toBe(0);
  });
});

describe('itinerary cost rollups', () => {
  const t = trip({ days: [
    { activities: [{ costPerPerson: 10 }, { costPerPerson: 5 }] }, // 15/person
    { activities: [{ costPerPerson: 20 }] },                        // 20/person
  ] });
  test('calcTripItineraryTotal = Σ per-person × all members', () => {
    expect(calcTripItineraryTotal(t)).toBe(105); // 35 × 3 members
  });
  test('calcDayCostForTrip / calcDayPerPersonCost', () => {
    expect(calcDayCostForTrip(t.days[0], t)).toBe(45); // 15 × 3
    expect(calcDayPerPersonCost(t.days[0])).toBe(15);
  });
  test('calcFamilyItineraryCost scales by family size', () => {
    expect(calcFamilyItineraryCost(famA, t)).toBe(70); // 2 × 35
    expect(calcFamilyItineraryCost(famB, t)).toBe(35);
    expect(calcFamilyItineraryCost(famC, t)).toBe(0);
  });
});

describe('expense totals (excluded omitted)', () => {
  const t = trip({ expenses: [
    exp({ amount: 90 }),                 // individual, 30/person
    exp({ amount: 100, excluded: true }), // ignored
  ] });
  test('calcFamilyExpenseTotal sums non-excluded shares', () => {
    expect(calcFamilyExpenseTotal(famA, t)).toBe(60);
    expect(calcFamilyExpenseTotal(famB, t)).toBe(30);
  });
  test('calcMemberExpenseShare sums non-excluded shares', () => {
    expect(calcMemberExpenseShare({ id: 'A1' }, t)).toBe(30);
  });
});

describe('balances + settlement', () => {
  test('calcBalances nets paid − owed and sums to ~0', () => {
    const t = trip({ expenses: [exp({ amount: 90, paidBy: 'A1' })] }); // A1 pays 90, each owes 30
    const balances = calcBalances(t);
    const net = Object.fromEntries(balances.map(b => [b.member.id, b.net]));
    expect(net.A1).toBe(60);
    expect(net.A2).toBe(-30);
    expect(net.B1).toBe(-30);
    expect(close(balances.reduce((s, b) => s + b.net, 0), 0)).toBe(true);
  });
  test('an expense with no one to split across is not in the ledger', () => {
    const t = trip({ expenses: [exp({ amount: 50, paidBy: 'A1', participatingFamilies: ['C'] })] });
    expect(calcBalances(t).every(b => b.net === 0)).toBe(true);
  });
  test('calcSettlements turns nets into minimal transfers', () => {
    const t = trip({ expenses: [exp({ amount: 90, paidBy: 'A1' })] });
    const s = calcSettlements(calcBalances(t));
    // A2 and B1 each owe A1 30
    expect(s).toHaveLength(2);
    s.forEach(x => { expect(x.to.id).toBe('A1'); expect(x.amount).toBe(30); });
    expect(s.map(x => x.from.id).sort()).toEqual(['A2', 'B1']);
  });
  test('calcFamilyBalances nets per family', () => {
    const t = trip({ expenses: [exp({ amount: 90, paidBy: 'A1' })] });
    const fb = Object.fromEntries(calcFamilyBalances(t).map(b => [b.family.id, b.net]));
    expect(fb.A).toBe(30);   // paid 90, owed 60
    expect(fb.B).toBe(-30);
    expect(fb.C).toBe(0);
  });
});

describe('multiple payers (paymentsOf)', () => {
  // 3 single-member families so "each owes a clean third" is obvious.
  const fX = { id: 'X', name: 'Ex',  members: [{ id: 'x1', name: 'X1' }] };
  const fY = { id: 'Y', name: 'Wy',  members: [{ id: 'y1', name: 'Y1' }] };
  const fZ = { id: 'Z', name: 'Zed', members: [{ id: 'z1', name: 'Z1' }] };
  const t3 = (exps) => ({ families: [fX, fY, fZ], splitMode: 'family', expenses: exps, days: [] });
  const dinner = (extra) => ({ id: 'd', name: 'Dinner', amount: 300, splitMode: 'family', participatingFamilies: ['X', 'Y', 'Z'], participatingMembers: null, excluded: false, ...extra });

  test('the restaurant case: 3 families split, 2 paid (cross-family) → Z owes X & Y', () => {
    // $300 ÷ 3 = $100 each owed. X & Y each fronted $150; Z's card failed.
    const exp = dinner({ paidBy: 'x1', payments: [{ memberId: 'x1', amount: 150 }, { memberId: 'y1', amount: 150 }] });
    const trip = t3([exp]);
    expect(paymentsOf(exp, trip)).toHaveLength(2);
    const net = Object.fromEntries(calcBalances(trip).map(b => [b.member.id, b.net]));
    expect(net.x1).toBe(50); expect(net.y1).toBe(50); expect(net.z1).toBe(-100);
    expect(close(Object.values(net).reduce((s, n) => s + n, 0), 0)).toBe(true);
    const s = calcSettlements(calcBalances(trip));
    expect(s).toHaveLength(2);
    s.forEach(x => { expect(x.from.id).toBe('z1'); expect(x.amount).toBe(50); });
    expect(s.map(x => x.to.id).sort()).toEqual(['x1', 'y1']);
  });

  test('two payers in the SAME family also work (per-family net is correct)', () => {
    const fam   = { id: 'A', name: 'Aye', members: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }] };
    const famB2 = { id: 'B', name: 'Bee', members: [{ id: 'b1', name: 'B1' }] };
    // individual $90 → 3 members owe $30 each; A1 & A2 (same family) each fronted $45.
    const exp = { id: 'e', name: 'Dinner', amount: 90, participatingFamilies: ['A', 'B'], participatingMembers: null, excluded: false, paidBy: 'a1', payments: [{ memberId: 'a1', amount: 45 }, { memberId: 'a2', amount: 45 }] };
    const trip = { families: [fam, famB2], splitMode: 'individual', expenses: [exp], days: [] };
    const fb = Object.fromEntries(calcFamilyBalances(trip).map(b => [b.family.id, b.net]));
    expect(fb.A).toBe(30);   // paid 90, owed 60
    expect(fb.B).toBe(-30);
  });

  test('unbalanced payments → safe fallback to the single payer (no leak)', () => {
    const exp = dinner({ paidBy: 'x1', payments: [{ memberId: 'x1', amount: 10 }] }); // 10 ≠ 300
    const trip = t3([exp]);
    expect(paymentsOf(exp, trip)).toEqual([{ memberId: 'x1', amount: 300 }]);
    expect(close(calcBalances(trip).reduce((s, b) => s + b.net, 0), 0)).toBe(true);
  });

  test('a payment by a non-member is ignored → fallback (no leak)', () => {
    const exp = dinner({ paidBy: 'x1', payments: [{ memberId: 'ghost', amount: 300 }] });
    expect(paymentsOf(exp, t3([exp]))).toEqual([{ memberId: 'x1', amount: 300 }]);
  });

  test('single-payer expense is unchanged (no payments → paidBy carries it)', () => {
    const exp = dinner({ paidBy: 'x1' });
    expect(paymentsOf(exp, t3([exp]))).toEqual([{ memberId: 'x1', amount: 300 }]);
  });
});
