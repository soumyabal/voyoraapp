/**
 * expenses.js — pure helpers that turn costed itinerary activities into
 * per-family Splitwise expenses. Extracted from the store so the MONEY path
 * (the moat) is unit-testable without the Zustand/AsyncStorage machinery.
 *
 * Invariants (see AGENTS.md):
 *  - costPerPerson is per-person → amount = costPerPerson × member count.
 *  - estimatedAmount is FROZEN at creation (only `amount` is ever updated).
 *  - participatingFamilies = ALL families (the per-family split is the default).
 */
import { uid, getAllMembers } from './helpers';

const CAT = { food: '🍽️', transport: '✈️', stay: '🏨' };
const catFor = type => CAT[type] || '🎯';

/** Build ONE expense from a costed activity. */
export function activityToExpense(act, dayLabel, allMembers, allFamilyIds) {
  const amount = parseFloat((act.costPerPerson * allMembers.length).toFixed(2));
  return {
    id: uid(),
    name: `${act.name} (${dayLabel})`,
    amount,
    estimatedAmount: amount,          // frozen reference to the original estimate
    category: catFor(act.type),
    paidBy: allMembers[0]?.id ?? null,
    // Lodging splits EQUALLY BY FAMILY (a shared hotel is a per-group cost, and the
    // app can't infer who took the bigger/pricier room → the Split tab's custom
    // amounts handle that). Everything else inherits the trip's split mode.
    splitMode: act.type === 'stay' ? 'family' : null,
    participatingFamilies: [...allFamilyIds],
    participatingMembers: null,       // null = all members in participating families
    excluded: false,
    source: 'itinerary',
    activityId: act.id,               // link for live sync
  };
}

/**
 * Presentational rollup for the Splitwise tab: split a trip's expenses into itinerary vs
 * manual, included vs skipped, and sum the included amounts. PURE — this is display glue, not
 * the split/settlement math (that lives in costs.js and stays untouched). `amount` is summed
 * as-is; excluded expenses are omitted from every total.
 */
export function summariseExpenses(trip) {
  const all = trip.expenses || [];
  const itinExpenses = all.filter(e => e.source === 'itinerary');
  const manualExpenses = all.filter(e => e.source === 'manual');
  const itinIncluded = itinExpenses.filter(e => !e.excluded);
  const itinSkipped = itinExpenses.filter(e => e.excluded);
  const sum = list => list.reduce((s, e) => s + e.amount, 0);
  return {
    itinExpenses,
    manualExpenses,
    itinIncluded,
    itinSkipped,
    itinTotal: sum(itinIncluded),
    manualTotal: sum(manualExpenses.filter(e => !e.excluded)),
    grandTotal: sum(all.filter(e => !e.excluded)),
  };
}

/**
 * Past activities that have a (non-excluded) itinerary expense in the split but were never
 * checked off — i.e. money that will be divided for something we can't confirm happened.
 * Surfaced ONLY on the Split tab (so non-split users never see it). TIME-AWARE: only events
 * whose end has passed `now` (ms) — never future ones. Pure: the caller passes `now` so it
 * stays testable. 'skipped' is excluded (already decided), 'done' is confirmed.
 * Returns [{ activity, expense, dayIndex, dayLabel }].
 */
export function unconfirmedSplitItems(trip, now) {
  if (now == null) return [];
  const linked = new Map();
  (trip.expenses || [])
    .filter(e => e.source === 'itinerary' && e.activityId && !e.excluded)
    .forEach(e => linked.set(e.activityId, e));
  if (linked.size === 0) return [];
  const out = [];
  (trip.days || []).forEach((day, i) => {
    (day.activities || []).forEach(act => {
      if (act.status === 'done' || act.status === 'skipped') return;
      const expense = linked.get(act.id);
      if (!expense) return;
      // Event end = start time + its duration (or end-of-day when it has no time). Only
      // flag once it's actually over — no nagging about things that haven't happened yet.
      const end = new Date(`${day.date}T${act.time || '23:59'}:00`);
      if (act.time) end.setMinutes(end.getMinutes() + (act.durationMins || 0));
      if (Number.isNaN(end.getTime()) || end.getTime() > now) return;
      out.push({ activity: act, expense, dayIndex: i, dayLabel: day.label });
    });
  });
  return out;
}

/**
 * Every itinerary expense that still needs confirming, for the Split tab's tap-to-resolve:
 * its linked activity is unchecked (not done/skipped), OR the link is ORPHANED (the activity
 * was edited/deleted so the id no longer matches). Unlike unconfirmedSplitItems this has NO
 * time gate — so a future-but-unchecked item, an orphan, and a duplicate-linked item are ALL
 * actionable, not just past ones (fixes "the middle row had no Tap-to-resolve"). The money
 * auto-exclusion stays time-gated in withUnconfirmedExcluded — this only drives the UI
 * affordance. Pure. Returns [{ expense, activity|null, dayIndex, dayLabel }] (activity null =
 * orphaned link). The caller uses unconfirmedSplitItems to tell which of these are ALSO
 * past-and-excluded (different copy) vs unchecked-but-still-counted.
 */
export function pendingSplitItems(trip) {
  const actIndex = new Map();
  (trip.days || []).forEach((day, i) => {
    (day.activities || []).forEach(act => {
      if (!actIndex.has(act.id)) actIndex.set(act.id, { act, dayIndex: i, dayLabel: day.label });
    });
  });
  const out = [];
  (trip.expenses || [])
    .filter(e => e.source === 'itinerary' && e.activityId && !e.excluded)
    .forEach(e => {
      const hit = actIndex.get(e.activityId);
      // Confirmed (done) or already decided (skipped) → nothing to resolve.
      if (hit && (hit.act.status === 'done' || hit.act.status === 'skipped')) return;
      out.push({
        expense: e,
        activity: hit?.act || null,
        dayIndex: hit?.dayIndex ?? -1,
        dayLabel: hit?.dayLabel || '',
      });
    });
  return out;
}

/**
 * A SPLIT-tab VIEW of the trip in which past, unchecked itinerary items are treated as
 * excluded — so the money math (balances / settlement / totals) doesn't divide spend we
 * can't confirm happened, until the user checks it off. PURE + clock-injected (`now` ms):
 * the split engine stays deterministic (no clock inside costs.js); the time-awareness lives
 * at the caller. Returns the SAME trip object when nothing is unconfirmed (no needless clone).
 * The stored trip is never mutated — checking an item off (status:'done') restores it to the
 * split automatically next render.
 */
export function withUnconfirmedExcluded(trip, now) {
  const unconfirmed = unconfirmedSplitItems(trip, now);
  if (!unconfirmed.length) return trip;
  const ids = new Set(unconfirmed.map(u => u.expense.id));
  return {
    ...trip,
    expenses: (trip.expenses || []).map(e => (ids.has(e.id) ? { ...e, excluded: true } : e)),
  };
}

/** Rebuild a trip's itinerary expenses from its costed activities. Manual
 *  expenses (source !== 'itinerary') are preserved. */
export function rebuildItineraryExpenses(t) {
  const allMembers = getAllMembers(t);
  const allFamilyIds = (t.families || []).map(f => f.id);
  const itin = [];
  (t.days || []).forEach(day => {
    (day.activities || []).filter(a => a.costPerPerson > 0).forEach(act => {
      itin.push(activityToExpense(act, day.label || 'Day', allMembers, allFamilyIds));
    });
  });
  const manual = (t.expenses || []).filter(e => e.source !== 'itinerary');
  return [...manual, ...itin];
}
