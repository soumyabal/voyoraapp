/**
 * destinationImage.js — a free destination photo from Wikipedia. No API key, no
 * billing (unlike Google Places photos). Returns the destination's lead image +
 * a page link for attribution.
 *
 * Wikipedia content is CC-licensed, so — with a visible "via Wikipedia" credit —
 * it's legal to display. Image URLs (upload.wikimedia.org) are keyless.
 *
 * Wikimedia 403s the default RN/okhttp User-Agent on BOTH the REST API and the
 * image CDN, so requests must send WIKI_UA. JS fetch honors it (so the summary
 * works); the <Image> loader honors source headers on iOS but not always on
 * Android (Fresco) — the hero degrades to a plain colored banner there.
 *
 * In-memory cached per session (Wikipedia is free, so re-fetching across sessions
 * is fine). A persistent offline cache / PDF embedding would need a download path
 * that reliably carries the UA — deferred (a backend image proxy is the clean fix).
 */

const cache = new Map(); // normalized city -> { imageUrl, title, pageUrl } | null
export const WIKI_UA = 'Kithova/1.0 (multi-family trip planner)';

// "San Diego, California, USA" → "San Diego" (match the search/city-tag convention)
const cityOf = (s) => (s || '').split(',')[0].trim();

// Title candidates to try, in order: the bare city, then "City, Region". Many
// cities ("Wisconsin Dells") are a DISAMBIGUATION page on their own and only
// resolve to a photo with the region suffix ("Wisconsin Dells, Wisconsin").
function candidates(place) {
  const parts = (place || '').split(',').map(s => s.trim()).filter(Boolean);
  const out = [];
  if (parts[0]) out.push(parts[0]);
  if (parts[0] && parts[1]) out.push(`${parts[0]}, ${parts[1]}`);
  return out;
}

async function fetchOne(title) {
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { Accept: 'application/json', 'User-Agent': WIKI_UA, 'Api-User-Agent': WIKI_UA } },
  );
  if (!res.ok) return null;
  const d = await res.json();
  if (d.type === 'disambiguation') return null;   // no real lead image
  // Thumbnail as-is (~320px, fine for a banner). Up-scaling the URL 400s on some.
  const imageUrl = d?.thumbnail?.source || d?.originalimage?.source || null;
  if (!imageUrl) return null;
  return {
    imageUrl,
    title: d.title || title,
    pageUrl: d?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

export async function fetchDestinationImage(place) {
  const key = cityOf(place);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    for (const title of candidates(place)) {
      out = await fetchOne(title);
      if (out) break;
    }
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
}

// ── Wikimedia Commons image search (free, CC-licensed) ───────────────────────
// A SECOND free image source for places without a clean Wikipedia article (a specific
// POI, a small town): search the Commons File namespace and take the first real PHOTO.
// We skip maps / flags / logos / SVGs so a landmark gets a photo, not a locator map.
const commonsCache = new Map();
const NON_PHOTO_RE = /\b(map|flag|logo|icon|coat[\s_-]?of[\s_-]?arms|locator|seal|diagram|chart|emblem|banner|svg)\b/i;

export async function fetchCommonsImage(name, deps = {}) {
  const q = String(name || '').trim();
  if (!q) return null;
  if (commonsCache.has(q)) return commonsCache.get(q);
  const doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return null;

  let out = null;
  try {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
      + '&generator=search&gsrnamespace=6&gsrlimit=8'
      + `&gsrsearch=${encodeURIComponent(q)}`
      + '&prop=imageinfo&iiprop=url&iiurlwidth=640';
    const res = await doFetch(url, { headers: { Accept: 'application/json', 'User-Agent': WIKI_UA, 'Api-User-Agent': WIKI_UA } });
    if (res.ok) {
      const d = await res.json();
      const pages = d?.query?.pages ? Object.values(d.query.pages) : [];
      pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));   // keep search relevance order
      for (const p of pages) {
        const title = p.title || '';
        const info = p.imageinfo && p.imageinfo[0];
        const thumb = info && info.thumburl;
        if (!thumb || /\.svg(\?|$)/i.test(thumb)) continue;       // need a raster thumbnail
        if (NON_PHOTO_RE.test(title)) continue;                   // skip maps/flags/logos
        out = {
          imageUrl: thumb,
          title: title.replace(/^File:/, ''),
          pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
        };
        break;
      }
    }
  } catch {
    out = null;
  }
  commonsCache.set(q, out);
  return out;
}
