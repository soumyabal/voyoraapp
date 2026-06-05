/**
 * splitEngine.regression.test.js — WATERTIGHT audit of the money path (the moat).
 *
 * The whole product hinges on one law:
 *
 *   For every non-excluded expense, Σ memberExpenseShare(m) over ALL trip members
 *   === exp.amount, AND the payer is a live member.
 *
 * If that holds for every expense then calcBalances() nets to zero and
 * calcSettlements() fully resolves — nobody is over- or under-charged. These tests
 * assert that law directly across every split mode + realistic scenarios, then
 * apply the produced settlements and prove everyone lands at 0.
 */
import {
  memberExpenseShare, famExpenseShare, calcBalances, calcSettlements,
  calcFamilyBalances, unevenActive, getEffectiveMembers,
} from '../costs';
import { getAllMembers } from '../helpers';

// ── builders ───────────────────────────────────────────────────────
const M = (id, name = id, age = 30) => ({ id, name, age });
const F = (id, name, members) => ({ id, name, color: '#000', members });

// Aye(A1,A2) · Bee(B1) · Cee(C1,C2,C3) — 6 people, 3 families, heads = first member
const FAMS = () => [
  F('fA', 'Aye', [M('A1'), M('A2', 'A2', 8)]),
  F('fB', 'Bee', [M('B1')]),
  F('fC', 'Cee', [M('C1'), M('C2'), M('C3', 'C3', 6)]),
];
const trip = (expenses, splitMode = 'individual', families = FAMS()) =>
  ({ id: 't', splitMode, families, expenses, days: [] });

// ── invariant probes ───────────────────────────────────────────────
const sumShares = (exp, t) =>
  getAllMembers(t).reduce((s, m) => s + memberExpenseShare(m, exp, t), 0);

const netSum = (t) => calcBalances(t).reduce((s, b) => s + b.net, 0);

// Apply the deterministic settlements and return the worst residual |net|.
const residualAfterSettling = (t) => {
  const balances = calcBalances(t);
  const net = {};
  balances.forEach(b => { net[b.member.id] = b.net; });
  calcSettlements(balances).forEach(s => { net[s.from.id] += s.amount; net[s.to.id] -= s.amount; });
  return Math.max(0, ...Object.values(net).map(v => Math.abs(v)));
};

// ── expense factory ─────────────────────────────────────────────────
const exp = (over = {}) => ({
  id: 'e1', name: 'X', amount: 60, estimatedAmount: 60, category: '🍽️',
  paidBy: 'A1', splitMode: null, participatingFamilies: null,
  participatingMembers: null, excluded: false, ...over,
});

// ════════════════════════════════════════════════════════════════════
// 1. CONSERVATION across every mode (Σ shares === amount)
// ════════════════════════════════════════════════════════════════════
describe('conservation: Σ member shares === amount', () => {
  test('individual even — all 6 participate', () => {
    const t = trip([exp({ amount: 60 })], 'individual');
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(60, 6);
  });

  test('family even — 3 families, heads carry equal thirds', () => {
    const t = trip([exp({ amount: 60 })], 'family');
    const e = t.expenses[0];
    expect(sumShares(e, t)).toBeCloseTo(60, 6);
    expect(memberExpenseShare(M('A1'), e, t)).toBeCloseTo(20, 6); // head
    expect(memberExpenseShare(M('A2'), e, t)).toBe(0);            // non-head owes 0
  });

  test('individual, participating SUBSET of members', () => {
    const t = trip([exp({ amount: 30, participatingMembers: ['A1', 'B1', 'C1'] })], 'individual');
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(30, 6);
  });

  test('family, participating SUBSET of families', () => {
    const t = trip([exp({ amount: 40, participatingFamilies: ['fA', 'fB'] })], 'family');
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(40, 6);
  });

  test('uneven family (balanced custom shares)', () => {
    const t = trip([exp({ amount: 100, unevenSplit: true, customShares: { fA: 50, fB: 30, fC: 20 } })], 'family');
    expect(unevenActive(t.expenses[0], t)).toBe(true);
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(100, 6);
  });

  test('uneven individual (balanced custom shares)', () => {
    const cs = { A1: 20, A2: 10, B1: 25, C1: 15, C2: 20, C3: 10 }; // = 100
    const t = trip([exp({ amount: 100, unevenSplit: true, customShares: cs })], 'individual');
    expect(unevenActive(t.expenses[0], t)).toBe(true);
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(100, 6);
  });

  test('UNBALANCED custom shares fall back to even (the guard)', () => {
    const t = trip([exp({ amount: 100, unevenSplit: true, customShares: { A1: 50, B1: 30 } })], 'individual');
    expect(unevenActive(t.expenses[0], t)).toBe(false);     // 80 ≠ 100 → ignored
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(100, 6); // even split still conserves
  });

  test('non-3rd decimal amounts still conserve within a cent', () => {
    [10, 33.33, 100, 0.03, 7].forEach(a => {
      const t = trip([exp({ amount: a })], 'individual');
      expect(sumShares(t.expenses[0], t)).toBeCloseTo(a, 2);
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. SETTLEMENT fully resolves (everyone lands at 0)
// ════════════════════════════════════════════════════════════════════
describe('settlement resolves to zero', () => {
  test('payer is a participant', () => {
    const t = trip([exp({ amount: 60, paidBy: 'A1' })], 'individual');
    expect(netSum(t)).toBeCloseTo(0, 6);
    expect(residualAfterSettling(t)).toBeLessThan(0.51);
  });

  test('payer is NOT a participant (fronted money for others)', () => {
    const t = trip([exp({ amount: 30, paidBy: 'A1', participatingMembers: ['B1', 'C1', 'C2'] })], 'individual');
    expect(netSum(t)).toBeCloseTo(0, 6);
    expect(residualAfterSettling(t)).toBeLessThan(0.51);
  });

  test('family mode, mixed payer', () => {
    const t = trip([exp({ amount: 90, paidBy: 'B1' })], 'family');
    expect(netSum(t)).toBeCloseTo(0, 6);
    expect(residualAfterSettling(t)).toBeLessThan(0.51);
  });

  test('excluded expense affects nobody', () => {
    const t = trip([exp({ amount: 60, paidBy: 'A1', excluded: true })], 'individual');
    calcBalances(t).forEach(b => expect(b.net).toBe(0));
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. REALISTIC multi-expense trip (end-to-end)
// ════════════════════════════════════════════════════════════════════
describe('realistic mixed-mode trip', () => {
  test('books balance and settle across 5 expenses', () => {
    const t = trip([
      exp({ id: 'e1', amount: 60,  paidBy: 'A1', splitMode: 'individual' }),                       // group dinner
      exp({ id: 'e2', amount: 300, paidBy: 'B1', splitMode: 'family' }),                            // hotel by family
      exp({ id: 'e3', amount: 45,  paidBy: 'C1', splitMode: 'individual', participatingMembers: ['C1', 'C2', 'C3'] }), // Cee-only taxi
      exp({ id: 'e4', amount: 120, paidBy: 'A1', splitMode: 'family', unevenSplit: true, customShares: { fA: 80, fB: 20, fC: 20 } }), // uneven activity
      exp({ id: 'e5', amount: 20,  paidBy: 'C2', splitMode: 'individual', excluded: true }),        // excluded snack
    ], 'individual');

    t.expenses.filter(e => !e.excluded).forEach(e =>
      expect(sumShares(e, t)).toBeCloseTo(e.amount, 6));
    expect(netSum(t)).toBeCloseTo(0, 6);
    expect(residualAfterSettling(t)).toBeLessThan(0.51);

    // family-level tally must also net to zero
    const famNet = calcFamilyBalances(t).reduce((s, f) => s + f.net, 0);
    expect(famNet).toBeCloseTo(0, 6);
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. EDGE CASES — the places books can quietly leak
// ════════════════════════════════════════════════════════════════════
describe('edge cases', () => {
  test('individual uneven: customShares for a NON-participant must not leak', () => {
    // A1 was given a custom share, then removed from participants. The stored
    // customShares still has A1. Σ shares must equal amount, not amount + A1.
    const t = trip([exp({
      amount: 60, unevenSplit: true,
      participatingMembers: ['B1', 'C1', 'C2'],
      customShares: { B1: 20, C1: 20, C2: 20, A1: 999 },
    })], 'individual');
    if (unevenActive(t.expenses[0], t)) {
      expect(sumShares(t.expenses[0], t)).toBeCloseTo(60, 6);
    }
  });

  test('family even: an empty participating family must not swallow a share', () => {
    const fams = [...FAMS(), F('fEmpty', 'Empty', [])];
    const t = trip([exp({ amount: 80, participatingFamilies: ['fA', 'fEmpty'] })], 'family', fams);
    // Aye head should carry the FULL 80 (Empty has no head to carry its half).
    expect(sumShares(t.expenses[0], t)).toBeCloseTo(80, 6);
  });

  test('no participants → payer is not credited money nobody owes', () => {
    // Degenerate but must not invent a phantom credit.
    const t = trip([exp({ amount: 50, paidBy: 'A1', participatingMembers: [] })], 'individual');
    expect(netSum(t)).toBeCloseTo(0, 6);
  });

  test('family mode, payer is a NON-head member', () => {
    const t = trip([exp({ amount: 60, paidBy: 'C2' })], 'family'); // C1 is head, C2 pays
    expect(netSum(t)).toBeCloseTo(0, 6);
    expect(residualAfterSettling(t)).toBeLessThan(0.51);
  });

  test('payer in a family that is NOT participating (fronted for others)', () => {
    const t = trip([exp({ amount: 40, paidBy: 'A1', participatingFamilies: ['fB', 'fC'] })], 'family');
    expect(netSum(t)).toBeCloseTo(0, 6);
    expect(residualAfterSettling(t)).toBeLessThan(0.51);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. PROPERTY FUZZ — the conservation law must hold for ANY shape.
//    Seeded LCG (deterministic, reproducible — a flaky money test is worse
//    than none). Random families (incl. EMPTY ones), modes, payers, subsets,
//    uneven splits (balanced & not), exclusions. For every generated trip:
//    Σ net === 0 (to the cent) and the settlement fully resolves.
// ════════════════════════════════════════════════════════════════════
describe('property fuzz: Σ net === 0 for any trip shape', () => {
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

  const genTrip = () => {
    const nFams = int(1, 4);
    const families = [];
    let mc = 0;
    for (let i = 0; i < nFams; i++) {
      const nMem = int(0, 3); // 0 → empty family on purpose
      const members = [];
      for (let k = 0; k < nMem; k++) members.push(M(`m${i}_${k}`));
      families.push(F(`f${i}`, `Fam${i}`, members));
      mc += nMem;
    }
    const allM = families.flatMap(f => f.members);
    const allF = families.map(f => f.id);
    const tripMode = pick(['individual', 'family']);

    const expenses = [];
    const nExp = int(1, 6);
    for (let e = 0; e < nExp; e++) {
      const amount = int(1, 500);
      const mode = pick([null, 'individual', 'family']);
      const payer = allM.length ? pick(allM).id : null; // always a LIVE member
      // random participating-family subset (>=1)
      const pf = allF.filter(() => rnd() < 0.7);
      if (!pf.length) pf.push(pick(allF));
      const o = {
        id: `e${e}`, amount, estimatedAmount: amount,
        paidBy: payer, splitMode: mode, participatingFamilies: pf,
        participatingMembers: null, excluded: rnd() < 0.15,
      };
      // sometimes narrow to a member subset (individual feel)
      const partMembers = families.filter(f => pf.includes(f.id)).flatMap(f => f.members);
      if (rnd() < 0.3 && partMembers.length) {
        const sub = partMembers.filter(() => rnd() < 0.6).map(m => m.id);
        o.participatingMembers = sub.length ? sub : null;
      }
      // sometimes attach custom shares (balanced ~half the time, unbalanced otherwise)
      if (rnd() < 0.3) {
        o.unevenSplit = true;
        const units = (mode || tripMode) === 'family'
          ? families.filter(f => pf.includes(f.id) && f.members.length)
          : (o.participatingMembers
              ? partMembers.filter(m => o.participatingMembers.includes(m.id))
              : partMembers);
        o.customShares = {};
        if (units.length && rnd() < 0.5) {
          // balanced: distribute amount across units
          const each = amount / units.length;
          units.forEach((u, i) => { o.customShares[u.id] = i === units.length - 1 ? amount - each * (units.length - 1) : each; });
        } else {
          units.forEach(u => { o.customShares[u.id] = int(0, 100); }); // likely unbalanced → even fallback
        }
      }
      expenses.push(o);
    }
    return { id: 't', splitMode: tripMode, families, expenses, days: [] };
  };

  test('500 random trips all conserve and settle', () => {
    let checked = 0;
    for (let i = 0; i < 500; i++) {
      const t = genTrip();
      if (getAllMembers(t).length === 0) continue; // no people → nothing to assert
      // per-expense conservation (the non-excluded, has-participants ones)
      t.expenses.forEach(e => {
        if (e.excluded) return;
        if (getEffectiveMembers(e, t).length === 0) return;
        expect(sumShares(e, t)).toBeCloseTo(e.amount, 4);
      });
      expect(netSum(t)).toBeCloseTo(0, 4);          // the law
      expect(residualAfterSettling(t)).toBeLessThan(1.0); // settles (sub-$1 = 50¢ threshold noise)
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
  });
});
