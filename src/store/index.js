import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sampleTrips } from '../data/sampleData';
import { uid, getAllMembers, findMemberFamily, TRIP_EMOJIS, TRIP_BG_COLORS, familyPalette } from '../utils/helpers';
import { getExpSplitBetween } from '../utils/costs';

// Toast reference (set by Toast component)
let _showToast = null;
export const setToastRef = fn => { _showToast = fn; };
export const showToast = (msg, icon = '✅') => _showToast && _showToast(msg, icon);

const useStore = create(
  persist(
    (set, get) => ({
      // ── STATE ───────────────────────────────────────────────
      trips: sampleTrips,
      currentTripId: null,
      currentDay: 0,
      planMode: null,
      account: { loggedIn: false, name: '', email: '', credits: 0, history: [] },

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
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          days: t.days.map((d, i) => i !== dayIndex ? d : {
            ...d, activities: [...d.activities, { ...activity, id: uid() }],
          }),
        }),
      })),

      deleteActivity: (tripId, actId) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          days: t.days.map(d => ({ ...d, activities: d.activities.filter(a => a.id !== actId) })),
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
