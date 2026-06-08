/**
 * demoLab.js — DEV-ONLY AI demo-trip generator (never ships; gated by __DEV__ at the call site).
 *
 * Two stages, both via the owner's Claude API key, to test the FULL Smart Paste pipeline on
 * realistic AI prose end-to-end:
 *   1. GENERATE — a one-line request ("7-day NYC to Tokyo trip…") → a shareable day-by-day
 *      itinerary, the kind ChatGPT/Gemini produce (plain text, NOT JSON).
 *   2. EXTRACT + BUILD — feed that prose into the existing importTripFromTextAsync → a real trip.
 *
 * So tapping a prompt on device exercises exactly what a user pasting an AI plan would hit. The
 * generator reads config.CLAUDE_API_KEY (like the extractor) and is INJECTABLE (deps) for tests —
 * no real network in CI. Cost: ~2 cheap Haiku calls per demo.
 */
import { CLAUDE_API_KEY, CLAUDE_MODEL, CLAUDE_API_URL } from '../config';
import { importTripFromTextAsync } from './itineraryImport';

// Curated starter set — high-value scenarios spanning timezones, multi-country, road trips,
// single-city, year-boundary, theme parks, beaches, parks, and group travel. Edit freely.
export const DEMO_PROMPTS = [
  { id: 'intl-tz',       title: '🗾 NYC → Tokyo (7d, timezone)',     text: '7-day trip from New York City to Tokyo, Japan. Give me a consolidated day-by-day itinerary I can share, including the flights.' },
  { id: 'europe-multi',  title: '🇪🇺 Paris·Rome·Barcelona (10d)',    text: '10-day trip across Paris, Rome, and Barcelona. Consolidated day-by-day itinerary with the train/flight legs between cities.' },
  { id: 'road-trip',     title: '🚗 Dallas → Mackinac (10d road)',   text: '10-day road trip from Dallas to Mackinac Island, Michigan, with stops in St. Louis and Chicago, driving my own car. Day-by-day itinerary.' },
  { id: 'single-city',   title: '🗽 NYC long weekend (4d)',          text: 'A 4-day long weekend in New York City. Consolidated day-by-day itinerary.' },
  { id: 'new-year',      title: '🎆 Las Vegas over New Year',        text: 'A trip to Las Vegas from December 29 to January 3 for New Year. Day-by-day itinerary with the dates.' },
  { id: 'theme-park',    title: '🎢 Orlando Disney family (5d)',     text: '5-day Walt Disney World family trip in Orlando. Day-by-day itinerary.' },
  { id: 'beach',         title: '🏝️ Maui beach week (6d)',           text: '6-day relaxed beach vacation in Maui, Hawaii. Day-by-day itinerary.' },
  { id: 'natl-parks',    title: '🏜️ Utah parks road trip (7d)',      text: '7-day Utah national parks road trip — Zion, Bryce Canyon, and Arches. Day-by-day driving itinerary.' },
  { id: 'asia-multi',    title: '🌏 Tokyo·Bangkok·Singapore (12d)',  text: '12-day trip across Tokyo, Bangkok, and Singapore. Day-by-day itinerary with the flights between them.' },
  { id: 'group-trip',    title: '👨‍👩‍👧 London + Paris w/ kids (8d)',   text: '8-day family trip to London and Paris with two kids, taking the Eurostar between them. Day-by-day itinerary.' },
];

const SYSTEM_PROMPT = `You are a helpful travel planner. Given a trip request, produce a CONSOLIDATED, day-by-day itinerary the user can share — exactly the kind ChatGPT or Gemini would output.
- Use clear day headers. If the request gives or implies dates, use real calendar dates (assume the trip starts about a month after the current date below unless told otherwise). Otherwise use "Day 1, Day 2, …".
- Use Morning / Afternoon / Evening sections, and NAME real attractions, restaurants, hotels, and transport (flights, drives, trains, ferries).
- Keep it realistic and reasonably concise — a few stops per day.
- Output PLAIN TEXT / light markdown — NOT JSON, no code fences.`;

/**
 * Generate shareable itinerary prose for a request. Returns the text, or null (no key / failure).
 * `deps.fetch`, `deps.today`, `deps.timeoutMs` are injectable for tests. Never throws.
 */
export async function generateItineraryText(prompt, deps = {}) {
  if (!CLAUDE_API_KEY || !prompt || !String(prompt).trim()) return null;
  const doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;
  const today = deps.today || new Date().toISOString().slice(0, 10);
  const timeoutMs = deps.timeoutMs || 30000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await doFetch(CLAUDE_API_URL, {
      method: 'POST',
      signal: controller ? controller.signal : undefined,
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Current date: ${today}\n\nTrip request: ${String(prompt).trim()}` }],
      }),
    });
    if (!res.ok) { console.warn('[demoLab] generate API error', res.status); return null; }
    const data = await res.json();
    return data?.content?.[0]?.text || null;
  } catch (err) {
    console.warn('[demoLab] generate failed:', err?.message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Full demo build: GENERATE prose → EXTRACT + assemble (the real paste pipeline). Returns
 * { trip, summary, source, generated } or null. `deps.generate` / `deps.extract` are injectable
 * (tests pass fakes → no network). `store` is a zustand getState() snapshot.
 */
export async function buildDemoTrip(store, prompt, deps = {}) {
  const generate = deps.generate || generateItineraryText;
  const text = await generate(prompt, deps);
  if (!text || !String(text).trim()) return null;
  const res = await importTripFromTextAsync(store, text, deps);
  return res ? { ...res, generated: text } : null;
}
