/**
 * itineraryExtract.js — the AI-ready front-half of Smart Paste (deterministic part only).
 *
 * Decision (owner, 2026-06): robustly UNDERSTANDING free-form pasted text needs an LLM — rules
 * can't. So Smart Paste becomes: [AI extraction → structured JSON] → [deterministic assemble].
 * This module is the DETERMINISTIC glue that makes it "one key away":
 *   1. the EXTRACTION CONTRACT (the JSON shape the LLM must return) — documented below;
 *   2. normalizeExtraction() — repairs/validates loose LLM JSON into the EXACT shape the existing
 *      assembler (itineraryImport.buildTripFromParsed) already consumes, so nothing downstream
 *      changes; and
 *   3. extractItinerary() — the seam: use an INJECTED async extractor when present (the owner wires
 *      the real LLM later, server-side), else fall back to the deterministic rules parser.
 *
 * NO keys, NO network, NO provider here — the LLM is injected. Fully pure + unit-testable.
 *
 * ── EXTRACTION CONTRACT (what the LLM is asked to return) ───────────────────────────────────
 *   {
 *     tripName?:    string,
 *     destination?: string,
 *     days: [{
 *       date?:      "YYYY-MM-DD",     // a real date if the text has one
 *       dayNumber?: number,          // else the 1-based day index ("Day 1/2/3")
 *       title?:     string,
 *       city?:      string,          // the day's city/segment
 *       items: [{
 *         name:       string,                                  // required
 *         type:       "activity"|"food"|"stay"|"transport",   // defaults to activity if missing/bad
 *         sub?:       string,                                  // e.g. "flight" | "car"
 *         time?:      "HH:MM",
 *         arriveTime?:"HH:MM",                                 // transport arrival
 *         option?:    "A"|"B"|...,                             // mutually-exclusive alternative
 *         city?:      string,
 *         note?:      string
 *       }]
 *     }]
 *   }
 */
import { parseItineraryText } from './itineraryParser';

const VALID_TYPES = new Set(['activity', 'food', 'stay', 'transport', 'note']);

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const padTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  const h = Math.min(23, parseInt(m[1], 10));
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function normItem(it) {
  if (!it || typeof it !== 'object') return null;
  const name = str(it.name, 120);
  if (!name) return null;                                  // unnamed → drop (nothing to show)
  const optionKey = /^[A-Za-z]$/.test(it.option) ? String(it.option).toUpperCase() : null;
  return {
    kind: optionKey ? 'option' : 'line',
    optionKey,
    type: VALID_TYPES.has(it.type) ? it.type : 'activity', // unknown/missing → activity
    sub: str(it.sub, 20) || null,
    time: padTime(it.time),
    arriveTime: padTime(it.arriveTime),
    slot: null,
    place: name,
    text: str(it.note, 200) || name,
    candidates: [name],
    city: str(it.city, 80) || null,
  };
}

/**
 * Repair + validate loose LLM extraction JSON into the assembler's `{ segments, days, items }`
 * shape. Synthesises consecutive dates for "dayNumber"-style days (Day 1 = base, +1 each), keeps a
 * real `date` when present, drops junk, never throws. Pure.
 */
export function normalizeExtraction(raw, opts = {}) {
  const base = opts.startDate || todayISO();
  const out = { segments: [], days: [], warnings: [] };
  const rawDays = Array.isArray(raw?.days) ? raw.days : [];
  const segSeen = new Set();

  rawDays.forEach((d, i) => {
    const date = isISODate(d?.date)
      ? d.date
      : addDaysISO(base, Number.isInteger(d?.dayNumber) ? d.dayNumber - 1 : i);
    const city = str(d?.city, 80) || null;
    if (city && !segSeen.has(city)) { segSeen.add(city); out.segments.push({ name: city, city, dateText: '' }); }
    const items = (Array.isArray(d?.items) ? d.items : []).map(normItem).filter(Boolean);
    out.days.push({
      date,
      dateText: isISODate(d?.date) ? d.date : `Day ${i + 1}`,
      title: str(d?.title, 120),
      segment: city,
      items,
    });
  });

  if (!out.days.length) out.warnings.push('Extraction had no usable days.');
  return out;
}

/**
 * The Smart-Paste front-half seam. If `opts.extract` (an async text→contract-JSON function — the
 * LLM, injected by the caller once a key/backend exists) is provided AND yields usable days, use
 * it; otherwise fall back to the deterministic rules parser. Returns the assembler-ready shape
 * plus `source: 'ai' | 'rules'`. Never throws (a failing extractor falls back).
 *
 * Keys/provider/network live in the injected `extract` — NOT here.
 */
export async function extractItinerary(text, opts = {}) {
  if (typeof opts.extract === 'function') {
    try {
      const raw = await opts.extract(text);
      const norm = normalizeExtraction(raw, opts);
      if (norm.days.length) return { ...norm, source: 'ai' };
    } catch {
      // fall through to deterministic
    }
  }
  return { ...parseItineraryText(text, opts), source: 'rules' };
}
