import { deviceTz } from '../utils/tz';

/**
 * Persisted-state migration for the Zustand `persist` store (see store/index.js).
 *
 * This is a SINGLE idempotent migration rather than a per-version chain: every step
 * here is a backfill or a repair that's safe to re-apply, so it brings ANY older
 * shape (v0…v6) forward to the current shape in one pass. The version chain it covers
 * is documented at the call site (the `version: 7` block). Extracted from the inline
 * persist config ONLY so it can be unit-tested — behaviour is byte-identical.
 *
 * Invariant #7: this runs on every shipped user's stored trips when they update the
 * app. A bug here = silent data loss. Existing values ALWAYS win over backfilled
 * defaults (the `...t` / `...d` spreads sit AFTER the defaults), so a re-run never
 * clobbers real data.
 *
 * @param {object|undefined|null} state the rehydrated persisted state
 * @returns the same state object, with trips/days/activities brought to current shape
 */
export function migratePersistedState(state) {
  if (!state) return state;
  const dz = deviceTz();
  // 24/7 openHours repair (v4→v5): the old parser recorded an open-24/7 Google period
  // for SUNDAY ONLY, so a 24/7 venue wrongly read "Closed" Mon–Sat. Detect that exact
  // signature ([{ d:0, o:0, c:>=1440 }]) and expand it to all seven days.
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
}
