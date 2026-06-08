/**
 * itineraryImport.js — stage E of docs/smart-paste-import.md: turn a PARSED itinerary
 * (itineraryParser) into a real Voyara trip, DETERMINISTICALLY and OFFLINE (no AI, no API).
 *
 * This is the heart of "paste an AI plan → get the whole trip with zero data entry." It builds
 * the trip through the normal store actions (createTrip + addActivity) so it matches the live
 * schema exactly. Places RESOLUTION (coords/hours/cost via Google Places — which would also light
 * up the timezone features) is a deliberate later enhancement; this layer produces a complete
 * day-by-day skeleton (dates, slots, names, types, times) that the user reviews + enriches.
 */
import { parseItineraryText, classifyType } from './itineraryParser';
import { extractItinerary } from './itineraryExtract';
import { extractItineraryViaClaude } from './aiExtract';
import { minToTime } from './slots';
import { lookupPlace } from './gazetteer';

const SLOT_BASE = { morning: 9 * 60, afternoon: 13 * 60, evening: 18 * 60, night: 21 * 60 };

// "9:00 PM" / "9 PM" / "21:00" → minutes-of-day, or null.
function parseClock(s) {
  const m = String(s || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3] ? m[3].toLowerCase() : null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// A human name for an activity: the named stop, else the best candidate place, else the first
// clause of the source line (so "Land at LAX, grab your rental car…" → "Land at LAX").
function nameForItem(item) {
  if (item.place) return item.place;
  if (item.candidates && item.candidates.length) return item.candidates[0];
  const first = String(item.text || '').split(/[,.;:]/)[0].trim();
  return (first || 'Activity').slice(0, 60);
}

/**
 * Build a trip from a PARSED itinerary. PURE w.r.t. inputs (all writes go through the passed
 * store's actions). Returns the created trip, or null when there are no dated days.
 *   opts = { name?, familyForms?, origin? }
 */
export function buildTripFromParsed(store, parsed, opts = {}) {
  const days = parsed?.days || [];
  if (!days.length) return null;

  const cities = (parsed.segments || []).map(s => s.city).filter(Boolean);
  const trip = store.createTrip({
    name: opts.name || parsed.tripName || `${cities[0] || 'Imported'} trip`,
    destination: parsed.destination || cities.join(' · ') || (cities[0] || 'Imported'),
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
    mode: 'manual',
    pace: 'moderate',
    budget: 'mid-range',
    focus: [],
    origin: opts.origin || null,
    familyForms: opts.familyForms || [{ name: 'My Family', members: [{ name: 'Traveler 1', age: '30' }] }],
  });

  const idxByDate = {};
  trip.days.forEach((d, i) => { idxByDate[d.date] = i; });

  let imported = 0;
  let unplaced = 0;   // lines we couldn't confidently turn into a stop (kept as notes)
  for (const pd of days) {
    const di = idxByDate[pd.date];
    if (di == null) continue;
    const slotCount = {};
    let cursor = 9 * 60;   // fallback sequential time for slot-less lines
    const segGeo = pd.segment ? lookupPlace(pd.segment) : null;   // day's city → coords fallback
    // Terse / wall-of-text formats glue the content onto the day-header line → it lands in the
    // title with no separate items. Rather than leave the day empty, synthesise one item from the
    // title (classified). Never fires on well-structured pastes (they already have items).
    let dayItems = pd.items;
    if (!dayItems.length && pd.title && pd.title.trim()) {
      const tt = pd.title.trim();
      const { type, sub } = classifyType(tt);
      dayItems = [{ kind: 'line', optionKey: null, type, sub, time: null, arriveTime: null, slot: null, place: tt, text: tt, candidates: [tt], city: null }];
    }
    for (const item of dayItems) {
      // Decide a time: explicit > slot-based (staggered) > sequential fallback.
      let mins = parseClock(item.time);
      if (mins == null && item.slot && SLOT_BASE[item.slot] != null) {
        const c = slotCount[item.slot] || 0;
        mins = SLOT_BASE[item.slot] + c * 90;
        slotCount[item.slot] = c + 1;
      }
      if (mins == null) { mins = cursor; cursor += 90; }
      mins = Math.min(mins, 23 * 60 + 30);

      const act = {
        type: item.type || 'activity',
        time: minToTime(mins),
        name: nameForItem(item),
        detail: item.kind === 'option' ? `Option ${item.optionKey}` : '',
        costPerPerson: 0,
      };
      if (item.sub) act.subtype = item.sub;
      if (item.type === 'stay') act.nights = 1;

      // Offline coords from the gazetteer (airport codes / major cities) — no API. Gives flights
      // + city stops real lat/lng so the timezone features light up; specific POIs still need
      // Places resolution later. Try the name, then the source text, then candidate places.
      const geo = lookupPlace(act.name)
        || lookupPlace(item.text)
        || (item.candidates || []).map(lookupPlace).find(Boolean)
        || segGeo;   // fall back to the segment's city so a known-city stop still gets its zone
      if (geo) { act.lat = geo.lat; act.lng = geo.lng; }
      // Option B (and beyond) are alternatives → import as skipped so the choice is visible
      // without double-booking the day.
      if (item.kind === 'option' && item.optionKey && item.optionKey !== 'A') act.status = 'skipped';

      // A plain narrative line with no place + no recognised type stays a soft note rather than a
      // phantom activity.
      const isVague = !item.place && (!item.candidates || !item.candidates.length) && item.type === 'activity' && item.kind === 'line';
      if (isVague) { act.type = 'note'; unplaced += 1; }

      store.addActivity(trip.id, di, act);
      imported += 1;
    }
  }

  return { trip, summary: { days: days.length, imported, unplaced } };
}

/** Convenience: parse raw text (DETERMINISTIC rules only) then build the trip in one call. */
export function importTripFromText(store, text, opts = {}) {
  const parsed = parseItineraryText(text, opts);
  return buildTripFromParsed(store, parsed, opts);
}

/**
 * The full Smart-Paste path: AI extraction when a key is present (richer understanding of messy
 * text), else the deterministic rules parser — then the same assembler. Returns { trip, summary,
 * source } where source is 'ai' | 'rules'. `opts.extract` overrides the extractor (tests inject a
 * fake); by default it uses the Claude extractor (which itself no-ops without a key).
 */
export async function importTripFromTextAsync(store, text, opts = {}) {
  const extract = opts.extract || extractItineraryViaClaude;
  const parsed = await extractItinerary(text, { ...opts, extract });
  const built = buildTripFromParsed(store, parsed, opts);
  return built ? { ...built, source: parsed.source || 'rules' } : null;
}
