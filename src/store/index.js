import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sampleTrips, sampleTravelers, sampleGroups } from '../data/sampleData';
import { uid, getAllMembers, findMemberFamily, TRIP_EMOJIS, TRIP_BG_COLORS, familyPalette } from '../utils/helpers';
import { getExpSplitBetween } from '../utils/costs';
import { activityToExpense, rebuildItineraryExpenses } from '../utils/expenses';
import { generateSmartItinerary as planSmartItinerary } from '../utils/itineraryPlanner';

// Toast reference (set by Toast component)
let _showToast = null;
export const setToastRef = fn => { _showToast = fn; };
export const showToast = (msg, icon = '✅') => _showToast && _showToast(msg, icon);

const useStore = create(
  persist(
    (set, get) => ({
      // ── STATE ───────────────────────────────────────────────
      trips: sampleTrips,
      travelers: sampleTravelers,    // global traveler library — unique people
      groups: sampleGroups,          // reusable named collections of travelers
      chatHistory: {},               // { [tripId]: [{ id, role, content, ts }] }
      currentTripId: null,
      currentDay: 0,
      planMode: null,
      account: { loggedIn: false, name: '', email: '', aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
      subscription: { plan: 'free', aiMessagesUsed: 0, upgradedAt: null },

      // ── GETTERS (computed) ──────────────────────────────────
      getCurrentTrip: () => {
        const { trips, currentTripId } = get();
        return trips.find(t => t.id === currentTripId) || null;
      },

      // ── NAVIGATION ──────────────────────────────────────────
      setCurrentTrip: (tripId) => set({ currentTripId: tripId, currentDay: 0 }),
      setCurrentDay: (day) => set({ currentDay: day }),
      setPlanMode: (mode) => set({ planMode: mode }),

      // ── TRIPS ───────────────────────────────────────────────
      addTrip: (trip) => set(s => ({ trips: [trip, ...s.trips] })),

      deleteTrip: (tripId) => set(s => ({
        trips: s.trips.filter(t => t.id !== tripId),
        currentTripId: s.currentTripId === tripId ? null : s.currentTripId,
      })),

      updateTrip: (tripId, updates) => set(s => ({
        trips: s.trips.map(t => t.id === tripId ? { ...t, ...updates } : t),
      })),

      duplicateTrip: (tripId) => set(s => {
        const orig = s.trips.find(t => t.id === tripId);
        if (!orig) return s;
        const newTrip = {
          ...orig,
          id: uid(),
          name: `Copy of ${orig.name}`,
          expenses: [],
          itineraryPushed: false,
          families: orig.families.map(f => ({
            ...f, id: uid(),
            members: f.members.map(m => ({ ...m, id: uid() })),
          })),
          days: orig.days.map(d => ({
            ...d,
            activities: d.activities.map(a => ({ ...a, id: uid() })),
          })),
        };
        return { trips: [newTrip, ...s.trips] };
      }),

      createTrip: ({ name, destination, startDate, endDate, mode, pace = 'moderate', budget = 'mid-range', focus = [], familyForms = [], skipDefaultFamily = false, origin = null }) => {
        const families = familyForms
          .filter(ff => ff.name || ff.members.some(m => m.name))
          .map((ff, fi) => ({
            id: uid(),
            name: ff.name || `Family ${fi + 1}`,
            color: familyPalette[fi % familyPalette.length],
            members: ff.members
              .filter(m => m.name)
              .map(m => ({ id: uid(), name: m.name, age: parseInt(m.age) || 25, needs: [] })),
          }));

        if (families.length === 0 && !skipDefaultFamily) {
          families.push({ id: uid(), name: 'My Family', color: familyPalette[0], members: [{ id: uid(), name: 'Traveler 1', age: 30, needs: [] }] });
        }
        if (families.some(f => f.members.length === 0)) {
          families.forEach(f => { if (!f.members.length) f.members.push({ id: uid(), name: 'Traveler', age: 30, needs: [] }); });
        }

        const days = [];
        for (let d = new Date(startDate + 'T00:00:00'), i = 1; d <= new Date(endDate + 'T00:00:00'); d.setDate(d.getDate() + 1), i++) {
          days.push({ label: `Day ${i}`, date: d.toISOString().slice(0, 10), activities: [] });
        }

        const trip = {
          id: uid(),
          name, destination,
          emoji: TRIP_EMOJIS[Math.floor(Math.random() * TRIP_EMOJIS.length)],
          startDate, endDate, mode,
          pace, budget, focus,
          splitMode: 'individual', // 'individual' | 'family'
          bgColors: TRIP_BG_COLORS[Math.floor(Math.random() * TRIP_BG_COLORS.length)],
          itineraryPushed: false,
          families, days, expenses: [],
          seenPlaces: [],   // Discover places opened on the web (persisted)
          // Where Day 1 begins (arrival airport / hotel / home) → anchors the
          // first stop's travel leg + auto-arrange. { label, lat, lng } | null.
          origin: origin && origin.label ? origin : null,
        };

        set(s => ({ trips: [trip, ...s.trips] }));
        return trip;
      },

      // Mark a Discover place as "seen" (opened on the web) — persisted per trip so
      // it stays greyed/de-emphasised across sessions, not just the current one.
      markPlaceSeen: (tripId, name) => set(s => ({
        trips: s.trips.map(t => {
          if (t.id !== tripId || !name) return t;
          const seen = t.seenPlaces || [];
          return seen.includes(name) ? t : { ...t, seenPlaces: [...seen, name] };
        }),
      })),

      // Clear all "seen on web" marks for a trip — a fresh browse.
      clearSeenPlaces: (tripId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : { ...t, seenPlaces: [] }),
      })),

      // ── DISTANCE CACHE ──────────────────────────────────────
      updateDistanceCache: (tripId, cache) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : { ...t, distanceCache: cache }),
      })),

      clearDistanceCache: (tripId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : { ...t, distanceCache: null }),
      })),

      // ── USER PREFERENCES ────────────────────────────────────
      // distanceCheckEnabled: user-facing toggle (default off — has API cost).
      // Separate from RELEASE_FLAGS.distanceWarnings which is the dev master switch.
      preferences: { distanceCheckEnabled: false },
      setDistanceCheckEnabled: (enabled) => set(s => ({
        preferences: { ...s.preferences, distanceCheckEnabled: enabled },
      })),

      // ── IGNORED WARNINGS ────────────────────────────────────
      // Key format: `${type}:${dayIndex ?? 'trip'}` — stable per warning type + day
      ignoreWarning: (tripId, warningKey) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          ignoredWarnings: [...new Set([...(t.ignoredWarnings || []), warningKey])],
        }),
      })),
      clearIgnoredWarnings: (tripId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          ignoredWarnings: [],
        }),
      })),

      // ── SLOT DRAG REORDER ───────────────────────────────────
      // Called when DraggableFlatList drag ends within a slot.
      // orderedIds = activity IDs in new visual order (within the slot).
      // Reassigns the slot's sorted times to match the new order.
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

      // ── FAMILIES & TRAVELERS ─────────────────────────────────
      addFamily: (tripId, { name, members }) => set(s => {
        const trip = s.trips.find(t => t.id === tripId);
        const color = familyPalette[trip ? trip.families.length % familyPalette.length : 0];
        return {
          trips: s.trips.map(t => t.id !== tripId ? t : {
            ...t,
            families: [...t.families, {
              id: uid(), name, color,
              members: members.filter(m => m.name).map(m => ({ id: uid(), name: m.name, age: parseInt(m.age) || 25, needs: [] })),
            }],
          }),
        };
      }),

      // Like addFamily but preserves full member objects (travelerId, needs, etc.)
      addFamilyFull: (tripId, { name, members, color: c, groupId, dietary, wakeTime }) => set(s => {
        const trip = s.trips.find(t => t.id === tripId);
        const color = c || familyPalette[trip ? trip.families.length % familyPalette.length : 0];
        return {
          trips: s.trips.map(t => t.id !== tripId ? t : {
            ...t,
            families: [...t.families, {
              id: uid(), name, color, groupId: groupId || null,
              dietary: dietary || [],
              wakeTime: wakeTime || 'regular',
              members: members.map(m => ({ id: uid(), ...m })),
            }],
          }),
        };
      }),

      addTraveler: (tripId, famId, member) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : {
            ...f, members: [...f.members, { ...member, id: uid() }],
          }),
        }),
      })),

      updateTripMember: (tripId, famId, memberId, updates) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : {
            ...f,
            members: f.members.map(m => m.id !== memberId ? m : { ...m, ...updates }),
          }),
        }),
      })),

      deleteTraveler: (tripId, famId, memberId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : {
            ...f, members: f.members.filter(m => m.id !== memberId),
          }),
        }),
      })),

      updateFamily: (tripId, famId, updates) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : { ...f, ...updates }),
        }),
      })),

      deleteFamily: (tripId, famId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.filter(f => f.id !== famId),
          expenses: t.expenses.map(e => ({
            ...e,
            participatingFamilies: e.participatingFamilies
              ? e.participatingFamilies.filter(id => id !== famId)
              : null,
          })),
        }),
      })),

      // ── EXPENSES ────────────────────────────────────────────
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

      // Uneven / custom split — stores per-participant amounts keyed by memberId or famId.
      // Set unevenSplit:false to revert to even splitting.
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

      // Move a member to index 0 of their family so they become the family head.
      // The head carries the family's full balance share in "By Group" split mode.
      setFamilyHead: (tripId, famId, memberId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => {
            if (f.id !== famId) return f;
            const rest = f.members.filter(m => m.id !== memberId);
            const head = f.members.find(m => m.id === memberId);
            return head ? { ...f, members: [head, ...rest] } : f;
          }),
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
          const memberIds = allMembers.map(m => m.id);
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

      // ── TRAVELER LIBRARY (global) ────────────────────────────
      // Layer 1: unique people with baseline preferences.
      // Trip members link to travelers via member.travelerId.

      createTraveler: (traveler) => set(s => ({
        travelers: [{ ...traveler, id: uid(), createdAt: new Date().toISOString().slice(0, 10) }, ...s.travelers],
      })),

      updateTraveler: (travelerId, updates) => set(s => ({
        travelers: s.travelers.map(tv => tv.id !== travelerId ? tv : { ...tv, ...updates }),
        // Cascade name change into linked trip members that haven't been overridden
        trips: updates.name
          ? s.trips.map(t => ({
              ...t,
              families: t.families.map(f => ({
                ...f,
                members: f.members.map(m =>
                  m.travelerId === travelerId && !m._nameOverride
                    ? { ...m, name: updates.name }
                    : m
                ),
              })),
            }))
          : s.trips,
      })),

      deleteTravelerFromLibrary: (travelerId) => set(s => ({
        travelers: s.travelers.filter(tv => tv.id !== travelerId),
        // Unlink from trip members (member stays, just loses the FK)
        trips: s.trips.map(t => ({
          ...t,
          families: t.families.map(f => ({
            ...f,
            members: f.members.map(m =>
              m.travelerId === travelerId ? { ...m, travelerId: null } : m
            ),
          })),
        })),
        // Remove from any groups
        groups: s.groups.map(g => ({
          ...g, travelerIds: g.travelerIds.filter(id => id !== travelerId),
        })),
      })),

      // ── GROUPS (Layer 2: reusable collections) ───────────────
      createGroup: (group) => set(s => ({
        groups: [{ ...group, id: uid() }, ...s.groups],
      })),

      updateGroup: (groupId, updates) => set(s => ({
        groups: s.groups.map(g => g.id !== groupId ? g : { ...g, ...updates }),
      })),

      deleteGroup: (groupId) => set(s => ({
        groups: s.groups.filter(g => g.id !== groupId),
        // Unlink group from any trip families
        trips: s.trips.map(t => ({
          ...t,
          families: t.families.map(f =>
            f.groupId === groupId ? { ...f, groupId: null } : f
          ),
        })),
      })),

      addTravelerToGroup: (groupId, travelerId) => set(s => ({
        groups: s.groups.map(g =>
          g.id !== groupId || g.travelerIds.includes(travelerId)
            ? g
            : { ...g, travelerIds: [...g.travelerIds, travelerId] }
        ),
      })),

      removeTravelerFromGroup: (groupId, travelerId) => set(s => ({
        groups: s.groups.map(g =>
          g.id !== groupId ? g : { ...g, travelerIds: g.travelerIds.filter(id => id !== travelerId) }
        ),
      })),

      // ── ADD GROUP TO TRIP (Layer 3) ──────────────────────────
      // Creates a trip family from a saved group, only including selectedTravelerIds.
      addGroupToTrip: (tripId, groupId, selectedTravelerIds) => set(s => {
        const group = s.groups.find(g => g.id === groupId);
        if (!group) return s;
        const trip = s.trips.find(t => t.id === tripId);
        if (!trip) return s;

        const members = selectedTravelerIds
          .map(tvId => s.travelers.find(tv => tv.id === tvId))
          .filter(Boolean)
          .map(tv => ({
            id: uid(),
            travelerId: tv.id,
            name: tv.name,
            age: tv.age || 25,
            needs: [...(tv.needs || [])],
          }));

        const newFamily = {
          id: uid(),
          groupId,
          name: group.name,
          color: group.color,
          members,
        };

        return {
          trips: s.trips.map(t => t.id !== tripId ? t : {
            ...t, families: [...t.families, newFamily],
          }),
        };
      }),

      // ── TRIP-SPECIFIC MEMBER OVERRIDES ───────────────────────
      // Sparse overrides let a traveler's preferences differ per trip
      // without mutating their global record.
      setMemberOverride: (tripId, famId, memberId, overrides) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : {
            ...f,
            members: f.members.map(m => m.id !== memberId ? m : {
              ...m,
              ...overrides,
              _nameOverride: overrides.name !== undefined ? true : m._nameOverride,
            }),
          }),
        }),
      })),

      // ── ACCOUNT ───────────────────────────────────────────────
      signUp: (name, email) => {
        set({
          account: { loggedIn: true, name, email, aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
        });
      },

      signIn: (email) => {
        const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'Traveler';
        set({
          account: { loggedIn: true, name, email, aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
        });
      },

      signOut: () => set({
        account: { loggedIn: false, name: '', email: '', aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
      }),

      // Use the 1 free AI trip plan (called when creating a trip with AI mode)
      useAIPlannerCredit: () => set(s => ({
        account: { ...s.account, aiPlannerUsed: true },
      })),

      // Use one of the 3 free AI trip reviews (called when opening AI chat for a trip)
      useAIReview: () => set(s => ({
        account: { ...s.account, aiReviewsUsed: Math.min(s.account.aiReviewsUsed + 1, 99) },
      })),

      // ── SUBSCRIPTION ────────────────────────────────────────
      upgradeToPro: () => set(s => ({
        subscription: { ...s.subscription, plan: 'pro', upgradedAt: new Date().toISOString() },
        account: { ...s.account, plan: 'pro' },
      })),

      useFreeAIMessage: () => set(s => ({
        subscription: { ...s.subscription, aiMessagesUsed: s.subscription.aiMessagesUsed + 1 },
      })),

      resetToFree: () => set(s => ({
        subscription: { plan: 'free', aiMessagesUsed: 0, upgradedAt: null },
        account: { ...s.account, plan: 'free', aiPlannerUsed: false, aiReviewsUsed: 0 },
      })),

      // ── CHAT HISTORY ─────────────────────────────────────────
      addChatMessage: (tripId, message) => set(s => {
        const prev = s.chatHistory[tripId] || [];
        return { chatHistory: { ...s.chatHistory, [tripId]: [...prev, message] } };
      }),

      clearChatHistory: (tripId) => set(s => {
        const next = { ...s.chatHistory };
        delete next[tripId];
        return { chatHistory: next };
      }),

      // Auto-save a draft plan while the user is reviewing it in AIPlannerModal.
      // Survives modal close — cleared on Apply or explicit Discard.
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
    }),
    {
      name: 'voyara-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Schema version. BUMP THIS + add a migrate case whenever the persisted
      // shape changes (the store.test.js shape guard will fail to remind you).
      // Previously there was NO version → the only way to change shape was to
      // rename the key, which WIPES every user's trips. Versioning fixes that.
      version: 1,
      // v0 (unversioned, older builds) → v1: backfill optional trip fields added
      // over time so an old saved blob rehydrates without missing-field surprises.
      migrate: (state) => {
        if (!state) return state;
        state.trips = (state.trips || []).map((t) => ({
          seenPlaces: [],
          ignoredWarnings: [],
          origin: null,
          expenses: [],
          ...t, // existing values always win over the backfilled defaults
        }));
        return state;
      },
    }
  )
);

export default useStore;
