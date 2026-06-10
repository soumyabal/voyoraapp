/**
 * shellUpdates.js — pure lifecycle "reminder" cards for the new-shell Updates feed.
 *
 * Date-based and deterministic (explicit nowMs), so it's unit-testable without the timezone
 * machinery the per-day expense-log nudge needs (that one stays in the screen, via the already-
 * tested dayNeedsExpenseLog). Two kinds, aligned with the plan→split→remember lifecycle:
 *   • settle  — a trip that ENDED (and isn't archived) with real expenses → nudge to settle up
 *   • starting — an UPCOMING trip within 3 days → nudge to review the plan
 * Each card = { key, emoji, title, sub, tripId }; the screen renders them and opens the trip on tap.
 */
import { classifyTrip } from './tripGrouping';

export function buildUpdates(trips, nowMs) {
  const out = [];
  for (const t of trips || []) {
    const st = classifyTrip(t, nowMs);

    // post-trip settle-up: ended, not archived, has at least one real (non-excluded, >0) expense
    const hasSpend = (t.expenses || []).some((e) => !e.excluded && Number(e.amount) > 0);
    if (st.phase === 'past' && !t.archived && hasSpend) {
      out.push({ key: `settle-${t.id}`, emoji: '💸', title: 'Settle up', sub: `${t.name} ended · review who owes what`, tripId: t.id });
    }

    // starting soon: upcoming within 3 days
    if (st.phase === 'upcoming' && st.days != null && st.days <= 3) {
      out.push({ key: `start-${t.id}`, emoji: '🧳', title: `${t.name} · ${st.label.toLowerCase()}`, sub: 'Review the plan before you go', tripId: t.id });
    }
  }
  return out;
}
