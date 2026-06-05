/**
 * activitiesSlice — itinerary activity CRUD, scheduling, drafts, and AI injection.
 *
 * Part of the Zustand slices split: a `(set, get) => ({...actions})` factory
 * spread into the single persisted store in ../index.js. set/get operate on the
 * FULL merged store, so behaviour is identical to the former inline definitions.
 * No own state — all activity data lives on trip.days[].activities.
 *
 * Gated by: storeActions (update/delete/move/skip/arrange/plan cascades),
 * store.test (addActivity auto-fund).
 */
import { uid, getAllMembers } from '../../utils/helpers';
import { activityToExpense, rebuildItineraryExpenses } from '../../utils/expenses';
import { generateSmartItinerary as planSmartItinerary } from '../../utils/itineraryPlanner';

export const createActivitiesSlice = (set, get) => ({
  // Replace a whole day's activities (used by per-day Auto-arrange + its undo).
  setDayActivities: (tripId, dayIndex, activities) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      days: t.days.map((d, i) => i === dayIndex ? { ...d, activities } : d),
    }),
  })),

  // Clear ONE day's activities and re-sync its itinerary expenses (manual kept).
  resetDayActivities: (tripId, dayIndex) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const days = t.days.map((d, i) => i === dayIndex ? { ...d, activities: [] } : d);
      const expenses = t.itineraryPushed ? rebuildItineraryExpenses({ ...t, days }) : t.expenses;
      return { ...t, days, expenses };
    }),
  })),

  // Wipe ALL activities — a fresh slate to plan from. Manual expenses are kept;
  // itinerary expenses, budget, and the pushed flag reset.
  resetAllActivities: (tripId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const days = t.days.map(d => ({ ...d, activities: [] }));
      const expenses = (t.expenses || []).filter(e => e.source !== 'itinerary');
      return { ...t, days, expenses, itineraryPushed: false, budgetByFamily: [] };
    }),
  })),

  // Restore a prior {days, expenses, ...} snapshot — used to undo a reset.
  restoreTripState: (tripId, snapshot) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : { ...t, ...snapshot }),
  })),

  // Set ONLY an activity's photo (backfill) — no expense/cost side-effects.
  setActivityPhoto: (tripId, actId, photo) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      days: t.days.map(d => ({ ...d, activities: d.activities.map(a => a.id === actId ? { ...a, photo } : a) })),
    }),
  })),

  reorderSlotActivities: (tripId, dayIndex, orderedIds) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      return {
        ...t,
        days: t.days.map((d, i) => {
          if (i !== dayIndex) return d;
          const actMap = Object.fromEntries(d.activities.map(a => [a.id, a]));
          // Sorted times from the dragged slot (ascending)
          const sortedTimes = orderedIds
            .map(id => actMap[id]?.time)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
          // Assign times in new drag order → re-sort will display them correctly
          const updatedActivities = d.activities.map(act => {
            const newIdx = orderedIds.indexOf(act.id);
            if (newIdx === -1) return act;
            return { ...act, time: sortedTimes[newIdx] };
          });
          return { ...d, activities: updatedActivities };
        }),
      };
    }),
  })),

  // ── ACTIVITIES ──────────────────────────────────────────
  addActivity: (tripId, dayIndex, activity) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const actWithId = { ...activity, id: activity.id || uid() };
      const newDays = t.days.map((d, i) => i !== dayIndex ? d : {
        ...d, activities: [...d.activities, actWithId],
      });
      // Costs auto-flow into Split. If already pushed, append this one
      // expense; if NOT yet pushed and this is the first costed activity,
      // auto-fund the split (rebuild from all costed activities, mark pushed)
      // so the per-family Split populates without a manual "Move" step.
      let newExpenses = t.expenses;
      let itineraryPushed = t.itineraryPushed;
      if (actWithId.costPerPerson > 0) {
        if (t.itineraryPushed) {
          const allMembers = getAllMembers({ ...t, days: newDays });
          const allFamilyIds = t.families.map(f => f.id);
          const dayLabel = t.days[dayIndex]?.label || `Day ${dayIndex + 1}`;
          newExpenses = [...t.expenses, activityToExpense(actWithId, dayLabel, allMembers, allFamilyIds)];
        } else {
          newExpenses = rebuildItineraryExpenses({ ...t, days: newDays });
          itineraryPushed = true;
        }
      }
      return { ...t, days: newDays, expenses: newExpenses, itineraryPushed };
    }),
  })),

  updateActivity: (tripId, actId, updates) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const newDays = t.days.map(d => ({
        ...d,
        activities: d.activities.map(a => a.id !== actId ? a : { ...a, ...updates }),
      }));
      if (!t.itineraryPushed) return { ...t, days: newDays };

      // Find the updated activity and its day
      const day = newDays.find(d => d.activities.some(a => a.id === actId));
      const updatedAct = day?.activities.find(a => a.id === actId);
      if (!updatedAct) return { ...t, days: newDays };

      const allMembers = getAllMembers({ ...t, days: newDays });
      const allFamilyIds = t.families.map(f => f.id);
      const hasLinkedExpense = t.expenses.some(e => e.activityId === actId);

      let newExpenses;
      if (updatedAct.costPerPerson <= 0) {
        // Cost dropped to 0 — remove linked expense
        newExpenses = t.expenses.filter(e => e.activityId !== actId);
      } else if (!hasLinkedExpense) {
        // Cost added where there was none — create expense
        newExpenses = [...t.expenses, activityToExpense(updatedAct, day.label, allMembers, allFamilyIds)];
      } else {
        // Update existing linked expense — preserve user's paidBy / participatingFamilies overrides
        const cat = updatedAct.type === 'food' ? '🍽️' : updatedAct.type === 'transport' ? '✈️' : updatedAct.type === 'stay' ? '🏨' : '🎯';
        const newAmount = parseFloat((updatedAct.costPerPerson * allMembers.length).toFixed(2));
        newExpenses = t.expenses.map(e => e.activityId !== actId ? e : {
          ...e,
          name: `${updatedAct.name} (${day.label})`,
          amount: newAmount,
          estimatedAmount: newAmount,
          category: cat,
        });
      }
      return { ...t, days: newDays, expenses: newExpenses };
    }),
  })),

  // Move an activity from one day to another, preserving all its data.
  // Also keeps Splitwise expense link intact (activityId stays the same).
  moveActivity: (tripId, fromDay, toDay, actId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const activity = t.days[fromDay]?.activities.find(a => a.id === actId);
      if (!activity || fromDay === toDay) return t;
      return {
        ...t,
        days: t.days.map((d, i) => {
          if (i === fromDay) return { ...d, activities: d.activities.filter(a => a.id !== actId) };
          if (i === toDay)   return { ...d, activities: [...d.activities, activity] };
          return d;
        }),
        // Update the linked expense name to reflect the new day label
        expenses: t.expenses.map(e =>
          e.activityId !== actId ? e : {
            ...e,
            name: e.name.replace(/\(Day \d+\)/, `(${t.days[toDay]?.label || `Day ${toDay + 1}`})`),
          }
        ),
      };
    }),
  })),

  // Move an activity up or down within its day (direction: -1 = up, +1 = down)
  reorderActivity: (tripId, dayIndex, actId, direction) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      return {
        ...t,
        days: t.days.map((d, i) => {
          if (i !== dayIndex) return d;
          const acts = [...d.activities];
          const idx  = acts.findIndex(a => a.id === actId);
          const next = idx + direction;
          if (next < 0 || next >= acts.length) return d;
          [acts[idx], acts[next]] = [acts[next], acts[idx]];
          return { ...d, activities: acts };
        }),
      };
    }),
  })),

  deleteActivity: (tripId, actId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const newDays = t.days.map(d => ({
        ...d, activities: d.activities.filter(a => a.id !== actId),
      }));
      // Auto-sync: remove linked expense when itinerary is pushed
      const newExpenses = t.itineraryPushed
        ? t.expenses.filter(e => e.activityId !== actId)
        : t.expenses;
      return { ...t, days: newDays, expenses: newExpenses };
    }),
  })),

  // Mark an activity as done / skipped / clear (null).
  // status: null | 'done' | 'skipped'
  // Side-effect: skipped activities have their linked Splitwise expense excluded.
  //              Un-skipping restores the expense (excluded → false).
  markActivityStatus: (tripId, actId, status) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const isSkipped = status === 'skipped';
      return {
        ...t,
        days: t.days.map(d => ({
          ...d,
          activities: d.activities.map(a =>
            a.id !== actId ? a : { ...a, status: status ?? null }
          ),
        })),
        // Exclude (or restore) the linked expense so skipped items
        // don't appear in Splitwise settlement calculations.
        expenses: (t.expenses || []).map(e =>
          e.activityId !== actId ? e : { ...e, excluded: isSkipped }
        ),
      };
    }),
  })),

  // Pin/unpin an exact time. A locked stop is a fixed anchor "Plan my day" never
  // moves (a booking, or a time you set). The lock pin on the card toggles this.
  toggleActivityLock: (tripId, actId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      days: t.days.map(d => ({
        ...d,
        activities: d.activities.map(a =>
          a.id !== actId ? a : { ...a, timeLocked: !a.timeLocked }
        ),
      })),
    }),
  })),

  saveDraftPlan: (tripId, dayActivities) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      draftPlan: dayActivities,
      draftPlanTs: Date.now(),
    }),
  })),

  clearDraftPlan: (tripId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      draftPlan: null,
      draftPlanTs: null,
    }),
  })),

  // Write a pre-built dayActivities array into the trip (called from AIPlannerModal).
  // If the pipeline attached ._budget, auto-populate Splitwise with per-family expenses.
  applyPlannedActivities: (tripId, dayActivities) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;

      const updatedDays = t.days.map((d, i) => ({
        ...d,
        activities: (dayActivities[i] || []).map(a => ({ ...a, id: a.id || uid() })),
      }));

      // Auto-populate Splitwise with per-family budget breakdown if available
      const budget = dayActivities._budget;
      if (budget?.expenses?.length > 0) {
        const manualExpenses = t.expenses.filter(e => e.source !== 'itinerary');
        return {
          ...t,
          days: updatedDays,
          expenses: [...manualExpenses, ...budget.expenses],
          itineraryPushed: true,
          budgetByFamily: budget.budgetByFamily || [],
          agentMeta: budget.meta || null,
        };
      }

      return { ...t, days: updatedDays };
    }),
  })),

  // Merge auto-arranged DRAFT activities into existing days (never overwrites).
  // `placements` is Activity[][] aligned to trip.days, as produced by
  // autoArrange(). Strips draft-only fields, assigns real ids, and batches
  // the Splitwise sync once (vs. looping addActivity per item).
  applyArrangedActivities: (tripId, placements) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;

      const cleanedByDay = t.days.map((_, i) =>
        (placements[i] || []).map(a => {
          const { _draftId, _source, ...rest } = a;
          return { ...rest, id: uid() };
        })
      );
      const newDays = t.days.map((d, i) =>
        cleanedByDay[i].length ? { ...d, activities: [...d.activities, ...cleanedByDay[i]] } : d
      );

      if (!t.itineraryPushed) return { ...t, days: newDays };

      // Itinerary already pushed → add linked expenses for costed activities.
      const allMembers = getAllMembers({ ...t, days: newDays });
      const allFamilyIds = t.families.map(f => f.id);
      const addedExpenses = [];
      cleanedByDay.forEach((drafts, i) => {
        const label = t.days[i]?.label || `Day ${i + 1}`;
        drafts.forEach(a => {
          if (a.costPerPerson > 0) addedExpenses.push(activityToExpense(a, label, allMembers, allFamilyIds));
        });
      });
      return { ...t, days: newDays, expenses: [...t.expenses, ...addedExpenses] };
    }),
  })),

  // Smart itinerary: calls planner for known destinations, falls back to generics
  generateSmartItinerary: (tripId) => {
    const { trips, travelers } = get();
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    const dayActivities = planSmartItinerary(trip, travelers);
    if (!dayActivities) {
      get().injectAIActivities(tripId);
      return;
    }
    set(s => ({
      trips: s.trips.map(t => t.id !== tripId ? t : {
        ...t,
        days: t.days.map((d, i) => ({
          ...d,
          activities: (dayActivities[i] || []).map(a => ({ ...a, id: a.id || uid() })),
        })),
      }),
    }));
  },

  // Inject AI activities into a newly created trip (simulated)
  injectAIActivities: (tripId) => {
    // Try smart planner first
    const { trips, travelers } = get();
    const trip = trips.find(t => t.id === tripId);
    if (trip) {
      const dayActivities = planSmartItinerary(trip, travelers);
      if (dayActivities) {
        set(s => ({
          trips: s.trips.map(t => t.id !== tripId ? t : {
            ...t,
            days: t.days.map((d, i) => ({
              ...d,
              activities: (dayActivities[i] || []).map(a => ({ ...a, id: a.id || uid() })),
            })),
          }),
        }));
        return;
      }
    }

    // Fallback: generic templates for unknown destinations
    const templates = [
      [
        { type: 'transport', time: '08:00', name: 'Airport transfer to hotel', detail: 'Private taxi or shuttle', access: 'Accessible vehicle on request', costPerPerson: 20 },
        { type: 'stay', time: '13:00', name: 'Hotel check-in', detail: 'Drop bags, freshen up', access: 'Accessible room on request', costPerPerson: 80 },
        { type: 'food', time: '14:00', name: 'Welcome lunch', detail: 'Local cuisine', access: 'Accessible entrance', costPerPerson: 18 },
        { type: 'food', time: '19:30', name: 'Dinner at recommended restaurant', detail: 'Book ahead for large groups', access: 'Accessible, elevator available', costPerPerson: 32 },
      ],
      [
        { type: 'activity', time: '09:00', name: 'Top landmark visit', detail: 'Pre-book tickets to skip queues', access: 'Wheelchair ramps, guided tours', costPerPerson: 15 },
        { type: 'food', time: '12:00', name: 'Lunch at city centre', detail: 'Local cuisine experience', access: 'Accessible, open plan', costPerPerson: 16 },
        { type: 'activity', time: '14:30', name: 'Cultural museum', detail: 'Audio guides available', access: 'Fully accessible, lifts', costPerPerson: 12 },
        { type: 'food', time: '20:00', name: 'Group dinner', detail: 'Private room for large groups', access: 'Accessible, advance booking', costPerPerson: 38 },
      ],
      [
        { type: 'activity', time: '08:30', name: 'Nature excursion / day trip', detail: 'Guided tour, transport included', access: 'Discuss mobility options with guide', costPerPerson: 60 },
        { type: 'food', time: '13:30', name: 'Scenic lunch', detail: 'Al fresco with panoramic views', access: 'Ground level outdoor seating', costPerPerson: 20 },
        { type: 'food', time: '19:00', name: 'Celebration dinner', detail: 'Special evening for the group', access: 'Accessible, private dining', costPerPerson: 50 },
      ],
    ];
    set(s => ({
      trips: s.trips.map(t => {
        if (t.id !== tripId) return t;
        return {
          ...t,
          days: t.days.map((d, i) => ({
            ...d,
            activities: templates[i % templates.length].map(a => ({ ...a, id: uid() })),
          })),
        };
      }),
    }));
  },
});
