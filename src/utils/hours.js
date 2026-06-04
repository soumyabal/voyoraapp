/**
 * hours.js — helpers over the compact opening-hours shape stored on activities
 * added from Discover:
 *
 *   openHours: [{ d, o, c }]   d = weekday (0=Sun … 6=Sat),
 *                              o / c = open / close minutes-of-day.
 *
 * Used to show a card's hours and to flag activities scheduled while a venue is
 * closed (Trip Check). Pure, no API. null is returned whenever hours are unknown
 * so callers can stay silent rather than guess.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local weekday (0=Sun…6=Sat) for a 'YYYY-MM-DD' string; null if unparseable. */
export function weekdayOf(date) {
  if (!date || typeof date !== 'string') return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();   // local time — matches the trip's calendar
}

export function dayName(wd) {
  return wd == null ? '' : DAY_NAMES[wd] || '';
}

/**
 * Google Places `regularOpeningHours` → the compact [{d,o,c}] shape (minutes-of-day).
 * Fixes the cases the naive parser got wrong:
 *   · OPEN 24/7 — Google sends ONE period (open Sunday 00:00, NO `close`) meaning open
 *     continuously all week. The old code recorded it for day 0 only, so a 24/7 bridge /
 *     lighthouse read "Closed" Mon–Sat. We expand a no-close period to all seven days.
 *   · spans past midnight / across days (`close.day` ≠ `open.day`) → split into per-day
 *     intervals so the early hours of the next day count as open too.
 * Returns null when hours are unknown.
 */
export function compactHours(oh) {
  const periods = oh?.periods;
  if (!Array.isArray(periods)) return null;
  const out = [];
  for (const p of periods) {
    if (!p.open) continue;
    const od = p.open.day ?? 0;
    const o = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    if (!p.close) {                                  // no close → open 24 hours, EVERY day
      for (let d = 0; d < 7; d += 1) out.push({ d, o: 0, c: 1440 });
      continue;
    }
    const cd = p.close.day ?? od;
    const c = (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0);
    if (cd === od) {
      out.push({ d: od, o, c: c > o ? c : 1440 });   // same day (cap to midnight if close ≤ open)
    } else {
      out.push({ d: od, o, c: 1440 });               // the rest of the open day
      let d = (od + 1) % 7, guard = 0;
      while (d !== cd && guard < 7) { out.push({ d, o: 0, c: 1440 }); d = (d + 1) % 7; guard += 1; }
      if (c > 0) out.push({ d: cd, o: 0, c });        // early hours of the close day
    }
  }
  return out.length ? out : null;
}

/** Today's open intervals on weekday `wd`: [] = closed that day, null = unknown. */
export function dayIntervals(openHours, wd) {
  if (!Array.isArray(openHours) || !openHours.length || wd == null) return null;
  return openHours.filter(h => h.d === wd).sort((a, b) => a.o - b.o);
}

/** Is the venue open at `minute` on weekday `wd`? true / false, or null if unknown. */
export function isOpenAt(openHours, wd, minute) {
  const today = dayIntervals(openHours, wd);
  if (today == null) return null;          // no hours data
  if (!today.length) return false;         // explicitly closed that weekday
  return today.some(h => minute >= h.o && minute <= h.c);
}

/** "9 AM", "1:15 PM", "12 AM" (midnight). */
function fmtClock(min) {
  const clamped = Math.min(min, 1440);
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/**
 * Human label for a day's hours: "9 AM–5 PM", "11 AM–2 PM, 5 PM–10 PM",
 * "Open 24 h", "Closed", or '' when hours are unknown.
 */
export function hoursLabel(openHours, wd) {
  const today = dayIntervals(openHours, wd);
  if (today == null) return '';                       // unknown → show nothing
  if (!today.length) return 'Closed';
  if (today.length === 1 && today[0].o <= 0 && today[0].c >= 1440) return 'Open 24 h';
  return today.map(h => `${fmtClock(h.o)}–${fmtClock(h.c)}`).join(', ');
}
