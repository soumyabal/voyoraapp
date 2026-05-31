import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sampleTrips } from '../data/sampleData';
import { uid, getAllMembers, findMemberFamily, TRIP_EMOJIS, TRIP_BG_COLORS, familyPalette } from '../utils/helpers';
import { getExpSplitBetween } from '../utils/costs';

// ── Activity → Expense sync helper ─────────────────────────────────────────
function activityToExpense(act, dayLabel, allMembers, allFamilyIds) {
  const cat = act.type === 'food' ? '🍽️'
    : act.type === 'transport' ? '✈️'
    : act.type === 'stay' ? '🏨'
    : '🎯';
  const amount = parseFloat((act.costPerPerson * allMembers.length).toFixed(2));
  return {
    id: uid(),
    name: `${act.name} (${dayLabel})`,
    amount,
    estimatedAmount: amount,
    category: cat,
    paidBy: allMembers[0]?.id ?? null,
    splitMode: null,
    participatingFamilies: [...allFamilyIds],
    participatingMembers: null,
    excluded: false,
    source: 'itinerary',
    activityId: act.id,
  };
}

// Toast reference (set by Toast component)
let _showToast = null;
export const setToastRef = fn => { _showToast = fn; };
export const showToast = (msg, icon = '✅') => _showToast && _showToast(msg, icon);

const useStore = create(
  persist(
    (set, get) => ({
      // ── STATE ───────────────────────────────────────────────
      trips: sampleTrips,
      profiles: [],                  // global traveler profiles — persist across all trips
      currentTripId: null,
      currentDay: 0,
      planMode: null,
      account: { loggedIn: false, name: '', email: '', credits: 0, history: [], plan: 'free' },

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

      createTrip: ({ name, destination, startDate, endDate, mode, familyForms }) => {
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

        if (families.length === 0) {
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
          splitMode: 'individual', // 'individual' | 'family'
          bgColors: TRIP_BG_COLORS[Math.floor(Math.random() * TRIP_BG_COLORS.length)],
          itineraryPushed: false,
          families, days, expenses: [],
        };

        set(s => ({ trips: [trip, ...s.trips] }));
        return trip;
      },

      // ── ACTIVITIES ──────────────────────────────────────────
      addActivity: (tripId, dayIndex, activity) => set(s => ({
        trips: s.trips.map(t => {
          if (t.id !== tripId) return t;
          const actWithId = { ...activity, id: activity.id || uid() };
          const newDays = t.days.map((d, i) => i !== dayIndex ? d : {
            ...d, activities: [...d.activities, actWithId],
          });
          // Auto-sync: if itinerary already pushed and activity has a cost, add expense
          let newExpenses = t.expenses;
          if (t.itineraryPushed && actWithId.costPerPerson > 0) {
            const allMembers = getAllMembers({ ...t, days: newDays });
            const allFamilyIds = t.families.map(f => f.id);
            const dayLabel = t.days[dayIndex]?.label || `Day ${dayIndex + 1}`;
            newExpenses = [...t.expenses, activityToExpense(actWithId, dayLabel, allMembers, allFamilyIds)];
          }
          return { ...t, days: newDays, expenses: newExpenses };
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

      addTraveler: (tripId, famId, member) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : {
            ...f, members: [...f.members, { ...member, id: uid() }],
          }),
        }),
      })),

      updateTraveler: (tripId, famId, memberId, updates) => set(s => ({
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

      // ── TRAVELER PROFILES ────────────────────────────────────
      // Profiles are global and persist across all trips.
      // A trip member can optionally link to a profile via member.profileId.
      // One profile → many trips; one member has at most one profile link.

      createProfile: (profile) => set(s => ({
        profiles: [{ ...profile, id: uid(), createdAt: new Date().toISOString().slice(0, 10) }, ...s.profiles],
      })),

      updateProfile: (profileId, updates) => set(s => ({
        profiles: s.profiles.map(p => p.id !== profileId ? p : { ...p, ...updates }),
        // Also cascade name change into any linked trip members
        trips: updates.name
          ? s.trips.map(t => ({
              ...t,
              families: t.families.map(f => ({
                ...f,
                members: f.members.map(m => m.profileId === profileId ? { ...m, name: updates.name } : m),
              })),
            }))
          : s.trips,
      })),

      deleteProfile: (profileId) => set(s => ({
        profiles: s.profiles.filter(p => p.id !== profileId),
        // Unlink profile from any trip members (member stays, just loses the link)
        trips: s.trips.map(t => ({
          ...t,
          families: t.families.map(f => ({
            ...f,
            members: f.members.map(m => m.profileId === profileId ? { ...m, profileId: null } : m),
          })),
        })),
      })),

      // Link an existing profile to a trip member (copies profile data into member)
      linkProfileToMember: (tripId, famId, memberId, profileId) => set(s => {
        const profile = s.profiles.find(p => p.id === profileId);
        if (!profile) return s;
        return {
          trips: s.trips.map(t => t.id !== tripId ? t : {
            ...t,
            families: t.families.map(f => f.id !== famId ? f : {
              ...f,
              members: f.members.map(m => m.id !== memberId ? m : {
                ...m,
                profileId,
                name: profile.name,
                age: profile.age,
                needs: [...(profile.needs || [])],
              }),
            }),
          }),
        };
      }),

      // Add a new trip member directly from a profile
      addMemberFromProfile: (tripId, famId, profileId) => set(s => {
        const profile = s.profiles.find(p => p.id === profileId);
        if (!profile) return s;
        return {
          trips: s.trips.map(t => t.id !== tripId ? t : {
            ...t,
            families: t.families.map(f => f.id !== famId ? f : {
              ...f,
              members: [...f.members, {
                id: uid(),
                profileId,
                name: profile.name,
                age: profile.age || 30,
                needs: [...(profile.needs || [])],
              }],
            }),
          }),
        };
      }),

      // ── ACCOUNT / CREDITS ────────────────────────────────────
      signUp: (name, email) => {
        const account = {
          loggedIn: true, name, email, credits: 100,
          history: [{ date: new Date().toISOString().slice(0, 10), desc: 'Welcome bonus', delta: +100, balance: 100 }],
        };
        set({ account });
      },

      signIn: (email) => {
        const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'Traveler';
        const account = {
          loggedIn: true, name, email, credits: 100,
          history: [{ date: new Date().toISOString().slice(0, 10), desc: 'Welcome bonus', delta: +100, balance: 100 }],
        };
        set({ account });
      },

      signOut: () => set({
        account: { loggedIn: false, name: '', email: '', credits: 0, history: [] },
      }),

      deductCredits: (amount) => set(s => {
        const newCredits = Math.max(0, s.account.credits - amount);
        return {
          account: {
            ...s.account,
            credits: newCredits,
            history: [
              { date: new Date().toISOString().slice(0, 10), desc: 'AI Trip Generation', delta: -amount, balance: newCredits },
              ...s.account.history,
            ],
          },
        };
      }),

      addCredits: (amount) => set(s => {
        const newCredits = s.account.credits + amount;
        return {
          account: {
            ...s.account,
            credits: newCredits,
            history: [
              { date: new Date().toISOString().slice(0, 10), desc: `Purchased ${amount} credits`, delta: +amount, balance: newCredits },
              ...s.account.history,
            ],
          },
        };
      }),

      // Inject AI activities into a newly created trip (simulated)
      injectAIActivities: (tripId) => {
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
    }
  )
);

export default useStore;
