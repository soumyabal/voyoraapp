/**
 * slots.js — shared time-slot + smart-placement logic.
 *
 * Used by DiscoverModal and AddActivityModal so the "When" picker behaves
 * identically everywhere: pick a slot (Morning/Afternoon/Evening/Night) and
 * the app finds the best open time in that slot for the chosen day.
 */
import { estimateDuration } from './tripValidator';

export const SLOTS = [
  { key: 'morning',   emoji: '\u{1F305}', label: 'Morning',   defaultTime: '09:00', range: [0,    720]  },
  { key: 'afternoon', emoji: '☀️', label: 'Afternoon', defaultTime: '13:00', range: [720,  1020] },
  { key: 'evening',   emoji: '\u{1F306}', label: 'Evening',    defaultTime: '18:00', range: [1020, 1260] },
  { key: 'night',     emoji: '\u{1F319}', label: 'Night',      defaultTime: '21:00', range: [1260, 1440] },
];

export function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToTime(totalMin) {
  const h = Math.floor(Math.max(0, totalMin) / 60) % 24;
  const m = Math.max(0, totalMin) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function getSlotKey(timeStr) {
  const m = timeToMin(timeStr);
  if (m < 720)  return 'morning';
  if (m < 1020) return 'afternoon';
  if (m < 1260) return 'evening';
  return 'night';
}

export function getSlotDefaultTime(slotKey) {
  return SLOTS.find(s => s.key === slotKey)?.defaultTime || '09:00';
}

// Minimum spacing kept between two back-to-back activities.
const BUFFER_MIN = 15;
// When the new activity's duration is unknown, assume this much.
const DEFAULT_NEED_MIN = 60;

// Occupied [start, end] intervals (in minutes) for a given slot on a day,
// sorted and clamped to real durations.
function slotIntervals(trip, dayIndex, slotKey) {
  const day = trip.days?.[dayIndex];
  if (!day) return [];
  return (day.activities || [])
    .filter(a => a.status !== 'skipped' && getSlotKey(a.time) === slotKey)
    .map(a => {
      const start = timeToMin(a.time);
      return [start, start + Math.max(BUFFER_MIN, estimateDuration(a))];
    })
    .sort((x, y) => x[0] - y[0]);
}

/**
 * First open time in `slotKey` on `dayIndex` where an activity of `needMins`
 * fits — scans every gap (not just the trailing one), keeping a buffer between
 * activities. Returns null only when no gap is large enough ("Full").
 */
export function getSmartTime(trip, dayIndex, slotKey, needMins = 0) {
  const slot = SLOTS.find(s => s.key === slotKey);
  if (!slot) return null;
  const day = trip.days?.[dayIndex];
  if (!day) return slot.defaultTime;

  const [lo, hi]   = slot.range;
  const need       = Math.max(BUFFER_MIN, needMins || DEFAULT_NEED_MIN);
  const intervals  = slotIntervals(trip, dayIndex, slotKey);

  if (intervals.length === 0) {
    return hi - lo >= need ? slot.defaultTime : null;
  }

  let cursor = lo;
  for (const [start, end] of intervals) {
    // Candidate start: slot start (no leading buffer) or after the prior item.
    const candStart = cursor === lo ? lo : cursor + BUFFER_MIN;
    if (start - candStart >= need) return minToTime(candStart);
    cursor = Math.max(cursor, end);
    if (cursor >= hi) break;
  }
  // Trailing gap after the last activity.
  const candStart = cursor === lo ? lo : cursor + BUFFER_MIN;
  if (hi - candStart >= need) return minToTime(candStart);
  return null;
}

// Number of (non-skipped) activities already in a slot on a day.
export function getSlotCount(trip, dayIndex, slotKey) {
  const day = trip.days?.[dayIndex];
  if (!day) return 0;
  return (day.activities || [])
    .filter(a => a.status !== 'skipped' && getSlotKey(a.time) === slotKey)
    .length;
}

/**
 * A suggested time that ALWAYS returns a value (never blocks): the first open
 * gap if one fits, otherwise just after the last activity in the slot. Any
 * resulting tightness/overlap is surfaced later by the Trip Checker.
 */
export function getSuggestedTime(trip, dayIndex, slotKey, needMins = 0) {
  const gap = getSmartTime(trip, dayIndex, slotKey, needMins);
  if (gap) return gap;
  const slot = SLOTS.find(s => s.key === slotKey);
  const intervals = slotIntervals(trip, dayIndex, slotKey);
  if (!slot) return '09:00';
  if (!intervals.length) return slot.defaultTime;
  const lastEnd = Math.max(...intervals.map(iv => iv[1]));
  return minToTime(Math.min(lastEnd + BUFFER_MIN, 1439));
}
