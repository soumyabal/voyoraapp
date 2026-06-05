/**
 * tripHealth.js — per-day Trip-Check health for the day pills.
 *
 * Pure: (trip) → { healthByDay, warningsByDay }. Runs validateTrip once, drops ignored
 * warnings, groups the rest by dayIndex, and derives each day's worst level:
 *   'empty'    — nothing planned (no non-skipped activities)
 *   'conflict' — a provable error
 *   'check'    — a data-backed warning
 *   'tip'      — only soft info
 *   'clean'    — planned with nothing to flag
 * Trip-scope warnings (no dayIndex) are not pinned to a day.
 */
import { validateTrip } from './tripValidator';

export function computeTripHealth(trip) {
  const ignored = trip.ignoredWarnings || [];
  const all = validateTrip(trip).filter(w => !ignored.includes(`${w.type}:${w.dayIndex ?? 'trip'}`));
  const byDay = {};
  all.forEach(w => { if (w.dayIndex != null) (byDay[w.dayIndex] ||= []).push(w); });
  const health = {};
  (trip.days || []).forEach((d, i) => {
    const ws = byDay[i] || [];
    const acts = (d.activities || []).filter(a => a.status !== 'skipped');
    if (acts.length === 0)                            health[i] = 'empty';
    else if (ws.some(w => w.severity === 'error'))    health[i] = 'conflict';
    else if (ws.some(w => w.severity === 'warning'))  health[i] = 'check';
    else if (ws.some(w => w.severity === 'info'))     health[i] = 'tip';
    else                                              health[i] = 'clean';
  });
  return { healthByDay: health, warningsByDay: byDay };
}
