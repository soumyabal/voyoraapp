/**
 * tripStatus.js — the trip "status pill" shown at the top of the itinerary.
 *
 * Pure: (trip, phase, todayIdx, todayIso) → { tone, text } | null. The screen computes the
 * date-dependent phase/todayIdx (via tripPhase/defaultDayFor) and passes today's ISO date in,
 * so this stays fully deterministic + unit-testable:
 *   upcoming → 📅 In N days / Tomorrow / Starts today (countdown to startDate)
 *   active   → 🟢 Day X of N · today
 *   past     → ✓ Trip complete
 *   anything else (e.g. undated) → null (no pill)
 */
import { daysBetweenISO } from './helpers';

export function buildStatusPill(trip, phase, todayIdx, todayIso) {
  if (phase === 'upcoming') {
    const n = daysBetweenISO(todayIso, trip.startDate);
    return { tone: 'upcoming', text: n <= 0 ? '📅 Starts today' : n === 1 ? '📅 Tomorrow' : `📅 In ${n} days` };
  }
  if (phase === 'active') return { tone: 'active', text: `🟢 Day ${todayIdx + 1} of ${trip.days.length} · today` };
  if (phase === 'past') return { tone: 'past', text: '✓ Trip complete' };
  return null;
}
