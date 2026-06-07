import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sampleTrips, sampleTravelers, sampleGroups } from '../data/sampleData';
import { deviceTz } from '../utils/tz';
import { createTripsSlice } from './slices/tripsSlice';
import { createPeopleSlice } from './slices/peopleSlice';
import { createActivitiesSlice } from './slices/activitiesSlice';
import { createExpensesSlice } from './slices/expensesSlice';
import { createUiSlice } from './slices/uiSlice';

// Toast reference (set by Toast component)
let _showToast = null;
export const setToastRef = fn => { _showToast = fn; };
export const showToast = (msg, icon = '✅') => _showToast && _showToast(msg, icon);

const useStore = create(
  persist(
    (set, get) => ({
      // ── SLICES (see src/store/slices/) ──────────────────────
      // Each is a (set, get) => ({...}) factory operating on the full merged
      // store. Behaviour is identical to the former inline definitions; set/get
      // resolve against the whole store, so cross-slice get().action() works.
      ...createTripsSlice(set, get),
      ...createPeopleSlice(set, get),
      ...createActivitiesSlice(set, get),
      ...createExpensesSlice(set, get),
      ...createUiSlice(set, get),

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
      // distanceCheckEnabled: user-facing toggle (default off — has API cost).
      // Separate from RELEASE_FLAGS.distanceWarnings which is the dev master switch.
      preferences: { distanceCheckEnabled: false },
    }),
    {
      name: 'voyara-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Schema version. BUMP THIS + add a migrate case whenever the persisted
      // shape changes (the store.test.js shape guard will fail to remind you).
      // Previously there was NO version → the only way to change shape was to
      // rename the key, which WIPES every user's trips. Versioning fixes that.
      version: 7,
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
      // v5 → v6: TIMEZONES (docs/timezone-model.md) — trips gain homeTz + defaultTz (backfilled
      // to the device zone; days inherit via day.tz which stays absent until set). Additive +
      // read-time-resolved (tzForDay), so no behaviour change for single-zone trips.
      // v6 → v7: Smart Packing List — trips gain `packing` ({} check-state map). Additive; the
      // suggestions are derived (buildPackingList), only ticks persist.
      migrate: (state) => {
        if (!state) return state;
        const dz = deviceTz();
        const fix247 = (oh) =>
          (Array.isArray(oh) && oh.length === 1 && oh[0] && oh[0].d === 0 && oh[0].o === 0 && oh[0].c >= 1440)
            ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, o: 0, c: 1440 }))
            : oh;
        state.trips = (state.trips || []).map((t) => ({
          seenPlaces: [],
          ignoredWarnings: [],
          origin: null,
          expenses: [],
          homeTz: dz,
          defaultTz: dz,
          packing: {},
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
