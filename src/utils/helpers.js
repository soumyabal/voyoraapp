import { colors } from '../theme';

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
