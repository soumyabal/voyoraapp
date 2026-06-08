/**
 * photoCache.js — a PERSISTENT (cross-restart) cache of resolved place photos.
 *
 * The in-memory caches in places.js / destinationImage.js reset every launch, so a fresh
 * paste of the same place re-hits the network (and re-bills Google). This backs the photo
 * resolver with AsyncStorage: a place resolved once — hit OR known-miss — is remembered for
 * good, so re-pasting / re-importing the same itinerary costs nothing.
 *
 * Shape: one JSON object under STORE_KEY, mirrored in memory and loaded once. Values are the
 * resolver result ({ url, source } | null for a known miss). The storage backend is INJECTABLE
 * (deps.storage) so the logic is unit-testable without a device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'voyara-photo-cache-v1';
const MAX_ENTRIES = 4000;   // soft cap — a runaway-growth backstop (drop the whole map if exceeded)

let mem = null;        // in-memory mirror of the persisted map
let loading = null;    // de-dupe concurrent loads

function backend(deps) { return (deps && deps.storage) || AsyncStorage; }

async function load(storage) {
  if (mem) return mem;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await storage.getItem(STORE_KEY);
        mem = raw ? JSON.parse(raw) : {};
      } catch { mem = {}; }
      if (!mem || typeof mem !== 'object') mem = {};
      return mem;
    })();
  }
  return loading;
}

/** Stable cache key for a place: lowercased name + coarse coords (so the same spot collapses). */
export function photoCacheKey(name, lat, lng) {
  const n = String(name || '').trim().toLowerCase();
  const c = (lat != null && lng != null) ? `@${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}` : '';
  return n + c;
}

/** undefined = never resolved (a real cache MISS → caller should fetch); a stored value
 *  ({url,source} or null) = previously resolved (HIT, including a known photo-less place). */
export async function getCachedPhoto(key, deps = {}) {
  if (!key) return undefined;
  const m = await load(backend(deps));
  return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined;
}

/** Persist a resolver result (value = {url,source} | null). Best-effort; never throws. */
export async function setCachedPhoto(key, value, deps = {}) {
  if (!key) return;
  const storage = backend(deps);
  const m = await load(storage);
  m[key] = value;
  try {
    // Backstop against unbounded growth: if we somehow blow past the cap, start fresh.
    const next = Object.keys(m).length > MAX_ENTRIES ? { [key]: value } : m;
    if (next !== m) { mem = next; }
    await storage.setItem(STORE_KEY, JSON.stringify(mem));
  } catch { /* best-effort persistence */ }
}

/** Test seam: forget the in-memory mirror so the next get re-loads from storage. */
export function _resetPhotoCache() { mem = null; loading = null; }
