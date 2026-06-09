/**
 * itineraryConfig.js — static lookup tables for the itinerary screen: day slots, type icons,
 * severity rank, pill tones, day-pill / health-dot styling, the slot↔meal map, and the
 * night-plan options/meta. Pure data extracted from ItineraryScreen so the screen file stays
 * focused on rendering. No logic here.
 */
import { colors } from '../theme';

// ── Day template: time slots ──────────────────────────────────────
export const DAY_SLOTS = [
  { key: 'morning',   emoji: '🌅', icon: 'partly-sunny-outline', tint: '#e09a37', label: 'Morning',   hint: 'Before noon',   defaultTime: '09:00', range: [0,   720]  },
  { key: 'afternoon', emoji: '☀️',  icon: 'sunny',                tint: '#e0843c', label: 'Afternoon', hint: '12 pm – 5 pm',  defaultTime: '13:00', range: [720, 1020] },
  { key: 'evening',   emoji: '🌆', icon: 'cloudy-night-outline', tint: '#c2683f', label: 'Evening',   hint: '5 pm – 9 pm',   defaultTime: '18:00', range: [1020,1260] },
  { key: 'night',     emoji: '🌙', icon: 'moon',                 tint: '#6c5ce7', label: 'Night',     hint: 'After 9 pm',    defaultTime: '21:00', range: [1260,1440] },
];

// Activity type → Icon name (see components/ui/Icon)
export const ACT_ICON = { transport: 'transport', stay: 'hotel', food: 'food', activity: 'activity', note: 'note' };
// Colourful emoji for an activity card's lead icon — far more legible than one flat monochrome
// glyph. Transport branches on sub-mode (a drive shows a car, a flight a plane). Unknown/blank
// transport sub-modes (pitstop's own ⛽, misc) fall back to the generic 🚗.
export const TYPE_EMOJI = { transport: '🚗', stay: '🏨', food: '🍽️', activity: '🎯', note: '📝' };
export const TRANSPORT_EMOJI = { car: '🚗', flight: '✈️', train: '🚆', ship: '⛴️', bus: '🚌', pitstop: '⛽' };
export function actEmoji(act) {
  if (act?.checkout) return '🧳';   // a hotel check-out (stored as a misc activity) — luggage, not a 🎯
  if (act?.type === 'transport') return TRANSPORT_EMOJI[act.subtype] || TYPE_EMOJI.transport;
  return TYPE_EMOJI[act?.type] || '🎯';
}
// Trip Check severity → sort rank (errors first).
export const SEV_RANK = { error: 0, warning: 1, info: 2 };

// One calm per-day summary pill (replaces the wall of red chips). Tone is set by
// the worst severity present; the icon SHAPE + the words carry severity (not just
// colour — WCAG 1.4.1). Deliberately soft: even "to fix" is amber, never alarm-red.
// Trip-phase status pill tones (before/during/after)
export const PILL_TONE = {
  upcoming: { bg: '#eef2ff', fg: '#4f46e5' },  // anticipatory
  active:   { bg: '#dcfce7', fg: '#15803d' },  // live green
  past:     { bg: '#f1f5f9', fg: '#64748b' },  // settled / muted
};

export const DAY_PILL = {
  fix:   { bg: '#fdf3e2', fg: '#b45309', icon: 'warning-outline' },          // a genuine conflict
  check: { bg: '#fdf3e2', fg: '#b45309', icon: 'information-circle-outline' },// real, worth a look
  tip:   { bg: '#eef1f4', fg: '#5b6470', icon: 'bulb-outline' },             // soft heuristic heads-up
};

// Day-pill health dot — calm by default. A dot appears ONLY when a day needs attention:
// red for a provable conflict, amber for a data-backed warning. Soft 'info' tips earn NO
// dot (they live inside the day) so amber stays meaningful and the row never green-soups.
export const HEALTH_DOT = {
  conflict: colors.danger,
  check:    colors.warn,
  // tip / clean / empty → no dot (calm)
};

// A day slot ↔ the meal you'd eat at the hotel in it (in-room dining / hotel
// restaurant) — handy when the group is tired or unwell and doesn't want to go out.
export const SLOT_MEAL  = { morning: 'breakfast', afternoon: 'lunch', evening: 'dinner' };
export const MEAL_LABEL = {
  breakfast: { emoji: '🍳', label: 'Breakfast', time: '08:00' },
  lunch:     { emoji: '🥪', label: 'Lunch',     time: '12:30' },
  dinner:    { emoji: '🍽️', label: 'Dinner',    time: '19:00' },
};

// "How's tonight handled?" — a hotel-less night the user tells us is covered.
// The resolver sheet rows (with plain-language subtitles)…
// `located` reasons have a real address worth capturing (optionally) to anchor the
// next morning's drive; the others have no fixed place (overnight = in motion;
// heading home → the trip's origin, derived).
export const NIGHT_PLAN_OPTIONS = [
  { key: 'overnight_travel', emoji: '🌙', label: 'Travelling overnight', sub: 'red-eye, sleeper train, night drive', located: false },
  { key: 'with_friends',     emoji: '🛋️', label: 'Staying with friends or family', sub: null, located: true },
  { key: 'camping',          emoji: '⛺', label: 'Camping or RV', sub: null, located: true },
  { key: 'heading_home',     emoji: '🏡', label: 'Heading home tonight', sub: null, located: false },
];
// …and the calm settled chip each one becomes on the day card (icon = the in-app Icon name).
export const NIGHT_PLAN_META = {
  overnight_travel: { emoji: '🌙', icon: 'transport', label: 'Overnight travel · no hotel needed', a11y: 'travelling overnight' },
  with_friends:     { emoji: '🛋️', icon: 'people',    label: 'Staying with friends',              a11y: 'staying with friends or family' },
  camping:          { emoji: '⛺', icon: 'tent',      label: 'Camping tonight',                   a11y: 'camping' },
  heading_home:     { emoji: '🏡', icon: 'location',  label: 'Home tonight',                      a11y: 'heading home' },
};
