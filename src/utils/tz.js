/**
 * tz.js — timezone engine (pure, zero-dependency, built on Intl).
 *
 * Implements Phase 0–1 of docs/timezone-model.md. The model:
 *   - Activity times stay FLOATING wall-clock ('HH:MM') interpreted in their day's IANA zone.
 *   - Only cross-zone travel legs are true instants; UTC/duration are DERIVED here, never stored.
 *   - We store the IANA zone NAME (e.g. 'America/Los_Angeles'), not a numeric delta — a delta
 *     rots across DST; the name lets us derive the correct offset for any date.
 *
 * THE GATING UNKNOWN (doc §4) is whether Expo-Go's Hermes supports
 * `Intl.DateTimeFormat(..., { timeZone })`. Rather than assume, tzSupported() FEATURE-DETECTS
 * at runtime: every display helper degrades gracefully (returns '' / device-local) when zone
 * data isn't available, so the app never breaks — it just shows less. In jest (Node has full
 * ICU) the logic is fully exercised; on-device tzSupported() reports the real capability.
 *
 * Offset convention: minutes the zone is AHEAD of UTC. localTime = utcTime + offset.
 *   America/New_York EST = -300, EDT = -240 · Asia/Kolkata = +330 · UTC = 0.
 */

// ── low-level: render a UTC instant's wall-clock parts in a zone ───────────────────────────
function partsInZone(ms, tz) {
  // h23 → hours 00–23 (avoids the '24:00' some engines emit for midnight).
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out = {};
  for (const p of dtf.formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

/**
 * Offset of `tz` at instant `ms`, in minutes ahead of UTC (DST-correct for that instant).
 * Returns 0 (and is caught by tzSupported) if the platform can't resolve the zone.
 */
export function offsetMinutes(tz, ms) {
  if (!tz) return 0;
  const p = partsInZone(ms, tz);
  // The zone's wall-clock at `ms`, re-read as if it were UTC, minus the real UTC = the offset.
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - ms) / 60000);
}

/**
 * A floating wall-clock time in a zone → the absolute UTC instant (ms).
 * `dateStr` = 'YYYY-MM-DD', `wall` = 'HH:MM'. DST-aware via a one-pass refinement around the
 * guess (handles a wall time that lands in a different DST period than the naive guess).
 */
export function zonedWallToUtcMs(dateStr, wall, tz) {
  const [y, mo, d] = String(dateStr || '').split('-').map(Number);
  const [h, mi] = String(wall || '00:00').split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return NaN;
  const guess = Date.UTC(y, mo - 1, d, Number.isFinite(h) ? h : 0, Number.isFinite(mi) ? mi : 0);
  if (!tz) return guess;
  const off1 = offsetMinutes(tz, guess);
  let utc = guess - off1 * 60000;
  const off2 = offsetMinutes(tz, utc);     // refine: the real instant may sit in another DST period
  if (off2 !== off1) utc = guess - off2 * 60000;
  return utc;
}

/**
 * Short zone label at an instant: 'PDT', 'EST', 'GMT+5:30', … '' if unknown/unsupported.
 */
export function tzAbbr(tz, ms) {
  if (!tz) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date(ms));
    const z = parts.find(p => p.type === 'timeZoneName');
    return z ? z.value : '';
  } catch {
    return '';
  }
}

/**
 * The short zone label to show next to a floating wall time on a given day, e.g. 'PDT'.
 * Convenience over tzAbbr that computes the right instant from (date, wall). '' when unknown.
 */
export function zoneShortLabel(tz, dateStr, wall) {
  if (!tz) return '';
  const ms = zonedWallToUtcMs(dateStr, wall || '12:00', tz);
  return Number.isNaN(ms) ? '' : tzAbbr(tz, ms);
}

/** Human GMT-offset label from minutes-ahead-of-UTC: 0 → 'GMT', 330 → 'GMT+5:30', -420 → 'GMT-7'. */
export function formatGmtOffset(min) {
  if (!Number.isFinite(min) || min === 0) return 'GMT';
  const sign = min > 0 ? '+' : '-';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/**
 * Minutes between two floating wall times in (possibly different) zones — the true elapsed time
 * of a cross-zone travel leg. `from`/`to` = { date:'YYYY-MM-DD', time:'HH:MM', tz }.
 * NaN if either endpoint can't be resolved. Negative if `to` precedes `from` (caller decides).
 */
export function crossZoneLegMinutes(from, to) {
  const a = zonedWallToUtcMs(from?.date, from?.time, from?.tz);
  const b = zonedWallToUtcMs(to?.date, to?.time, to?.tz);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 60000);
}

// ── coords → IANA zone (offline) ───────────────────────────────────────────────────────────
// Lazy-required so the ~1MB tz-lookup boundary data loads only on first inference (trip
// creation), NOT at app start — keeps cold-start light.
let _tzlookup;
/**
 * Infer an IANA zone from coordinates (offline, via tz-lookup). null for missing/invalid coords
 * or if the lookup can't resolve (e.g. out-of-range lat/lng → tz-lookup throws → caught).
 */
export function tzForCoords(lat, lng) {
  if (lat == null || lng == null || !Number.isFinite(+lat) || !Number.isFinite(+lng)) return null;
  try {
    if (!_tzlookup) _tzlookup = require('tz-lookup');
    return _tzlookup(+lat, +lng) || null;
  } catch {
    return null;
  }
}

/** The device's own IANA zone, e.g. 'America/Chicago'. null if unavailable. */
export function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// ── THE SPIKE: does this runtime actually honor { timeZone }? (cached) ─────────────────────
let _supported = null;
/**
 * Runtime feature-detect for Intl timeZone support (doc §4). True only when the engine returns
 * the KNOWN, DST-varying offsets for a reference zone — so a Hermes that silently ignores
 * `timeZone` (returning device-local for everything) is correctly reported as unsupported.
 * Cached after first call. Every display helper already degrades gracefully, so this gates how
 * much zone info we SHOW, not whether the app works.
 */
export function tzSupported() {
  if (_supported != null) return _supported;
  try {
    const est = offsetMinutes('America/New_York', Date.UTC(2025, 0, 15)); // winter → -300
    const edt = offsetMinutes('America/New_York', Date.UTC(2025, 6, 15)); // summer → -240
    const ist = offsetMinutes('Asia/Kolkata', Date.UTC(2025, 0, 15));     // no DST → +330
    _supported = est === -300 && edt === -240 && ist === 330;
  } catch {
    _supported = false;
  }
  return _supported;
}

/** Test seam — reset the cached capability (jest only; no-op cost in prod). */
export function _resetTzSupportCache() {
  _supported = null;
}
