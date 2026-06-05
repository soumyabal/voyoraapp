/**
 * dayShare.js — build the shareable plain-text summary of a single day (WhatsApp / Share sheet).
 *
 * Pure: (trip, day, dayIndex) → a formatted string. Stops are grouped into
 * Morning/Afternoon/Evening/Night, sorted by time; skipped stops excluded; addresses inlined;
 * a per-person day cost line when there's cost; and ONE tappable, chat-safe Maps route link for
 * the day (omitted when dayIndex is null or there are <2 located stops). '' for a missing day.
 */
import { fmt, fmtM } from './helpers';
import { googleMapsDayShareUrl } from './mapsRoute';
import { APP_NAME } from '../config';

const SLOT_RANGES = [
  { key: 'morning',   label: '🌅 Morning',   before: 720  },
  { key: 'afternoon', label: '☀️ Afternoon',  before: 1020 },
  { key: 'evening',   label: '🌆 Evening',    before: 1260 },
  { key: 'night',     label: '🌙 Night',      before: 1440 },
];

export function generateDayShareText(trip, day, dayIndex) {
  if (!day) return '';
  const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
  const acts = [...(day.activities || [])]
    .filter(a => a.status !== 'skipped')
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const toMin = t => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };
  const getSlot = t => {
    const m = toMin(t);
    return SLOT_RANGES.find(s => m < s.before)?.key ?? 'night';
  };

  const bySlot = {};
  acts.forEach(a => {
    const sk = getSlot(a.time);
    if (!bySlot[sk]) bySlot[sk] = [];
    bySlot[sk].push(a);
  });

  const dayCost = acts.reduce((s, a) => s + (a.costPerPerson || 0), 0);

  let text = `*${trip.name}* — ${day.label} (${fmt(day.date)})\n📍 ${trip.destination}\n\n`;

  SLOT_RANGES.forEach(({ key, label }) => {
    if (!bySlot[key]?.length) return;
    text += `${label}\n`;
    bySlot[key].forEach(a => {
      const icon = a.type === 'food' ? '🍽️' : a.type === 'transport' ? '🚗' : a.type === 'stay' ? '🏨' : '🎯';
      const cost = a.costPerPerson > 0 ? ` (~$${a.costPerPerson}/p)` : '';
      text += `  ${a.time}  ${icon} ${a.name}${cost}\n`;
      // Address as plain text (where you'll be); single-lined so it never breaks
      // the slot layout. The tappable route is the one link at the bottom.
      if (a.address) text += `         📍 ${oneLine(a.address)}\n`;
    });
    text += '\n';
  });

  if (dayCost > 0) text += `💰 Day estimate: ${fmtM(dayCost)}/person\n`;
  // One tappable, chat-safe link that opens the WHOLE day's route in Maps
  // (path-style URL — survives chat link-detectors). On its own line, no
  // trailing punctuation, so it stays one tap target. Omitted if <2 located stops.
  const routeUrl = dayIndex != null ? googleMapsDayShareUrl(trip, dayIndex) : null;
  if (routeUrl) text += `\n🗺️ Open today's route in Maps:\n${routeUrl}\n`;
  text += `\n_Shared via ${APP_NAME}_`;
  return text;
}
