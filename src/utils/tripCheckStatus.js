/**
 * tripCheckStatus.js — the Trip-Check chip's underlying state, independent of how it's drawn.
 *
 * Pure: (trip) → { conflicts, checks, allPlanned, state }. Runs validateTrip, drops ignored
 * warnings, counts errors/warnings, and decides the chip state:
 *   'fix'      — ≥1 provable conflict (error)        → amber count "to fix"
 *   'look'     — ≥1 data-backed warning (no errors)  → soft count "to look at"
 *   'building' — clean so far, but not every day is planned yet
 *   'clear'    — every day planned and nothing flagged
 * The screen maps state → the chip's colors/icon/label; this keeps the decision testable.
 */
import { validateTrip } from './tripValidator';

const isPlanned = (d) => (d.activities || []).some((a) => a.status !== 'skipped' && a.type !== 'note');

export function tripCheckStatus(trip) {
  const ignored = trip.ignoredWarnings || [];
  const all = validateTrip(trip).filter((w) => !ignored.includes(`${w.type}:${w.dayIndex ?? 'trip'}`));
  const conflicts = all.filter((w) => w.severity === 'error').length;
  const checks = all.filter((w) => w.severity === 'warning').length;
  const days = trip.days || [];
  const allPlanned = days.length > 0 && days.every(isPlanned);
  const state = conflicts > 0 ? 'fix' : checks > 0 ? 'look' : !allPlanned ? 'building' : 'clear';
  return { conflicts, checks, allPlanned, state };
}
