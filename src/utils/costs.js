import { getAllMembers } from './helpers';

// ── MODE RESOLUTION ──────────────────────────────────────────────

/**
 * Resolve the effective split mode for an expense.
 * exp.splitMode overrides trip.splitMode; fallback is 'individual'.
 */
export function resolveMode(exp, trip) {
  return exp.splitMode || trip.splitMode || 'individual';
}

// ── PARTICIPANT RESOLUTION ───────────────────────────────────────

/**
 * Families that participate in this expense.
 * Defaults to all trip families if not specified.
 */
export function getEffectiveFamilies(exp, trip) {
  const famIds = exp.participatingFamilies ?? trip.families.map(f => f.id);
  return trip.families.filter(f => famIds.includes(f.id));
}

/**
 * Individual members who share this expense.
 * - Family mode: all members of participating families.
 * - Individual mode: exp.participatingMembers (if set) narrows from family members;
 *   otherwise all members of participating families.
 */
export function getEffectiveMembers(exp, trip) {
  const mode = resolveMode(exp, trip);
  const effFams = getEffectiveFamilies(exp, trip);
  const famMembers = effFams.flatMap(f => f.members);

  if (mode === 'individual' && exp.participatingMembers != null) {
    return famMembers.filter(m => exp.participatingMembers.includes(m.id));
  }
  return famMembers;
}

// ── PER-UNIT SHARE ───────────────────────────────────────────────

// Only families with at least one member can CARRY a share (the head holds it).
// An empty participating family must not absorb a slice that nobody then owes,
// or the books leak. Splits divide among "paying" families only.
const payingFamilies = (fams) => fams.filter(f => f.members.length > 0);

/** Amount owed per family (family mode). */
export function expSharePerFamily(exp, trip) {
  const fams = payingFamilies(getEffectiveFamilies(exp, trip));
  return fams.length ? exp.amount / fams.length : 0;
}

/** Amount owed per person (individual mode). */
export function expSharePerPerson(exp, trip) {
  const members = getEffectiveMembers(exp, trip);
  return members.length ? exp.amount / members.length : 0;
}

// ── UNEVEN-SPLIT BALANCE GUARD ───────────────────────────────────

/**
 * Custom shares only drive settlement when they sum to the (frozen) total.
 * An in-progress or unbalanced edit safely falls back to the EVEN split, so the
 * books never leak — `calcBalances` credits the payer the full `amount`, so the
 * group's debits MUST also sum to `amount` or `calcSettlements` invents phantom
 * transfers. The "✅ Balanced" indicator in the editor tells the user when their
 * custom split has gone live.
 */
export function unevenActive(exp, trip) {
  if (!exp.unevenSplit || !exp.customShares) return false;
  const mode = resolveMode(exp, trip);
  // Count only units that can actually carry their custom amount: families with a
  // head, and members who are still participants. (A custom share pinned to an
  // empty family or a removed member can never be owed, so it must not count
  // toward "balanced" — otherwise the head-carried debits won't reach the total.)
  const units = mode === 'family'
    ? payingFamilies(getEffectiveFamilies(exp, trip))
    : getEffectiveMembers(exp, trip);
  const sum = units.reduce((s, u) => s + (exp.customShares[u.id] || 0), 0);
  return Math.abs(sum - exp.amount) < 0.01;
}

// ── FAMILY SHARE FOR ONE EXPENSE ─────────────────────────────────

/**
 * How much one family owes for a single expense.
 *   Family mode  → equal share per participating family (or custom amount if unevenSplit)
 *   Individual   → sum of each involved member's per-person share (or custom amounts)
 */
export function famExpenseShare(fam, exp, trip) {
  const effFams = getEffectiveFamilies(exp, trip);
  if (!effFams.find(f => f.id === fam.id)) return 0;

  const mode = resolveMode(exp, trip);

  // Uneven split — use stored custom amounts (only when they balance to the total)
  if (unevenActive(exp, trip)) {
    if (mode === 'family') {
      return fam.members.length ? (exp.customShares[fam.id] || 0) : 0;
    }
    // Individual uneven: sum this family's PARTICIPATING members' custom amounts
    const effMembers = getEffectiveMembers(exp, trip);
    return fam.members
      .filter(m => effMembers.some(em => em.id === m.id))
      .reduce((s, m) => s + (exp.customShares[m.id] || 0), 0);
  }

  if (mode === 'family') {
    if (!fam.members.length) return 0;
    const paying = payingFamilies(effFams);
    return paying.length ? exp.amount / paying.length : 0;
  }

  const pp = expSharePerPerson(exp, trip);
  const effMembers = getEffectiveMembers(exp, trip);
  const involved = fam.members.filter(m => effMembers.some(em => em.id === m.id));
  return involved.length * pp;
}

// ── MEMBER SHARE FOR ONE EXPENSE ─────────────────────────────────

/**
 * How much one member owes for a single expense.
 *   Family mode  → only the family head carries the family's share; others owe 0
 *   Individual   → per-person share if member is in the participant list; else 0
 *   Uneven       → uses exp.customShares[id] directly
 */
export function memberExpenseShare(member, exp, trip) {
  const mode = resolveMode(exp, trip);
  const fam = trip.families.find(f => f.members.some(m => m.id === member.id));

  // Uneven split — use stored custom amounts (only when they balance to the total)
  if (unevenActive(exp, trip)) {
    if (mode === 'family') {
      // Only family head carries the custom family share
      const head = fam?.members[0];
      if (!head || head.id !== member.id) return 0;
      return exp.customShares[fam.id] || 0;
    }
    // Individual uneven: member's own custom amount — only if still a participant,
    // so a stale customShares entry for a removed/excluded member can't leak in.
    const effM = getEffectiveMembers(exp, trip);
    if (!effM.some(m => m.id === member.id)) return 0;
    return exp.customShares[member.id] || 0;
  }

  if (mode === 'family') {
    const head = fam?.members[0];
    if (!head || head.id !== member.id) return 0;
    return famExpenseShare(fam, exp, trip);
  }

  const effMembers = getEffectiveMembers(exp, trip);
  if (!effMembers.some(m => m.id === member.id)) return 0;
  return expSharePerPerson(exp, trip);
}

// ── ITINERARY COST CALCULATIONS ──────────────────────────────────

export function calcTripItineraryTotal(trip) {
  const n = getAllMembers(trip).length;
  return trip.days.reduce(
    (s, d) => s + d.activities.reduce((ss, a) => ss + (a.costPerPerson || 0) * n, 0),
    0,
  );
}

export function calcDayCostForTrip(day, trip) {
  const n = getAllMembers(trip).length;
  return day.activities.reduce((s, a) => s + (a.costPerPerson || 0) * n, 0);
}

export function calcDayPerPersonCost(day) {
  return day.activities.reduce((s, a) => s + (a.costPerPerson || 0), 0);
}

export function calcFamilyItineraryCost(fam, trip) {
  return fam.members.length *
    trip.days.reduce(
      (s, d) => s + d.activities.reduce((ss, a) => ss + (a.costPerPerson || 0), 0),
      0,
    );
}

// ── EXPENSE TOTALS ────────────────────────────────────────────────

export function calcFamilyExpenseTotal(fam, trip) {
  return trip.expenses.reduce((s, exp) => exp.excluded ? s : s + famExpenseShare(fam, exp, trip), 0);
}

export function calcMemberExpenseShare(member, trip) {
  return trip.expenses.reduce((s, exp) => exp.excluded ? s : s + memberExpenseShare(member, exp, trip), 0);
}

// ── BALANCE & SETTLEMENT ─────────────────────────────────────────

export function calcBalances(trip) {
  const members = getAllMembers(trip);
  const paid = {};
  const owed = {};
  members.forEach(m => { paid[m.id] = 0; owed[m.id] = 0; });

  trip.expenses.filter(exp => !exp.excluded).forEach(exp => {
    // An expense with no one to split across isn't in the ledger — crediting the
    // payer for it would invent money nobody owes (Σ net ≠ 0).
    if (getEffectiveMembers(exp, trip).length === 0) return;
    if (exp.paidBy) {
      paid[exp.paidBy] = (paid[exp.paidBy] || 0) + exp.amount;
    }
    members.forEach(m => {
      owed[m.id] = (owed[m.id] || 0) + memberExpenseShare(m, exp, trip);
    });
  });

  return members
    .map(m => ({ member: m, net: (paid[m.id] || 0) - (owed[m.id] || 0) }))
    .sort((a, b) => b.net - a.net);
}

// Per-FAMILY net position (paid − owed) — the live "who's up / who owes" tally.
// Drives the During-trip running tally banner. Sorted most-fronted first.
export function calcFamilyBalances(trip) {
  return (trip.families || [])
    .map(fam => {
      const memberIds = new Set(fam.members.map(m => m.id));
      let paid = 0, owed = 0;
      trip.expenses.filter(exp => !exp.excluded).forEach(exp => {
        if (getEffectiveMembers(exp, trip).length === 0) return;
        if (exp.paidBy && memberIds.has(exp.paidBy)) paid += exp.amount;
        fam.members.forEach(m => { owed += memberExpenseShare(m, exp, trip); });
      });
      return { family: fam, paid, owed, net: paid - owed };
    })
    .sort((a, b) => b.net - a.net);
}

export function calcSettlements(balances) {
  const credits = balances.filter(b => b.net > 0.5).map(b => ({ ...b }));
  const debts   = balances.filter(b => b.net < -0.5).map(b => ({ ...b }));
  const settlements = [];
  let i = 0, j = 0;
  while (i < credits.length && j < debts.length) {
    const c = credits[i], d = debts[j];
    const amt = Math.min(c.net, -d.net);
    settlements.push({ from: d.member, to: c.member, amount: amt });
    c.net -= amt; d.net += amt;
    if (c.net < 0.5) i++;
    if (d.net > -0.5) j++;
  }
  return settlements;
}

// ── LEGACY COMPAT ─────────────────────────────────────────────────
export const getExpSplitBetween = (exp, trip) => getEffectiveMembers(exp, trip).map(m => m.id);
export const expPerPerson = expSharePerPerson;
