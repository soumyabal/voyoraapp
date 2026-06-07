/**
 * itineraryParser.js — PROOF OF CONCEPT (spike, not production) for docs/smart-paste-import.md.
 *
 * Deterministic, pure, no AI, no API: turns a pasted natural-language itinerary (Gemini/ChatGPT
 * style) into a STRUCTURED intermediate — segments, dated days, and per-line items classified by
 * type with candidate place names extracted. This is stages A–C + the type classifier of the
 * pipeline; entity RESOLUTION (Google Places) + trip assembly + the review UI are the remaining
 * (estimated) work. It exists to prove the structure parse is reliable and to calibrate effort.
 *
 * It does NOT claim perfect entity extraction — that's the documented hard part. See the doc.
 */

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// Action lexicon → activity type (first match wins). The seed of the "knowledge graph".
const TYPE_RULES = [
  { type: 'transport', sub: 'flight', re: /\b(fly|flight|flights|land|landing|airport|catch your flight|board|depart|\bLAX\b|\bORD\b|\bSFO\b|\bJFK\b)\b/i },
  { type: 'transport', sub: 'car',    re: /\b(drive|driving|drove|rental car|road trip|head south|head north|coastal drive|pacific coast highway|\bPCH\b|\bI-5\b|cruise along|rent(?:ing)? a bike|cross the bridge)\b/i },
  { type: 'stay',      sub: null,     re: /\b(check ?in|check ?out|hotel|resort|lodge|\binn\b|accommodation|where you'?re staying)\b/i },
  { type: 'food',      sub: null,     re: /\b(breakfast|brunch|lunch|dinner|dining|restaurant|cuisine|\beat\b|\bcafe\b|coffee|grab a bite|food)\b/i },
];
export function classifyType(text) {
  for (const r of TYPE_RULES) if (r.re.test(text)) return { type: r.type, sub: r.sub };
  return { type: 'activity', sub: null };
}

// Alias / abbreviation expansion (part of the KG — small + curated, grows over time).
export const ALIASES = {
  PCH: 'Pacific Coast Highway',
  LACMA: 'Los Angeles County Museum of Art',
  'the Getty': 'Getty Center',
};

// Capitalised phrases that are NOT places (events, generic descriptors, roads we don't stop AT).
const NON_PLACES = new Set([
  'Independence Day', 'Big Bay Boom', 'Spanish Renaissance', 'Pacific Coast Highway',
  'Arrival', 'Option A', 'Option B', 'Surf City Usa', 'Surf City USA',
]);

// Suffixes that strongly mark a real POI even for a single capitalised run.
const PLACE_SUFFIX = /\b(Pier|Park|Beach|Observatory|Zoo|Center|Centre|Museum|Cove|Cliffs|Island|Quarter|Mission|Studios|Gardens|Bay|Bridge|Cathedral|Market|Square|Hotel)\b/;

// Sentence-initial imperative verbs that get swept into a Title-Case run ("Visit La Jolla Cove",
// "Explore the Griffith Observatory") — strip them (and leading articles) off candidate phrases.
const LEADING_VERBS = new Set([
  'Visit', 'Explore', 'Spend', 'Hike', 'Drive', 'Head', 'Stroll', 'Stretch', 'Catch', 'Grab',
  'Dedicate', 'Walk', 'See', 'Relax', 'Dive', 'Cruise', 'Watch', 'Enjoy', 'Land', 'Take', 'Go',
  'Check', 'Stop', 'Arrive', 'Find', 'Make', 'Discover', 'Tour', 'Wander', 'Browse',
]);

const MONTH_RE = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\b`, 'i');
const WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

function toISO(monthName, day, year) {
  const mo = MONTHS[monthName.toLowerCase()];
  if (mo == null) return null;
  return `${year}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Today (local) as YYYY-MM-DD — the base date for "Day 1/2/3" itineraries with no calendar dates.
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Wall-of-text rescue: pasted text often loses newlines (markers run together). Insert a line
// break before each STRONG header/marker (those carrying a colon / paren / dash, so we don't
// split mid-sentence). Idempotent on already-newlined text (extra blank lines are filtered).
function presegment(text) {
  const monthAlt = Object.keys(MONTHS).join('|');
  return String(text || '')
    .replace(/\s+(Segment\s+\d+\s*:)/g, '\n$1')
    .replace(/\s+(Day\s+\d+\s*[:\-–(])/g, '\n$1')
    .replace(/\s+(Stop\s+\d+\s*\()/g, '\n$1')
    .replace(/\s+(Option\s+[A-Z]\s*:)/g, '\n$1')
    .replace(/\s+(Morning|Afternoon|Evening|Night)(\s*:)/g, '\n$1$2')
    .replace(new RegExp(`\\s+((?:${monthAlt})\\s+\\d{1,2}\\s*:)`, 'gi'), '\n$1');
}

// Strip common markdown/bullets so pasted ChatGPT/Gemini output parses: leading "-", "*", "•",
// "+", "1.", "#" headings, and **bold**/__bold__ markers.
function normalizeLine(line) {
  return line
    .replace(/^\s*[-*•+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .trim();
}

/**
 * Pull candidate place names from a line: runs of Capitalised words (allowing lowercase
 * connectors de/del/of/the), kept when they have ≥2 capitalised tokens OR carry a POI suffix.
 * Heuristic by design — see the doc's "what's hard" section. Returns a de-duped array.
 */
export function extractCandidates(text) {
  if (!text) return [];
  const out = [];
  const re = /[A-Z][a-zA-Z'’.]+(?:\s+(?:del|de|of|the|[A-Z][a-zA-Z'’.]+))*/g;
  let m;
  while ((m = re.exec(text)) != null) {
    let phrase = m[0]
      .replace(/[.,;:!?'"’]+$/, '')          // drop trailing punctuation ("Venice Beach." → "Venice Beach")
      .replace(/\s+(of|the|de|del)$/i, '')    // drop trailing connectors
      .trim();
    // strip leading imperative verbs + articles ("Visit La Jolla Cove" → "La Jolla Cove")
    let toks = phrase.split(/\s+/);
    while (toks.length && (LEADING_VERBS.has(toks[0]) || /^(the|a|an|of|de|del)$/i.test(toks[0]))) toks.shift();
    phrase = toks.join(' ');
    if (!phrase) continue;
    const capTokens = phrase.split(/\s+/).filter(w => /^[A-Z]/.test(w));
    const keep = capTokens.length >= 2 || PLACE_SUFFIX.test(phrase);
    if (!keep) continue;
    if (NON_PLACES.has(phrase)) continue;
    if (MONTH_RE.test(phrase) || WEEKDAY_RE.test(phrase)) continue;
    if (!out.includes(phrase)) out.push(phrase);
  }
  // Alias hits (e.g. "PCH", "LACMA") even when not Title-Case runs.
  for (const [alias, full] of Object.entries(ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(text) && !out.includes(full)) out.push(full);
  }
  return out;
}

/**
 * Parse a pasted itinerary into { segments, days, warnings }. Deterministic + pure.
 *   opts.year — base year for bare "July 3" dates (default 2026 for the spike).
 */
export function parseItineraryText(text, opts = {}) {
  const year = opts.year || 2026;
  const base = opts.startDate || todayISO();   // base date for "Day N" (no-calendar) itineraries
  const lines = presegment(text).split(/\r?\n/).map(l => normalizeLine(l)).filter(Boolean);

  const segments = [];
  const days = [];
  const warnings = [];
  let curSegment = null;
  let curDay = null;

  const reSegment = /^Segment\s+\d+\s*:\s*(.+?)\s*\((.+?)\)\s*$/i;
  const reDayN    = /^Day\s+(\d+)\b\s*[:\-–(]?\s*(.*)$/i;          // "Day 1: …" / "Day 1 – …" / "Day 1 (July 1): …"
  const reDay     = /^([A-Za-z]+)\s+(\d{1,2})\s*:\s*(.+)$/;        // "July 1: Hollywood & ..."
  const reSlot    = /^(Morning|Afternoon|Evening|Night)\s*:\s*(.+)$/i;
  const reStop    = /^Stop\s+\d+\s*\(([^)]+)\)\s*:\s*(.+)$/i;
  const reOption  = /^Option\s+([A-Z])\s*:\s*(.+)$/i;
  const reTime    = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

  const pushItem = (item) => {
    if (!curDay) { warnings.push(`Orphan line (no day yet): "${item.text.slice(0, 40)}"`); return; }
    curDay.items.push(item);
  };

  for (const line of lines) {
    let m;
    if ((m = line.match(reSegment))) {
      const name = m[1];
      const cityHit = name.match(/(Los Angeles|San Diego|San Francisco|New York|Chicago)/i);
      curSegment = { name, dateText: m[2], city: cityHit ? cityHit[1] : name };
      segments.push(curSegment);
      continue;
    }
    if ((m = line.match(reDayN))) {
      // "Day N" itineraries (very common in AI output): use an embedded calendar date if present,
      // else synthesise consecutive dates from the base (Day 1 = base, Day 2 = base+1, …).
      const n = parseInt(m[1], 10);
      let rest = (m[2] || '').replace(/^\)?\s*[:\-–]?\s*/, '').replace(/\)\s*$/, '').trim();
      const dm = rest.match(/([A-Za-z]+)\s+(\d{1,2})/);
      const date = (dm && MONTHS[dm[1].toLowerCase()] != null) ? toISO(dm[1], parseInt(dm[2], 10), year) : addDaysISO(base, n - 1);
      const title = rest || `Day ${n}`;
      curDay = { date, dateText: `Day ${n}`, title, segment: curSegment?.city || null, items: [] };
      days.push(curDay);
      const cands = extractCandidates(title);
      if (cands.length) curDay.titleCandidates = cands;
      continue;
    }
    if ((m = line.match(reDay)) && MONTHS[m[1].toLowerCase()] != null) {
      const date = toISO(m[1], parseInt(m[2], 10), year);
      curDay = { date, dateText: `${m[1]} ${m[2]}`, title: m[3], segment: curSegment?.city || null, items: [] };
      days.push(curDay);
      // the title itself often names places ("…& Griffith Observatory")
      const cands = extractCandidates(m[3]);
      if (cands.length) curDay.titleCandidates = cands;
      continue;
    }
    if ((m = line.match(reStop))) {
      const place = m[1].trim();
      const { type } = classifyType(`${place} ${m[2]}`);
      pushItem({ kind: 'stop', slot: null, text: line, place, type, candidates: [place, ...extractCandidates(m[2])].filter((v, i, a) => a.indexOf(v) === i) });
      continue;
    }
    if ((m = line.match(reOption))) {
      const { type, sub } = classifyType(m[2]);
      pushItem({ kind: 'option', optionKey: m[1].toUpperCase(), slot: null, text: m[2], type, sub, candidates: extractCandidates(m[2]) });
      continue;
    }
    if ((m = line.match(reSlot))) {
      const body = m[2];
      const { type, sub } = classifyType(body);
      const tm = body.match(reTime);
      pushItem({ kind: 'slot', slot: m[1].toLowerCase(), text: body, type, sub, time: tm ? tm[0] : null, candidates: extractCandidates(body) });
      continue;
    }
    // Plain narrative line under a day → an item (split lightly on sentence boundaries).
    const { type, sub } = classifyType(line);
    const tm = line.match(reTime);
    pushItem({ kind: 'line', slot: null, text: line, type, sub, time: tm ? tm[0] : null, candidates: extractCandidates(line) });
  }

  if (!days.length) warnings.push('No dated day headers found — could not segment into days.');
  return { segments, days, warnings };
}
