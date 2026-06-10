/**
 * groupStats.js — pure derivations about a saved group across the user's trips.
 *
 * A saved group is a named set of traveler IDs (the library). A trip's members each carry a
 * `travelerId` when they were added from the library. "Trips together" = trips where at least one
 * of the group's travelers appears as a member. Pure + testable; used by the new-shell Profile tab.
 */

// trips the group has actually traveled on (>=1 group traveler present as a member, matched by travelerId)
export function tripsForGroup(group, trips) {
  const ids = new Set(group?.travelerIds || []);
  if (!ids.size) return [];
  return (trips || []).filter((t) =>
    (t?.families || []).some((f) => (f?.members || []).some((m) => m?.travelerId && ids.has(m.travelerId))),
  );
}

export function tripCountForGroup(group, trips) {
  return tripsForGroup(group, trips).length;
}
