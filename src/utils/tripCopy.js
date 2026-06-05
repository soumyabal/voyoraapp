/**
 * tripCopy.js — warm, VARIED motivational copy for the PDF (and reusable in-app).
 *
 * All original, rule-derived text — NO external quote API/library (those carry IP
 * baggage + a network/security cost). Variety comes from generous pools picked
 * DETERMINISTICALLY (a stable hash, not Math.random — so a given trip/day always
 * reads the same, but different trips/days differ). Consecutive same-type days get
 * different lines, which kills the "every day says the same thing" monotony.
 */
import { APP_NAME } from '../config';

// Stable string → non-negative int (no Date/random → reproducible).
function hashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const pick = (pool, seed) => pool[(seed >>> 0) % pool.length];
const tripSeed = (trip) => hashStr(`${trip?.name || ''}|${trip?.startDate || ''}`);

// ── Cover tagline ─────────────────────────────────────────────────
const TAGLINES_PLACE = [
  '{days} days, {fams} families, one {place} adventure.',
  '{place} is calling — and all {people} of you are going.',
  'Here’s to {place}: {days} days of doing it together.',
  'Bags, snacks, good company — {place}, here you come.',
  '{days} days in {place}, planned down to the snacks.',
  '{fams} families. {days} days. A whole lot of {place} memories incoming.',
];
const TAGLINES_GENERIC = [
  'The plan’s done. The fun part now? Just showing up.',
  '{fams} families, {days} days, one unforgettable trip.',
  'Everyone’s in. Bags next.',
  '{days} days together — let’s make them count.',
];

export function coverTagline(trip) {
  const days = trip?.days?.length || 0;
  const fams = trip?.families?.length || 0;
  const people = (trip?.families || []).reduce((s, f) => s + (f.members?.length || 0), 0);
  const place = (trip?.destination || '').split(',')[0].trim();
  const fill = (t) => t
    .replace('{days}', `${days} day${days !== 1 ? 's' : ''}`)
    .replace('{fams}', `${fams} famil${fams !== 1 ? 'ies' : 'y'}`)
    .replace('{people}', `${people}`)
    .replace('{place}', place);
  const pool = place && fams >= 2 ? TAGLINES_PLACE : place ? TAGLINES_PLACE : TAGLINES_GENERIC;
  return fill(pick(pool, tripSeed(trip)));
}

// ── Countdown ─────────────────────────────────────────────────────
const COUNTDOWN = {
  far:   ['{n} days to go — plenty of time to get excited', 'the countdown’s on: {n} days', '{n} days until liftoff'],
  near:  ['{n} days out — it’s getting real', '{n} days to go — start the packing list', 'just {n} days now'],
  soon:  ['only {n} days away!', '{n} days — the group chat’s about to pop off', 'nearly there: {n} days'],
  one:   ['tomorrow! ✨', 'one more sleep!'],
  today: ['today — have the best time', 'it’s go day — enjoy every minute'],
  past:  ['the adventure’s underway', 'hope it’s everything you planned'],
};
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
}
export function countdownLine(trip) {
  const n = daysUntil(trip?.startDate);
  if (n == null) return '';
  const bucket = n > 30 ? 'far' : n > 7 ? 'near' : n > 1 ? 'soon' : n === 1 ? 'one' : n === 0 ? 'today' : 'past';
  return pick(COUNTDOWN[bucket], tripSeed(trip)).replace('{n}', `${n}`);
}

// ── Per-day vibe ──────────────────────────────────────────────────
const VIBES = {
  arrival:  ['Arrival day — land, settle in, let it start slow. \u{1F305}', 'Touchdown — drop the bags and breathe it in.', 'Day one: ease in, no rush.'],
  travel:   ['A travel day — snacks packed, playlist ready. \u{1F697}', 'Wheels up — enjoy the ride.', 'Getting there is half the fun today. \u{1F9F3}'],
  packed:   ['A full one today — pace yourselves and soak it in.', 'Big day ahead — comfy shoes recommended.', 'Lots on the agenda — take breaks, take photos.'],
  foodie:   ['A day to eat your way around. \u{1F37D}️', 'Come hungry — today’s about the food.', 'Forks ready: a tasting kind of day.'],
  outdoors: ['Fresh air and big views today. \u{1F332}', 'An outdoorsy one — sunscreen and curiosity.', 'Nature’s on the itinerary today.'],
  culture:  ['A day for wandering and wondering. \u{1F5BC}️', 'Soak up the stories today.', 'Curiosity on today’s menu.'],
  relaxed:  ['An easy one — leave room to wander.', 'Low-key today, exactly as planned.', 'A gentle day — enjoy the slow bits.'],
  mixed:    ['A good mix today — a little to see, a little to savour.', 'A bit of everything today.', 'See some, eat some, rest some.'],
  empty:    ['An open day — leave room to wander, or add one thing you’d hate to miss.', 'Blank canvas today — fill it or float through it.', 'Nothing planned — and that’s allowed.'],
};
const OUTDOOR_RE = /hike|hiking|trail|park|beach|kayak|canoe|surf|snorkel|dive|garden|nature|waterfall|lake|mountain|ski|zoo|safari/i;
const CULTURE_RE = /museum|gallery|histor|cathedral|temple|palace|castle|ruins|monument|theat|art\b/i;

export function dayVibe(day, seed = 0) {
  const acts = (day?.activities || []).filter(a => a.status !== 'skipped');
  if (!acts.length) return pick(VIBES.empty, seed);
  const transport = acts.filter(a => a.type === 'transport').length;
  const food      = acts.filter(a => a.type === 'food').length;
  const activity  = acts.filter(a => a.type === 'activity').length;
  const hasStay   = acts.some(a => a.type === 'stay');
  const text      = acts.map(a => `${a.name || ''} ${a.detail || ''}`).join(' ');
  let cat;
  if (hasStay && transport) cat = 'arrival';
  else if (transport && acts.length <= 2) cat = 'travel';
  else if (activity >= 4 || acts.length >= 6) cat = 'packed';
  else if (food >= 2 && activity <= 1) cat = 'foodie';
  else if (OUTDOOR_RE.test(text)) cat = 'outdoors';
  else if (CULTURE_RE.test(text)) cat = 'culture';
  else if (acts.length <= 2) cat = 'relaxed';
  else cat = 'mixed';
  return pick(VIBES[cat], seed);   // seed = day index → consecutive same-type days differ
}

// ── Closing note ──────────────────────────────────────────────────
const CLOSINGS = [
  `Made for your crew with ${APP_NAME}. Now go make the stories. ✨`,
  'Plans are just the beginning — have an incredible trip. ✨',
  'Pack light, laugh often, enjoy every mile. ✨',
  'Here’s to good company and great memories. ✨',
  'Safe travels and unforgettable days ahead. ✨',
];
export function closingNote(trip) {
  return pick(CLOSINGS, tripSeed(trip));
}
