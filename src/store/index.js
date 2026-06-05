import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sampleTrips, sampleTravelers, sampleGroups } from '../data/sampleData';
import { uid, TRIP_EMOJIS, TRIP_BG_COLORS, familyPalette, defaultDayFor } from '../utils/helpers';
import { createExpensesSlice } from './slices/expensesSlice';
import { createActivitiesSlice } from './slices/activitiesSlice';
import { createPeopleSlice } from './slices/peopleSlice';

// Toast reference (set by Toast component)
let _showToast = null;
export const setToastRef = fn => { _showToast = fn; };
export const showToast = (msg, icon = '✅') => _showToast && _showToast(msg, icon);

const useStore = create(
  persist(
    (set, get) => ({
      // ── SLICES (see src/store/slices/) ──────────────────────
      // Spread first; each is a (set, get) => ({...}) factory operating on the
      // full merged store. Behaviour is identical to inline definitions.
      ...createExpensesSlice(set, get),
      ...createActivitiesSlice(set, get),
      ...createPeopleSlice(set, get),

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
      planDayNoteSeen: false,   // one-time "Plan my day" education shown yet?

      // ── GETTERS (computed) ──────────────────────────────────
      getCurrentTrip: () => {
        const { trips, currentTripId } = get();
        return trips.find(t => t.id === currentTripId) || null;
      },

      // ── NAVIGATION ──────────────────────────────────────────
      // Land on the phase-correct day: upcoming/past → Day 1; active → today's day
      // (never a stale "Day 2" before the trip has started).
      setCurrentTrip: (tripId) => set((s) => {
        const trip = s.trips.find((t) => t.id === tripId);
        return { currentTripId: tripId, currentDay: trip ? defaultDayFor(trip) : 0 };
      }),
      setCurrentDay: (day) => set({ currentDay: day }),
      setPlanMode: (mode) => set({ planMode: mode }),
      markPlanDayNoteSeen: () => set({ planDayNoteSeen: true }),

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

      // ── NIGHT PLAN (hotel-less but covered) ─────────────────
      // How an un-booked night is handled, as an object:
      //   { type:'overnight_travel'|'with_friends'|'camping'|'heading_home',
      //     label?, lat?, lng? }   (or null to clear)
      // Stored per-DAY. lodgingForNight reads it so unbooked_night stops nagging,
      // and an optional address (friends/camping) anchors the next morning's drive.
      setNightPlan: (tripId, dayIndex, plan) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          days: t.days.map((d, i) => i !== dayIndex ? d : { ...d, nightPlan: plan || null }),
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

    }),
    {
      name: 'voyara-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Schema version. BUMP THIS + add a migrate case whenever the persisted
      // shape changes (the store.test.js shape guard will fail to remind you).
      // Previously there was NO version → the only way to change shape was to
      // rename the key, which WIPES every user's trips. Versioning fixes that.
      version: 5,
      // v0 (unversioned, older builds) → v1: backfill optional trip fields.
      // v1 → v2: added per-day `day.nightPlan` (hotel-less-but-covered nights).
      // v2 → v3: `day.nightPlan` widened from a STRING to { type, label?, lat?, lng? }
      // so a friends/camping night can carry an optional address that anchors the
      // next morning's drive. Old string values are wrapped to { type: <string> }.
      // v3 → v4: activities gained optional `timeLocked` (a fixed-time anchor) and stays
      // gained optional `checkInTime`/`checkOutTime`. All are read-time-defaulted (absent
      // → unlocked / the standard 15:00·11:00 hotel times), so no data backfill is needed —
      // this bump documents the shape change and keeps the version invariant honest.
      // v4 → v5: REPAIR openHours for 24/7 places. The old hours parser recorded a no-close
      // (open-24/7) Google period for SUNDAY ONLY, so a 24/7 bridge/lighthouse wrongly read
      // "Closed" Mon–Sat. Detect that exact signature and expand it to all seven days.
      migrate: (state) => {
        if (!state) return state;
        const fix247 = (oh) =>
          (Array.isArray(oh) && oh.length === 1 && oh[0] && oh[0].d === 0 && oh[0].o === 0 && oh[0].c >= 1440)
            ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, o: 0, c: 1440 }))
            : oh;
        state.trips = (state.trips || []).map((t) => ({
          seenPlaces: [],
          ignoredWarnings: [],
          origin: null,
          expenses: [],
          ...t, // existing values always win over the backfilled defaults
          days: (t.days || []).map((d) => ({
            ...d,
            nightPlan: typeof d.nightPlan === 'string' ? { type: d.nightPlan } : (d.nightPlan || undefined),
            activities: (d.activities || []).map((a) => (a.openHours ? { ...a, openHours: fix247(a.openHours) } : a)),
          })),
        }));
        return state;
      },
    }
  )
);

export default useStore;
