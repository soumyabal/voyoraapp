/**
 * activityPhoto.js — FREE-FIRST photo enrichment for a trip's stops.
 *
 * Pasted / AI-built trips arrive with no imagery. This fills it in WITHOUT the recurring
 * Google bill that got the old per-render backfill removed: it tries Wikipedia (keyless,
 * free) FIRST for every photo-worthy stop, and only falls back to Google Places (billed,
 * cached) for the ones Wikipedia misses — and even that is capped per trip. It runs ONCE,
 * after import, and only on stops that still have no photo, so re-opening the trip never
 * re-fetches (the URL is persisted on the activity).
 *
 * The network sources are INJECTABLE (deps) so the logic is fully unit-testable offline.
 */
import { fetchDestinationImage, fetchCommonsImage } from './destinationImage';
import { fetchPlacePhoto } from './places';
import { photoCacheKey, getCachedPhoto, setCachedPhoto } from './photoCache';

// Generic logistics names that aren't a place to photograph ("Drive to St. Louis",
// "Hotel check-in", "Free time", "Breakfast"). A real attraction/restaurant name passes.
const GENERIC_RE = /^(hotel|check[\s-]?in|check[\s-]?out|drive|driving|fly|flight|ferry|train|bus|road trip|depart|arrive|arrival|leave|head|rest|relax|unpack|pack|free time|breakfast|lunch|dinner|brunch|overnight)\b/i;

/** A stop worth a photo: a named attraction/meal that doesn't already have one. We skip
 *  transport / notes / stays (generic) and obviously-generic action names. PURE. */
export function isPhotoWorthy(act) {
  if (!act || act.photo) return false;
  if (act.status === 'skipped') return false;
  if (act.type === 'transport' || act.type === 'note' || act.type === 'stay') return false;
  const name = String(act.name || '').trim();
  if (name.length < 3) return false;
  if (GENERIC_RE.test(name)) return false;
  return true;
}

/**
 * Best photo URL for one stop, FREE FIRST: Wikipedia thumbnail → Wikimedia Commons → Google
 * Places photo. Returns { url, source: 'wikipedia'|'commons'|'google' } | null. Google is
 * skipped when opts.allowGoogle === false or the stop has no coords. Sources are injectable for
 * tests (opts.fetchWiki / opts.fetchCommons / opts.fetchGoogle). Never throws.
 */
export async function resolveActivityPhoto(act, opts = {}) {
  const name = String(act?.name || '').trim();
  if (!name) return null;
  const fetchWiki = opts.fetchWiki || fetchDestinationImage;
  const fetchCommons = opts.fetchCommons || fetchCommonsImage;
  const fetchGoogle = opts.fetchGoogle || fetchPlacePhoto;

  try {
    const wiki = await fetchWiki(name);
    if (wiki && wiki.imageUrl) return { url: wiki.imageUrl, source: 'wikipedia' };
  } catch { /* free source missed — fall through */ }

  try {
    const commons = await fetchCommons(name);
    if (commons && commons.imageUrl) return { url: commons.imageUrl, source: 'commons' };
  } catch { /* free source missed — fall through */ }

  if (opts.allowGoogle !== false && act?.lat != null && act?.lng != null) {
    try {
      const g = await fetchGoogle(name, act.lat, act.lng);
      if (g) return { url: g, source: 'google' };
    } catch { /* paid source missed — give up gracefully */ }
  }
  return null;
}

/**
 * Enrich a trip's photo-worthy stops ONCE (free-first), writing each URL via
 * store.updateActivity. Fire-and-forget after import — the trip opens immediately and photos
 * pop in as they resolve. Sequential (gentle on the network); the GOOGLE fallback is capped
 * (opts.googleCap, default 12) to bound cost — Wikipedia tries are free so they run for every
 * worthy stop.
 *
 * A PERSISTENT cache (photoCache, AsyncStorage-backed) sits in front: a place resolved on a
 * prior run — hit OR known-miss — is reused with NO network call, so re-pasting the same
 * itinerary across restarts is free. Pass opts.persist === false (or opts.storage = null) to
 * skip persistence; opts.storage injects a backend for tests.
 *
 * Returns { enriched, googleUsed, fromCache }. `store` is a zustand getState() snapshot.
 */
export async function enrichTripPhotos(store, tripId, opts = {}) {
  const trip = (store?.trips || []).find(t => t.id === tripId);
  if (!trip) return { enriched: 0, googleUsed: 0, fromCache: 0 };
  const persist = opts.persist !== false && opts.storage !== null;
  const cacheDeps = { storage: opts.storage };
  const googleCap = opts.googleCap ?? 12;
  let googleUsed = 0;
  let enriched = 0;
  let fromCache = 0;

  for (const day of trip.days || []) {
    for (const act of day.activities || []) {
      if (!isPhotoWorthy(act)) continue;
      const key = photoCacheKey(act.name, act.lat, act.lng);

      // 1) Persistent cache — reuse a prior resolution (hit OR known-miss) with no network.
      let res;
      if (persist) {
        const cached = await getCachedPhoto(key, cacheDeps);
        if (cached !== undefined) {
          if (cached && cached.url) { store.updateActivity(tripId, act.id, { photo: cached.url }); enriched += 1; fromCache += 1; }
          continue;   // resolved before (even if photo-less) → don't re-fetch
        }
      }

      // 2) True miss → resolve free-first, then persist the result (hit or miss).
      res = await resolveActivityPhoto(act, {
        allowGoogle: googleUsed < googleCap,
        fetchWiki: opts.fetchWiki,
        fetchCommons: opts.fetchCommons,
        fetchGoogle: opts.fetchGoogle,
      });
      if (res && res.source === 'google') googleUsed += 1;
      if (persist) await setCachedPhoto(key, res || null, cacheDeps);
      if (res && res.url) { store.updateActivity(tripId, act.id, { photo: res.url }); enriched += 1; }
    }
  }
  return { enriched, googleUsed, fromCache };
}
