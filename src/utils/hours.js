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
