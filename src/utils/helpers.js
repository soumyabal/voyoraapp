import { deviceTz, zonedNowDate, zonedNowMinutes, tzForDay, tzForCoords, zonedWallToUtcMs, offsetMinutes, zoneShortLabel } from './tz';

// Generate a short random ID
export function uid() {
  return 'x' + Math.random().toString(36).slice(2, 9);
}

// Format ISO date string → "Jul 10"
export function fmt(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Format number → "$1,234"
export function fmtM(n) {
  return '$' + Math.round(n).toLocaleString();
}

// Generate deterministic color from a string (for avatars)
const AVATAR_COLORS = [
  '#6c5ce7', '#e84393', '#0984e3',
  '#00b894', '#e17055', '#e67e22', '#2d3436',
];
export function avatarColor(str) {
  let h = 0;
  for (let ch of (str || '')) h = (h * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

// Get all members across all families in a trip
export function getAllMembers(trip) {
  return trip.families.flatMap(f => f.members);
}

// Find a member by ID across all families
export function findMember(trip, memberId) {
  for (const f of trip.families) {
    const m = f.members.find(m => m.id === memberId);
    if (m) return m;
  }
  return null;
}

// Find the family a member belongs to
export function findMemberFamily(trip, memberId) {
  return trip.families.find(f => f.members.some(m => m.id === memberId));
}

// Build the category icon label
export const CATEGORY_OPTIONS = [
  { value: '🏨', label: '🏨 Accommodation' },
  { value: '✈️', label: '✈️ Transport' },
  { value: '🍽️', label: '🍽️ Food & Dining' },
  { value: '🎯', label: '🎯 Activities' },
  { value: '🛍️', label: '🛍️ Shopping' },
  { value: '💊', label: '💊 Health & Medical' },
  { value: '📦', label: '📦 Other' },
];

export const NEEDS_OPTIONS = [
  '♿ Wheelchair',
  '🛒 Stroller',
  '👁️ Visual Impairment',
  '👂 Hearing Impairment',
  '🍼 Infant (0-2)',
  '👶 Young Children',
  '🧓 Elderly (65+)',
  '🌿 Dietary Needs',
  '💊 Medical Requirements',
];

export const INTERESTS_OPTIONS = [
  '🌳 Parks',
  '🏖️ Beaches',
  '🏛️ Culture & Museums',
  '🍽️ Food & Dining',
  '🛍️ Shopping',
  '🎡 Theme Parks',
  '🌿 Outdoors & Nature',
  '🎭 Arts & Entertainment',
  '⚽ Sports',
  '📸 Photography',
  '🌙 Nightlife',
  '🧘 Wellness & Spa',
  '🏊 Water Activities',
  '🚴 Adventure',
];

export const ACTIVITY_TYPES = [
  { value: 'transport', label: '🚌 Transport' },
  { value: 'stay',      label: '🏨 Stay / Accommodation' },
  { value: 'food',      label: '🍽️ Food & Dining' },
  { value: 'activity',  label: '🎯 Activity / Sightseeing' },
  { value: 'note',      label: '📝 Note / Reminder' },
];

// Transport subtypes — stored in activity.subtype
export const TRANSPORT_SUBTYPE_ICONS = {
  flight:  '✈️',
  car:     '🚗',
  train:   '🚂',
  ship:    '🚢',
  pitstop: '⛽',
};

/** Returns the best display icon for an activity, respecting transport subtypes. */
export function getActivityIcon(type, subtype) {
  if (type === 'transport' && subtype && TRANSPORT_SUBTYPE_ICONS[subtype]) {
    return TRANSPORT_SUBTYPE_ICONS[subtype];
  }
  const BASE = { transport: '🚌', stay: '🏨', food: '🍽️', activity: '🎯', note: '📝' };
  return BASE[type] || '📌';
}

// Trip background gradients
export const TRIP_BG_COLORS = [
  ['#e17055', '#fdcb6e'],
  ['#6c5ce7', '#a29bfe'],
  ['#0984e3', '#74b9ff'],
  ['#00b894', '#55efc4'],
  ['#e84393', '#fd79a8'],
];

export const TRIP_EMOJIS = ['🌴','🏔️','🗼','🏝️','🌍','✈️','🎌','🏰','🌊','🦁'];

// Distinct colors assigned to each family group
export const familyPalette = [
  '#6c5ce7', '#0984e3', '#00b894', '#e17055',
  '#e84393', '#e67e22', '#2d3436', '#fdcb6e',
];

/**
 * Smart default for a hotel's `nights`: cover from the check-in day to the next
 * existing check-in (multi-hotel trips) or the trip's last night. So a single
 * hotel on a 2-night trip defaults to 2 nights instead of 1 (the old trap that
 * left later nights — and their day-routing anchor — uncovered). Always >= 1.
 */
export function defaultNightsFor(trip, checkInDayIdx) {
  const days = trip?.days || [];
  if (!days.length) return 1;
  let nextStayDay = -1;
  for (let i = checkInDayIdx + 1; i < days.length; i++) {
    if ((days[i].activities || []).some((a) => a.type === 'stay' && a.status !== 'skipped')) {
      nextStayDay = i;
      break;
    }
  }
  const end = nextStayDay !== -1 ? nextStayDay : days.length - 1;
  return Math.max(1, end - checkInDayIdx);
}

// ─── Hotel check-in / check-out (real times, with industry-standard defaults) ────
// A hotel can't give you the room before check-in; you must be out by check-out.
// These default to the common 3pm / 11am so the planner is right out of the box —
// the user only sets them when their hotel differs. Single source for both engine
// (scheduleDay places check-in no earlier than this) and UI.
export const DEFAULT_CHECK_IN = '15:00';
export const DEFAULT_CHECK_OUT = '11:00';
export const checkInOf  = (stay) => (stay && stay.checkInTime)  || DEFAULT_CHECK_IN;
export const checkOutOf = (stay) => (stay && stay.checkOutTime) || DEFAULT_CHECK_OUT;

// ─── Trip lifecycle (before / during / after) ────────────────────────────────
// Dates are ISO 'YYYY-MM-DD'; compare as local civil days (no time-of-day / TZ math).

/** Today as 'YYYY-MM-DD' in the device's local timezone. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from ISO date a → b (b−a). Parses as local midnight to avoid TZ drift. */
export function daysBetweenISO(a, b) {
  if (!a || !b) return 0;
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.round((db - da) / 86400000);
}

/** A trip's lifecycle phase vs today: 'upcoming' | 'active' | 'past' | 'undated'. */
export function tripPhase(trip, today = todayISO()) {
  const s = trip?.startDate, e = trip?.endDate;
  if (!s || !e) return 'undated';
  if (today < s) return 'upcoming';
  if (today > e) return 'past';
  return 'active';
}

/**
 * The day index the Itinerary should LAND on when a trip is opened — derived from
 * the trip's phase, never a stale global. Upcoming/past/undated → Day 1 (planning /
 * recap). Active → today's day (clamped). This is the fix for "a not-started trip
 * opens on Day 2": the landing day can no longer drift out of sync with the dates.
 */
export function defaultDayFor(trip, today = todayISO()) {
  const n = (trip?.days || []).length;
  if (n === 0) return 0;
  if (tripPhase(trip, today) !== 'active') return 0;
  return Math.max(0, Math.min(daysBetweenISO(trip.startDate, today), n - 1));
}

/**
 * "Now / next" orientation for a live (active-trip) day, from the wall-clock
 * minute-of-day. Returns { now, next, empty } — `now` = the latest activity that
 * has started, `next` = the first still upcoming. Skipped/notes are ignored.
 */
/**
 * Where to land when a trip is OPENED — timezone-aware (doc Phase 2). Uses the destination's
 * current civil date (trip.defaultTz), so a Happening trip opens on the day it actually is THERE
 * (Tokyo can be a day ahead of your phone), and on the now/next activity within it:
 *   active → { dayIndex: today's index, activityId: the current (or next) stop } — drives the
 *            scroll-to-current so you land on "what's happening now", not Day 1.
 *   upcoming / past / undated → { dayIndex: 0, activityId: null } (plan / recap from the top).
 * Pure: pass `nowMs` to test. Falls back to the device zone when the trip has none.
 */
export function openFocusFor(trip, nowMs = Date.now()) {
  const tz = trip?.defaultTz || trip?.homeTz || deviceTz() || null;
  const today = zonedNowDate(tz, nowMs);
  const dayIndex = defaultDayFor(trip, today);
  if (tripPhase(trip, today) !== 'active') return { dayIndex, activityId: null };
  const nowMin = zonedNowMinutes(tz, nowMs);
  const { now, next } = nowNextOf(trip.days?.[dayIndex], nowMin);
  return { dayIndex, activityId: (now || next)?.id || null };
}

/**
 * The zone badge to show on a day — its short label (DST-correct for THAT day's date, e.g. 'PDT'
 * vs 'PST') ONLY when the day's wall-clock offset differs from the traveler's home zone. Same
 * offset as home (a domestic trip) → '' (no badge, stays clean). Compares OFFSETS not names, so
 * two zones that happen to share an offset don't show a pointless badge. '' if zones unknown.
 * (Superseded in the UI by resolveDayZones, which also handles zone-spanning travel days; kept
 * for its unit tests + as the simple single-zone helper.)
 */
export function dayZoneLabel(trip, dayIndex) {
  const home  = trip?.homeTz || deviceTz();
  const dayTz = tzForDay(trip, dayIndex);
  const date  = trip?.days?.[dayIndex]?.date;
  if (!dayTz || !home || !date) return '';
  const ms = zonedWallToUtcMs(date, '12:00', dayTz);
  if (offsetMinutes(dayTz, ms) === offsetMinutes(home, ms)) return '';
  return zoneShortLabel(dayTz, date, '12:00');
}

const _tMin = (t) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// The zone carried INTO a day = the last located stop's zone across all earlier days (time
// order), so a location-less morning inherits where you ended up yesterday. Falls back to the
// trip default / home / device when nothing earlier is located.
function _zoneCarriedInto(trip, dayIndex) {
  let carry = trip?.defaultTz || trip?.homeTz || deviceTz() || null;
  for (let i = 0; i < dayIndex; i++) {
    const acts = (trip?.days?.[i]?.activities || [])
      .filter(a => a.time).slice().sort((a, b) => _tMin(a.time) - _tMin(b.time));
    for (const a of acts) if (a.lat != null && a.lng != null) carry = tzForCoords(a.lat, a.lng) || carry;
  }
  return carry;
}

// Per-activity IANA zone for a day's TIMED stops: each takes its own location's zone, a
// location-less one inherits the previous (carrying across days from _zoneCarriedInto). The one
// source of truth for both the display (resolveDayZones) and the clock (pastActivityIds), so
// "what zone is shown" and "is it past" can never diverge. Returns { acts (time-sorted), zoneOf }.
function _activityZones(trip, dayIndex) {
  const acts = (trip?.days?.[dayIndex]?.activities || [])
    .filter(a => a.time && a.status !== 'skipped').slice().sort((a, b) => _tMin(a.time) - _tMin(b.time));
  let carry = _zoneCarriedInto(trip, dayIndex);
  const zoneOf = {};
  for (const a of acts) {
    if (a.lat != null && a.lng != null) carry = tzForCoords(a.lat, a.lng) || carry;
    zoneOf[a.id] = carry;
  }
  return { acts, zoneOf, carry };
}

/**
 * Per-day timezone resolution for the itinerary: a zone label for EVERY timed stop. Each takes
 * the zone of ITS OWN location (offline tzForCoords); a location-less stop inherits the previous
 * activity's zone in trip time-order (carrying across days). The label is the DST-correct short
 * abbreviation for the day's date (CDT vs CST). Shown on every activity — consistently, never
 * suppressed — because a single trip-level badge confused (a Chicago→Wisconsin trip is all CDT
 * and read as "blank" next to a Chicago→Michigan trip that crosses into EDT). '' for any stop
 * whose zone can't be resolved (no Intl/coords). Returns { zoneById }.
 */
export function resolveDayZones(trip, dayIndex) {
  const date = trip?.days?.[dayIndex]?.date;
  const { acts, zoneOf } = _activityZones(trip, dayIndex);
  const zoneById = {};
  for (const a of acts) zoneById[a.id] = zoneShortLabel(zoneOf[a.id], date, '12:00');
  return { zoneById };
}

// 'YYYY-MM-DD' + n days, in local civil terms (parsed at local midnight to avoid TZ drift).
function _addDaysISO(iso, n) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Cross-zone travel-leg label for a transport stop: when a flight/drive bridges two timezones,
 * returns the depart/arrive zones, true elapsed duration, and a +1-day / red-eye marker —
 * "depart 9:00 AM PDT → land 5:00 PM EDT · 5h" (or "🌙 +1 day" overnight). The depart zone is the
 * zone in effect just before the leg (the previous stop, else the day's carry-in); the arrive
 * zone is the leg's own destination zone if it has coords, else the next stop in a different
 * offset. null when it's not a transport, has no time, or doesn't cross a zone. Pure + DST-correct.
 */
export function crossZoneLeg(trip, dayIndex, act) {
  if (!act || act.type !== 'transport' || !act.time) return null;
  const date = trip?.days?.[dayIndex]?.date;
  if (!date) return null;
  const { acts, zoneOf } = _activityZones(trip, dayIndex);
  const idx = acts.findIndex(a => a.id === act.id);
  if (idx < 0) return null;
  const offAt = (tz) => (tz ? offsetMinutes(tz, zonedWallToUtcMs(date, '12:00', tz)) : null);

  const departZone = idx > 0 ? zoneOf[acts[idx - 1].id] : _zoneCarriedInto(trip, dayIndex);
  const dOff = offAt(departZone);
  if (dOff == null) return null;
  // Arrive zone: the leg's own destination (if it switched the carry there), else the first
  // later stop in a different offset (the crossing this leg bridges).
  let arriveZone = offAt(zoneOf[act.id]) !== dOff ? zoneOf[act.id] : null;
  if (!arriveZone) {
    for (let j = idx + 1; j < acts.length; j++) {
      if (offAt(zoneOf[acts[j].id]) !== dOff) { arriveZone = zoneOf[acts[j].id]; break; }
    }
  }
  if (!arriveZone || offAt(arriveZone) === dOff) return null;

  const departInst = zonedWallToUtcMs(date, act.time, departZone);
  let dayOffset = 0;
  let durationMin = null;
  if (act.arriveTime) {
    let arriveInst = zonedWallToUtcMs(date, act.arriveTime, arriveZone);
    if (arriveInst < departInst) {           // landed the next calendar day (red-eye)
      dayOffset = 1;
      arriveInst = zonedWallToUtcMs(_addDaysISO(date, 1), act.arriveTime, arriveZone);
    }
    durationMin = Math.round((arriveInst - departInst) / 60000);
  }
  return {
    departZone, departLabel: zoneShortLabel(departZone, date, act.time),
    arriveZone, arriveLabel: zoneShortLabel(arriveZone, date, act.arriveTime || act.time),
    durationMin, dayOffset, redEye: dayOffset === 1,
  };
}

/**
 * IDs of a day's timed stops whose START has already PASSED, in the stop's OWN timezone (so a
 * live trip auto-locks what's done as the clock crosses each stop). Clock-injected (`nowMs`) so
 * it stays pure/testable. The UI treats these as locked (can't be moved without a warning) and
 * Plan-my-day anchors them. Empty for a day with no date / no timed stops.
 */
export function pastActivityIds(trip, dayIndex, nowMs = Date.now()) {
  const date = trip?.days?.[dayIndex]?.date;
  const out = new Set();
  if (!date) return out;
  const { acts, zoneOf } = _activityZones(trip, dayIndex);
  for (const a of acts) {
    const inst = zonedWallToUtcMs(date, a.time, zoneOf[a.id]);
    if (!Number.isNaN(inst) && inst <= nowMs) out.add(a.id);
  }
  return out;
}

/**
 * Is this whole day already in the PAST (its civil date is before "today" in the day's zone)?
 * Drives the Plan-my-day lock on past days of an ongoing trip + every day of a finished trip.
 * Clock-injected. A future or current day → false.
 */
export function isDayInPast(trip, dayIndex, nowMs = Date.now()) {
  const date = trip?.days?.[dayIndex]?.date;
  if (!date) return false;
  return date < zonedNowDate(tzForDay(trip, dayIndex), nowMs);
}

/**
 * The earliest minute-of-day Plan-my-day may schedule INTO for a day — so it only arranges the
 * REMAINING time, never the past. Past day → 1440 (nothing schedulable; the caller disables the
 * button). Future day → 0 (no floor). Today → "now" in the day's zone. Clock-injected.
 */
export function planFloorMin(trip, dayIndex, nowMs = Date.now()) {
  const date = trip?.days?.[dayIndex]?.date;
  if (!date) return 0;
  const tz = tzForDay(trip, dayIndex);
  const today = zonedNowDate(tz, nowMs);
  if (date < today) return 24 * 60;
  if (date > today) return 0;
  return zonedNowMinutes(tz, nowMs);
}

/**
 * Is the trip happening RIGHT NOW — today (in the trip's start zone) falls within its date range?
 * Mirrors HomeScreen's "Happening now" badge. Clock-injected; pure.
 */
export function isTripOngoing(trip, nowMs = Date.now()) {
  const days = trip?.days;
  if (!days || !days.length) return false;
  const first = days[0]?.date, last = days[days.length - 1]?.date;
  if (!first || !last) return false;
  const today = zonedNowDate(tzForDay(trip, 0), nowMs);
  return first <= today && today <= last;
}

/**
 * Gentle "log your expenses" nudge: should we remind the traveller about this WRAPPED day? True
 * only on an ONGOING trip, for a day already in the past, that had real paid-for stops (any food /
 * transport, or a priced activity) but has NO expense linked to any of its activities yet. So a
 * planned day whose expenses auto-populated, an all-free day, or a future/today day never nags.
 * Dismissal is handled by the caller (via ignoredWarnings). Clock-injected; pure.
 */
export function dayNeedsExpenseLog(trip, dayIndex, nowMs = Date.now()) {
  if (!isTripOngoing(trip, nowMs)) return false;
  if (!isDayInPast(trip, dayIndex, nowMs)) return false;
  const acts = (trip?.days?.[dayIndex]?.activities || []).filter(a => a.status !== 'skipped');
  const payable = acts.some(a =>
    a.type === 'food' || a.type === 'transport' || (a.type === 'activity' && Number(a.costPerPerson) > 0));
  if (!payable) return false;
  const ids = new Set(acts.map(a => a.id));
  const logged = (trip?.expenses || []).some(e => !e.excluded && e.activityId && ids.has(e.activityId));
  return !logged;
}

export function nowNextOf(day, nowMin) {
  const tMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const acts = (day?.activities || [])
    .filter((a) => a.time && a.status !== 'skipped' && a.type !== 'note')
    .sort((a, b) => tMin(a.time) - tMin(b.time));
  if (!acts.length) return { now: null, next: null, empty: true };
  const next = acts.find((a) => tMin(a.time) > nowMin) || null;
  let now = null;
  for (const a of acts) { if (tMin(a.time) <= nowMin) now = a; else break; }
  return { now, next, empty: false };
}

/**
 * effectiveMember(member, travelers)
 *
 * Returns the "merged" view of a trip member:
 *   trip override ?? traveler global default ?? []
 *
 * Rules:
 * - name, age: trip member wins (may have been overridden per-trip)
 * - needs: trip member array wins if non-empty, else fall back to traveler
 * - dietary, pacePreference, interests, notes: traveler global is the source of truth
 *   unless a trip-level override exists (stored as _dietary, _pace, etc.)
 */
export function effectiveMember(member, travelers = []) {
  const tv = member.travelerId
    ? travelers.find(t => t.id === member.travelerId) || null
    : null;

  return {
    ...member,
    // needs: prefer the trip-level array if it has entries, else fall back to traveler
    needs: (member.needs && member.needs.length > 0)
      ? member.needs
      : (tv?.needs || []),
    // traveler-level fields available for AI analysis
    dietary:        tv?.dietary        || [],
    pacePreference: tv?.pacePreference || 'moderate',
    interests:      tv?.interests      || [],
    notes:          tv?.notes          || '',
    // expose the linked traveler for direct access
    traveler: tv,
  };
}
