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
  '👁️ Visual Impairment',
  '👂 Hearing Impairment',
  '🍼 Infant (0-2)',
  '👶 Young Children',
  '🧓 Elderly (65+)',
  '🌿 Dietary Needs',
  '💊 Medical Requirements',
];

export const ACTIVITY_TYPES = [
  { value: 'transport', label: '🚌 Transport' },
  { value: 'stay', label: '🏨 Stay / Accommodation' },
  { value: 'food', label: '🍽️ Food & Dining' },
  { value: 'activity', label: '🎯 Activity / Sightseeing' },
  { value: 'note', label: '📝 Note / Reminder' },
];

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

// Credit estimation formula (mirrors HTML prototype)
export function calcCreditEstimate(days, travelers, activeInterests, hasAccessibility) {
  const base = 20;
  const daysCost = Math.max(0, days - 1) * 3;
  const travelersCost = Math.max(0, travelers - 1) * 2;
  const accessibilityCost = hasAccessibility ? 8 : 0;
  const costEstimation = 5;
  const interestsCost = activeInterests * 1;
  const total = base + daysCost + travelersCost + accessibilityCost + costEstimation + interestsCost;
  return { base, daysCost, travelersCost, accessibilityCost, costEstimation, interestsCost, total };
}
