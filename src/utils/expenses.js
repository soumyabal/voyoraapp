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
