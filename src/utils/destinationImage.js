/**
 * destinationImage.js — a free destination photo from Wikipedia. No API key, no
 * billing (unlike Google Places photos). Returns the destination's lead image +
 * a page link for attribution.
 *
 * Wikipedia content is CC-licensed, so — with a visible "via Wikipedia" credit —
 * it's legal to display AND to cache/embed (the thing Google Places photos
 * forbid). Image URLs (upload.wikimedia.org) are keyless → safe to share.
 *
 * PURE-ish: one GET to the public REST summary endpoint, in-memory cached so the
 * same city isn't re-fetched in a session. No secrets transmitted (just a city
 * name, like the Places search).
 */

const cache = new Map(); // normalized city -> { imageUrl, title, pageUrl } | null

// Wikimedia 403s the default RN/okhttp User-Agent (on BOTH the REST API and the
// upload CDN), so every request — incl. the <Image> load — must send this.
export const WIKI_UA = 'Voyara/1.0 (multi-family trip planner)';

// "San Diego, California, USA" → "San Diego" (match the search/city-tag convention)
const cityOf = (s) => (s || '').split(',')[0].trim();

export async function fetchDestinationImage(place) {
  const q = cityOf(place);
  if (!q) return null;
  if (cache.has(q)) return cache.get(q);
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json', 'User-Agent': WIKI_UA, 'Api-User-Agent': WIKI_UA } },
    );
    if (!res.ok) { cache.set(q, null); return null; }
    const d = await res.json();
    // Use the API's thumbnail as-is (~320px — fine for a banner). Requesting a
    // larger size by rewriting the URL 400s on some images, so don't.
    const imageUrl = d?.thumbnail?.source || d?.originalimage?.source || null;
    const out = imageUrl
      ? {
          imageUrl,
          title: d.title || q,
          pageUrl: d?.content_urls?.desktop?.page
            || `https://en.wikipedia.org/wiki/${encodeURIComponent(q)}`,
        }
      : null;
    cache.set(q, out);
    return out;
  } catch {
    cache.set(q, null);
    return null;
  }
}
