/**
 * packing.js — Smart Packing List: a DETERMINISTIC, no-AI engine that reasons from the trip
 * itself (activities, families, dates, timezones) to suggest what to pack — and WHY.
 *
 * The "intelligence" is a contextual rules knowledge-base: a beach day adds sunscreen, a red-eye
 * adds an eye mask, an international zone adds a passport + adapter, a 7-year-old adds snacks,
 * 5 nights scales the clothing count. Each item carries a `reason` so it never feels generic.
 *
 * PURE + unit-testable: (trip) → { items, byCategory }. No store, no API, no clock dependence
 * (dates come from the trip). The UI just renders + lets you check items off.
 */
import { getAllMembers } from './helpers';
import { timeToMin } from './slots';

export const CATEGORIES = ['Documents', 'Electronics', 'Clothing', 'Toiletries', 'Health', 'Activities', 'Kids', 'Essentials'];

const RE = {
  beach:    /\b(beach|pier|snorkel|surf|swim|pool|water ?park|cove|lagoon|kayak|paddle|boat|cruise|island|sail|sea ?lion|marina)\b/i,
  hike:     /\b(hike|hiking|trail|trek|mountain|nature|national park|state park|canyon|waterfall|forest|botanical|gardens?)\b/i,
  themepark:/\b(universal|disney|theme park|six flags|amusement|\bzoo\b|aquarium|safari|legoland)\b/i,
  fancy:    /\b(fine dining|michelin|rooftop|cocktail|gala|steakhouse|fancy|tasting menu)\b/i,
  snow:     /\b(ski|skiing|snow|snowboard|ice skat|sled|glacier)\b/i,
  formalish:/\b(theatre|theater|opera|concert|show|symphony)\b/i,
};

const region = (tz) => String(tz || '').split('/')[0] || '';

// Northern-hemisphere season from a 0-based month; flipped below the equator (lat < 0).
function seasonOf(month, lat) {
  let s = (month <= 1 || month === 11) ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'fall';
  if (lat != null && lat < 0) s = { winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' }[s];
  return s;
}

/**
 * Build the smart packing list for a trip. Returns { items, byCategory } where each item is
 * { key, label, category, reason }. `key` is stable so check-state can persist later.
 */
export function buildPackingList(trip) {
  const days = trip?.days || [];
  const acts = days.flatMap(d => (d.activities || []).filter(a => a.status !== 'skipped'));
  const text = acts.map(a => `${a.name || ''} ${a.detail || ''}`).join('  ').toLowerCase();
  const has = (re) => re.test(text);
  const hasType = (t) => acts.some(a => a.type === t);

  const out = [];
  const seen = new Set();
  const add = (key, label, category, reason) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label, category, reason });
  };

  // ── context ──────────────────────────────────────────────────────────────
  const nights = Math.max(1, days.length - (days.length > 1 ? 1 : 0));
  const members = getAllMembers(trip) || [];
  const ages = members.map(m => (typeof m.age === 'number' ? m.age : parseInt(m.age, 10))).filter(n => Number.isFinite(n));
  const hasKid = ages.some(a => a < 12);
  const hasInfant = ages.some(a => a < 2) || members.some(m => (m.needs || []).some(n => /infant|🍼/i.test(n)));
  const needsAccess = members.some(m => (m.needs || []).some(n => /wheelchair|♿|mobility/i.test(n)));

  const firstStop = acts.find(a => a.lat != null);
  const lat = firstStop ? firstStop.lat : null;
  const month = trip?.startDate ? (parseInt(trip.startDate.split('-')[1], 10) - 1) : null;
  const season = month != null ? seasonOf(month, lat) : null;

  const destTz = trip?.defaultTz || null;
  const homeTz = trip?.homeTz || null;
  const international = region(homeTz) && region(destTz) && region(homeTz) !== region(destTz);

  const flights = acts.filter(a => a.type === 'transport' && (a.subtype === 'flight' || /flight|fly|airport/i.test(`${a.name} ${a.detail}`)));
  const hasFlight = flights.length > 0;
  const redEye = flights.some(a => a.time && a.arriveTime && timeToMin(a.arriveTime) < timeToMin(a.time));
  const hasDrive = acts.some(a => a.type === 'transport' && (a.subtype === 'car' || /drive|road trip|rental/i.test(`${a.name} ${a.detail}`)));

  // ── Essentials (always) ──────────────────────────────────────────────────
  add('phone-charger', 'Phone & charger', 'Electronics', 'Never leave home without it');
  add('wallet', 'Wallet & cards', 'Essentials', 'Cash + a backup card');
  add('id', 'Photo ID', 'Documents', 'Required to travel');
  add('meds', 'Any medications', 'Health', 'Pack enough for the whole trip');
  add('toothbrush', 'Toothbrush & toiletries', 'Toiletries', `${nights} night${nights !== 1 ? 's' : ''} away`);
  add('underwear', `Underwear ×${Math.min(nights + 1, 10)}`, 'Clothing', `~1 per day for ${nights} night${nights !== 1 ? 's' : ''}`);
  add('tops', `Tops ×${Math.min(Math.ceil(nights * 0.8) + 1, 9)}`, 'Clothing', 'Mix-and-match for the trip length');
  add('reusable-bottle', 'Reusable water bottle', 'Essentials', 'Stay hydrated, skip the plastic');

  // ── Flights ────────────────────────────────────────────────────────────────
  if (hasFlight) {
    add('headphones', 'Headphones', 'Electronics', 'For the flight');
    add('powerbank', 'Power bank', 'Electronics', 'Airports + long days out');
    add('snacks-flight', 'Travel snacks', 'Essentials', 'Beat the in-flight prices');
  }
  if (redEye) {
    add('eye-mask', 'Eye mask & neck pillow', 'Essentials', 'You have an overnight (red-eye) flight');
    add('layer-plane', 'A warm layer', 'Clothing', 'Cabins get cold overnight');
  }
  if (hasDrive) {
    add('car-charger', 'Car phone mount / charger', 'Electronics', 'You have a road-trip leg');
    add('sunglasses-drive', 'Sunglasses', 'Clothing', 'For the drive');
  }

  // ── International ────────────────────────────────────────────────────────────
  if (international) {
    add('passport', 'Passport', 'Documents', 'International trip — different region from home');
    add('adapter', 'Power adapter', 'Electronics', 'Foreign outlets differ from home');
    add('currency', 'Local currency / travel card', 'Documents', 'Some places are cash-only abroad');
  }

  // ── Season / weather ─────────────────────────────────────────────────────────
  if (season === 'summer') {
    add('sunscreen', 'Sunscreen', 'Toiletries', 'Summer sun');
    add('hat', 'Sun hat & sunglasses', 'Clothing', 'Summer sun');
    add('light-clothes', 'Light, breathable clothing', 'Clothing', 'Warm season');
  } else if (season === 'winter') {
    add('jacket', 'Warm jacket', 'Clothing', 'Cold season');
    add('gloves', 'Hat, gloves & scarf', 'Clothing', 'Cold season');
    add('thermals', 'Thermal layers', 'Clothing', 'Cold season');
  } else {
    add('layers', 'Layers (it changes)', 'Clothing', `${season || 'Shoulder-season'} weather swings`);
  }

  // ── Activity-specific (the contextual delight) ──────────────────────────────
  if (has(RE.beach)) {
    add('swimsuit', 'Swimsuit', 'Activities', 'You have beach / water plans');
    add('beach-sunscreen', 'Reef-safe sunscreen', 'Toiletries', 'You have beach / water plans');
    add('sandals', 'Sandals & a quick-dry towel', 'Activities', 'You have beach / water plans');
  }
  if (has(RE.hike)) {
    add('hiking-shoes', 'Hiking shoes', 'Activities', 'You have hikes / nature stops');
    add('daypack', 'Daypack & water', 'Activities', 'You have hikes / nature stops');
    add('bugspray', 'Bug spray', 'Toiletries', 'You have outdoor / nature stops');
  }
  if (has(RE.themepark)) {
    add('comfy-shoes', 'Comfortable walking shoes', 'Activities', 'A theme-park / zoo day means lots of walking');
    add('poncho', 'Compact rain poncho', 'Activities', 'Handy for parks + rides');
  }
  if (has(RE.snow)) {
    add('snow-gear', 'Snow jacket, gloves & goggles', 'Activities', 'You have snow / ski plans');
    add('warm-socks', 'Wool socks & base layers', 'Clothing', 'You have snow / ski plans');
  }
  if (has(RE.fancy) || has(RE.formalish)) {
    add('nice-outfit', 'One smart outfit', 'Clothing', 'You have a nice dinner / show booked');
  }
  if (hasType('food')) {
    add('antacid', 'Antacids / stomach kit', 'Health', "Trying new food? Be ready");
  }

  // ── Travelers ───────────────────────────────────────────────────────────────
  if (hasInfant) {
    add('diapers', 'Diapers, wipes & changing mat', 'Kids', 'Traveling with an infant');
    add('formula', 'Formula / baby food & bottles', 'Kids', 'Traveling with an infant');
    add('stroller', 'Stroller / carrier', 'Kids', 'Traveling with an infant');
  }
  if (hasKid && !hasInfant) {
    add('kid-snacks', 'Kid snacks & water', 'Kids', "There's a child on this trip");
    add('kid-entertain', 'Tablet / books / small toys', 'Kids', 'For travel downtime with kids');
  }
  if (needsAccess) {
    add('access-kit', 'Accessibility documents & spares', 'Health', 'A traveler uses a wheelchair / mobility aid');
  }

  const byCategory = CATEGORIES
    .map(cat => ({ category: cat, items: out.filter(i => i.category === cat) }))
    .filter(g => g.items.length);

  return { items: out, byCategory };
}
