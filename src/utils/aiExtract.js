/**
 * aiExtract.js — the LLM extractor for Smart Paste (the injected `extract` for itineraryExtract).
 *
 * Turns free-form pasted itinerary text into the EXTRACTION CONTRACT JSON (see itineraryExtract.js),
 * which the deterministic normalizer + assembler then turn into a real trip. This is the ONE place
 * AI is used in Smart Paste — and only for UNDERSTANDING, never for generating a plan.
 *
 * Key handling: reads config.CLAUDE_API_KEY (owner-provided, like the Google key). With no key it
 * returns null → the seam falls back to the deterministic rules parser, so paste ALWAYS works.
 * No key value lives here; nothing is hard-coded. Cost: one cheap Haiku call per paste.
 */
import { CLAUDE_API_KEY, CLAUDE_MODEL, CLAUDE_API_URL } from '../config';

const SYSTEM_PROMPT = `You convert a pasted travel itinerary (from ChatGPT, Gemini, a blog, or notes) into STRICT JSON. Output ONLY the JSON object — no prose, no markdown fences.

Schema:
{
  "tripName": string (optional),
  "destination": string (optional),
  "days": [
    {
      "date": "YYYY-MM-DD" (only if the text gives a real date),
      "dayNumber": integer (1-based, if no calendar date),
      "title": string (optional),
      "city": string (the day's city/area, if known),
      "items": [
        {
          "name": string (the place or action, e.g. "Griffith Observatory", "Land at LAX"),
          "type": "activity" | "food" | "stay" | "transport",
          "sub": "flight" | "car" | "train" (optional, for transport),
          "time": "HH:MM" (24h, only if stated),
          "arriveTime": "HH:MM" (transport arrival, only if stated),
          "option": "A" | "B" (only for mutually-exclusive alternatives),
          "city": string (optional)
        }
      ]
    }
  ]
}

Rules:
- Extract EVERY day and EVERY stop you can find; keep them in order.
- Classify type from the wording: flights/airports/"land"→transport(flight); drive/road trip/PCH→transport(car); breakfast/lunch/dinner/dining→food; hotel/check-in/check-out→stay; everything else→activity.
- Use dayNumber when there's no explicit date. Do NOT invent dates or places.
- Keep names short and real (the place itself), not whole sentences.
- If unsure of a field, omit it. Output valid JSON only.`;

// Pull the first balanced JSON object out of a model reply (handles ``` fences / stray prose).
export function extractJsonObject(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Call Claude to extract the contract JSON from `text`. Returns the parsed object, or null when
 * there's no key / the call fails / the reply can't be parsed (caller then falls back to rules).
 * `deps.fetch` is injectable for tests.
 */
export async function extractItineraryViaClaude(text, deps = {}) {
  if (!CLAUDE_API_KEY || !text || !String(text).trim()) return null;
  const doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;

  try {
    const res = await doFetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: String(text).slice(0, 12000) }],
      }),
    });
    if (!res.ok) {
      console.warn('[aiExtract] Claude API error', res.status);
      return null;
    }
    const data = await res.json();
    const reply = data?.content?.[0]?.text;
    return extractJsonObject(reply);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[aiExtract] extract failed:', err?.message);
    return null;
  }
}
