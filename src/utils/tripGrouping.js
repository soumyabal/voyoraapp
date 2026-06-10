/**
 * tripGrouping.js — pure trip phase classification + grouping for trip lists.
 *
 * Takes an explicit `nowMs` (no hidden clock) so it's deterministic + unit-testable. Mirrors the
 * phasing HomeScreen has used inline (archived/ended → past, in-range → ongoing, else upcoming) and
 * is the source the new-shell Trips tab renders. `phase` here is trip-LEVEL only (Active/Upcoming/
 * Past for grouping) — NOT per-day live tracking, which was intentionally removed (see state doc §3).
 */
const DAY = 86400000;

// classifyTrip(trip, nowMs) → { phase: 'past'|'ongoing'|'upcoming', label, days? }
export function classifyTrip(trip, nowMs) {
  const today = new Date(nowMs); today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const start = new Date(trip.startDate + 'T00:00:00').getTime();
  const end   = new Date(trip.endDate + 'T00:00:00').getTime();

  if (trip.archived) return { phase: 'past', label: 'Completed' };
  if (t0 > end)      return { phase: 'past', label: 'Ended' };
  if (t0 >= start && t0 <= end) return { phase: 'ongoing', label: 'Happening now' };

  const days = Math.round((start - t0) / DAY);
  const label = days === 0 ? 'Starts today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  return { phase: 'upcoming', label, days };
}

// groupTrips(trips, nowMs) → { active[], upcoming[], past[], spotlight }
// Each list item is { trip, status }. Active/upcoming sort soonest-first; past sorts most-recent-first.
// spotlight = the next upcoming trip (or null), to feature at the top of a list.
export function groupTrips(trips, nowMs) {
  const withStatus = (trips || []).map((t) => ({ trip: t, status: classifyTrip(t, nowMs) }));
  const byStartAsc  = (a, b) => new Date(a.trip.startDate) - new Date(b.trip.startDate);
  const byStartDesc = (a, b) => new Date(b.trip.startDate) - new Date(a.trip.startDate);

  const active   = withStatus.filter((x) => x.status.phase === 'ongoing').sort(byStartAsc);
  const upcoming = withStatus.filter((x) => x.status.phase === 'upcoming').sort(byStartAsc);
  const past     = withStatus.filter((x) => x.status.phase === 'past').sort(byStartDesc);

  return { active, upcoming, past, spotlight: upcoming[0] || null };
}
