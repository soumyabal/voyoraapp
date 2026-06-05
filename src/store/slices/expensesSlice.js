/**
 * expensesSlice — Splitwise / expense actions (the money path).
 *
 * Part of the Zustand slices split: this is a `(set, get) => ({...actions})`
 * factory spread into the single persisted store in ../index.js. `set`/`get`
 * operate on the FULL merged store, so behaviour is identical to when these
 * actions lived inline. No own state — all expense data lives on trip.expenses.
 *
 * Gated by: splitEngine.regression, splitDelete.regression, storeActions,
 * store.test (the moat/settlement assertions).
 */
import { uid, getAllMembers } from '../../utils/helpers';

export const createExpensesSlice = (set, get) => ({
  addExpense: (tripId, expense) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t, expenses: [...t.expenses, { ...expense, id: uid() }],
    }),
  })),

  deleteExpense: (tripId, expId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t, expenses: t.expenses.filter(e => e.id !== expId),
    }),
  })),

  toggleFamilySplit: (tripId, expId, famId, checked) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      return {
        ...t,
        expenses: t.expenses.map(e => {
          if (e.id !== expId) return e;
          let pf = e.participatingFamilies ? [...e.participatingFamilies] : t.families.map(f => f.id);
          if (checked) { if (!pf.includes(famId)) pf.push(famId); }
          else { pf = pf.filter(id => id !== famId); }
          if (!pf.length) pf = [famId]; // enforce at-least-one
          return { ...e, participatingFamilies: pf };
        }),
      };
    }),
  })),

  updateExpensePayer: (tripId, expId, memberId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      return {
        ...t,
        expenses: t.expenses.map(e => {
          if (e.id !== expId) return e;
          const payerFam = t.families.find(f => f.members.some(m => m.id === memberId));
          let pf = e.participatingFamilies ? [...e.participatingFamilies] : t.families.map(f => f.id);
          if (payerFam && !pf.includes(payerFam.id)) pf.push(payerFam.id);
          return { ...e, paidBy: memberId, participatingFamilies: pf };
        }),
      };
    }),
  })),

  // ── SPLIT MODE ──────────────────────────────────────────────

  setTripSplitMode: (tripId, mode) => set(s => ({
    trips: s.trips.map(t => t.id === tripId ? { ...t, splitMode: mode } : t),
  })),

  updateExpenseSplitMode: (tripId, expId, mode) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      expenses: t.expenses.map(e => e.id !== expId ? e : { ...e, splitMode: mode }),
    }),
  })),

  // Toggle individual member in/out of an expense (individual mode)
  toggleExpenseMember: (tripId, expId, memberId, included) => set(s => {
    const trip = s.trips.find(t => t.id === tripId);
    const allMemberIds = trip ? getAllMembers(trip).map(m => m.id) : [];
    return {
      trips: s.trips.map(t => t.id !== tripId ? t : {
        ...t,
        expenses: t.expenses.map(e => {
          if (e.id !== expId) return e;
          const current = e.participatingMembers ?? allMemberIds;
          const next = included
            ? (current.includes(memberId) ? current : [...current, memberId])
            : current.filter(id => id !== memberId);
          // Enforce at-least-one participant
          return { ...e, participatingMembers: next.length ? next : current };
        }),
      }),
    };
  }),

  toggleExpenseExcluded: (tripId, expId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      expenses: t.expenses.map(e => e.id !== expId ? e : { ...e, excluded: !e.excluded }),
    }),
  })),

  updateExpenseAmount: (tripId, expId, amount) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      expenses: t.expenses.map(e => e.id !== expId ? e : { ...e, amount }),
    }),
  })),

  // Toggle a settlement transfer as paid/unpaid.
  // Key: `${fromId}→${toId}` — stable per trip since settlements are deterministic.
  toggleSettlementPaid: (tripId, key) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const settled = new Set(t.settledTransfers || []);
      if (settled.has(key)) settled.delete(key); else settled.add(key);
      return { ...t, settledTransfers: [...settled] };
    }),
  })),

  updateExpenseCustomShares: (tripId, expId, customShares, unevenSplit) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      expenses: t.expenses.map(e => e.id !== expId ? e : {
        ...e,
        unevenSplit: unevenSplit !== undefined ? unevenSplit : e.unevenSplit,
        customShares: customShares !== undefined ? customShares : e.customShares,
      }),
    }),
  })),

  pushItineraryToSplitwise: (tripId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const allMembers = getAllMembers(t);
      const allFamilyIds = t.families.map(f => f.id);
      const payer = allMembers[0]?.id;
      const itinExpenses = [];
      t.days.forEach(day => {
        day.activities.filter(a => a.costPerPerson > 0).forEach(act => {
          const cat = act.type === 'food' ? '🍽️' : act.type === 'transport' ? '✈️' : act.type === 'stay' ? '🏨' : '🎯';
          const estimatedAmount = act.costPerPerson * allMembers.length;
          itinExpenses.push({
            id: uid(),
            name: `${act.name} (${day.label})`,
            amount: estimatedAmount,
            estimatedAmount,              // immutable reference to original estimate
            category: cat, paidBy: payer,
            splitMode: null,              // inherit from trip
            participatingFamilies: [...allFamilyIds],
            participatingMembers: null,   // null = all in participating families
            excluded: false,              // user can soft-hide from split
            source: 'itinerary',
            activityId: act.id,           // ← link for live sync
          });
        });
      });
      const manualExpenses = t.expenses.filter(e => e.source !== 'itinerary');
      return { ...t, expenses: [...manualExpenses, ...itinExpenses], itineraryPushed: true };
    }),
  })),

  clearPushedItinerary: (tripId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      expenses: t.expenses.filter(e => e.source !== 'itinerary'),
      itineraryPushed: false,
    }),
  })),
});
