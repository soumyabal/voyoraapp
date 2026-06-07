/**
 * tripStats.js — "Trip Wrapped" recap stats (roadmap §11 build-order #4: the post-trip recap).
 *
 * PURE + deterministic: (trip) → a tally the recap UI renders ("12 places · 3 cities · 2 time
 * zones · busiest day was Day 4"). Reads only the trip (activities, days, expenses, timezones);
 * no store, no API, no clock. Reuses the existing tz + expense-summary utils, never re-implements
 * the money math.
 */
import { tzForDay } from './tz';
import { summariseExpenses } from './expenses';

const PLACE_TYPES = new Set(['activity', 'food', 'stay']);

export function computeTripStats(trip) {
  const days = trip?.days || [];
  const live = days.flatMap(d => (d.activities || []).filter(a => a.status !== 'skipped'));
  const substantial = live.filter(a => a.type !== 'note');

  const byType = { food: 0, activity: 0, stay: 0, transport: 0 };
  for (const a of live) if (byType[a.type] != null) byType[a.type] += 1;

  const placesCount = live.filter(a => PLACE_TYPES.has(a.type)).length;
  const cities = [...new Set(live.map(a => a.city).filter(Boolean))];

  const isFlight = a => a.type === 'transport' && (a.subtype === 'flight' || /\b(flight|fly)\b/i.test(a.name || ''));
  const isDrive = a => a.type === 'transport' && (a.subtype === 'car' || /\bdrive\b/i.test(a.name || ''));
  const flights = live.filter(isFlight).length;
  const drives = live.filter(isDrive).length;

  // Time zones the trip spans (the tz work pays off here).
  const zones = [...new Set(days.map((_, i) => tzForDay(trip, i)).filter(Boolean))];

  // Busiest day by substantial, non-stay stops.
  let busiestDay = null;
  days.forEach((d, i) => {
    const count = (d.activities || []).filter(a => a.status !== 'skipped' && a.type !== 'note' && a.type !== 'stay').length;
    if (!busiestDay || count > busiestDay.count) busiestDay = { index: i, label: d.label || `Day ${i + 1}`, count };
  });

  const { grandTotal } = summariseExpenses(trip);

  return {
    days: days.length,
    nights: Math.max(0, days.length - 1),
    placesCount,
    cities,
    cityCount: cities.length,
    timezones: zones,
    timezoneCount: zones.length,
    totalActivities: substantial.length,
    byType,
    flights,
    drives,
    busiestDay,
    totalSpend: grandTotal,
    hasSpend: grandTotal > 0,
  };
}

/**
 * A few human one-liners for the recap header, derived from the stats. Pure; the UI picks which
 * to show. Always returns at least the places line.
 */
export function tripStatLines(stats) {
  const lines = [];
  const plural = (n, s) => `${n} ${s}${n !== 1 ? 's' : ''}`;
  lines.push(`${plural(stats.placesCount, 'place')} across ${plural(stats.cityCount || 1, 'city').replace('citys', 'cities')}`);
  if (stats.timezoneCount > 1) lines.push(`Crossed ${plural(stats.timezoneCount, 'time zone')}`);
  if (stats.flights) lines.push(`${plural(stats.flights, 'flight')} taken`);
  if (stats.busiestDay && stats.busiestDay.count >= 3) lines.push(`Busiest day: ${stats.busiestDay.label} (${stats.busiestDay.count} stops)`);
  if (stats.hasSpend) lines.push(`$${Math.round(stats.totalSpend).toLocaleString()} shared`);
  return lines;
}
