import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sampleTrips, sampleTravelers, sampleGroups } from '../data/sampleData';
import { uid, TRIP_EMOJIS, TRIP_BG_COLORS, familyPalette, defaultDayFor } from '../utils/helpers';
import { createExpensesSlice } from './slices/expensesSlice';
import { createActivitiesSlice } from './slices/activitiesSlice';

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
        trips: s.trips.map(t => {
          if (t.id !== tripId) return t;
          const families = t.families.map(f => f.id !== famId ? f : {
            ...f, members: f.members.filter(m => m.id !== memberId),
          });
          // Keep the books balanced: if the removed person was a payer, the credit
          // must move to a live member or it vanishes from the ledger (Σ net ≠ 0).
          // The family's new head inherits it; if the family is now empty, the
          // first remaining member trip-wide does. Also scrub the id from any
          // participant list / custom share so it can't leak back in.
          const heir = families.find(f => f.id === famId)?.members[0]?.id
            || families.flatMap(f => f.members)[0]?.id || null;
          const expenses = t.expenses.map(e => {
            const next = { ...e };
            if (next.paidBy === memberId) next.paidBy = heir;
            if (Array.isArray(next.participatingMembers)) {
              const pm = next.participatingMembers.filter(id => id !== memberId);
              next.participatingMembers = pm.length ? pm : null;
            }
            if (next.customShares && memberId in next.customShares) {
              const cs = { ...next.customShares }; delete cs[memberId];
              next.customShares = cs;
            }
            return next;
          });
          return { ...t, families, expenses };
        }),
      })),

      updateFamily: (tripId, famId, updates) => set(s => ({
        trips: s.trips.map(t => t.id !== tripId ? t : {
          ...t,
          families: t.families.map(f => f.id !== famId ? f : { ...f, ...updates }),
        }),
      })),

      deleteFamily: (tripId, famId) => set(s => ({
        trips: s.trips.map(t => {
          if (t.id !== tripId) return t;
          const deadIds = new Set((t.families.find(f => f.id === famId)?.members || []).map(m => m.id));
          const families = t.families.filter(f => f.id !== famId);
          // Same balance rule as deleteTraveler: a payment held by anyone in the
          // removed family is re-homed to a surviving member; stale ids/shares are
          // scrubbed; an expense left with zero families is re-broadened to all
          // survivors rather than an empty list (which would silently leak).
          const heir = families.flatMap(f => f.members)[0]?.id || null;
          const expenses = t.expenses.map(e => {
            const next = { ...e };
            let pf = next.participatingFamilies
              ? next.participatingFamilies.filter(id => id !== famId)
              : null;
            if (Array.isArray(pf) && pf.length === 0) pf = families.length ? families.map(f => f.id) : null;
            next.participatingFamilies = pf;
            if (deadIds.has(next.paidBy)) next.paidBy = heir;
            if (Array.isArray(next.participatingMembers)) {
              const pm = next.participatingMembers.filter(id => !deadIds.has(id));
              next.participatingMembers = pm.length ? pm : null;
            }
            if (next.customShares) {
              const cs = { ...next.customShares };
              delete cs[famId];
              deadIds.forEach(id => delete cs[id]);
              next.customShares = cs;
            }
            return next;
          });
          return { ...t, families, expenses };
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
