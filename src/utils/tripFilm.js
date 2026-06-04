/**
 * tripFilm.js — turns a trip into the "Play My Trip" film (an ordered list of slides).
 *
 * PURE + deterministic (same trip → same film), so it's snapshot-testable. The renderer
 * (PlayTripModal) just plays whatever slide list this returns.
 *
 * Panel-converged design (reward FIRST, never a tutorial):
 *   · REWARD-led: the trip's place photos are the body and the point.
 *   · IMAGE-BACKED motivational bookends: open on a hero photo + a forward line; close on
 *     the keeper frame + a hopeful line. Never end on a gap.
 *   · ONE forward-framed nudge (the single biggest real gap from Trip Check), reward-voiced
 *     ("one place to stay and that night locks in"), never "missing/incomplete/error".
 *   · ≤2 DOUBLE-DUTY teach lines that reward AND teach in one breath — and pass the
 *     "Foreground Test": each still rewards if you delete the feature it credits. Teach the
 *     OUTCOME, never a button. The moat (per-family splitting) is the one worth teaching.
 *   · STATE-ADAPTIVE — the film grows up with the trip:
 *       trailer  (barely started) → aspiration + the nudge, little reward reel
 *       building (the common case) → bookend → reward reel → progress beat → one nudge → close
 *       victory  (every day planned, no gap) → reward + progress + a celebratory close, NO nudge
 *
 * Slide shape: { type, heroUri?, uri?, kicker?, title?, subtitle?, caption?, dayIndex? }
 *   type: 'open' | 'close'   image-backed bookend (heroUri) + title/subtitle lower-third
 *         'day'              day chapter card (kicker + title)
 *         'photo'            reward photo (uri + caption; caption may be a double-duty line)
 *         'progress'         a motivation/teach beat (kicker? + title + subtitle?)
 *         'nudge'            the one forward ask (kicker + title + dayIndex)
 */
import { validateTrip } from './tripValidator';

const MAX_PHOTOS = 10;

// A Trip-Check warning type → a forward-framed nudge (reward voice; gap = potential, not absence).
const NUDGE_LINES = {
  no_lodging:               { kicker: 'ALMOST THERE', title: "Add where you'll sleep — and it all comes together." },
  unbooked_night:           { kicker: 'ALMOST THERE', title: 'One place to stay, and that night locks in.' },
  lastday_missing_checkout: { kicker: 'LAST THING',   title: "Add your way home — and you're all set." },
  empty_day:                { kicker: 'ONE MORE',      title: "A day's wide open — that's the fun part." },
};
// Most trip-breaking first; we surface only ONE.
const NUDGE_PRIORITY = ['no_lodging', 'unbooked_night', 'lastday_missing_checkout', 'empty_day'];

function topNudge(trip) {
  const ws = validateTrip(trip) || [];
  for (const type of NUDGE_PRIORITY) {
    const w = ws.find(x => x.type === type);
    if (w) return { ...NUDGE_LINES[type], dayIndex: w.dayIndex ?? null };
  }
  return null;
}

export function buildTripFilm(trip) {
  if (!trip) return [];
  const days = trip.days || [];
  const famN = (trip.families || []).length;
  const dayN = days.length;
  const stat = [
    famN ? `${famN} ${famN === 1 ? 'family' : 'families'}` : null,
    dayN ? `${dayN} ${dayN === 1 ? 'day' : 'days'}` : null,
    trip.destination || null,
  ].filter(Boolean).join('   ·   ');

  // Reward material: located photos in day order.
  const photoActs = [];
  days.forEach((d, i) => (d.activities || [])
    .filter(a => a.photo && a.status !== 'skipped')
    .forEach(a => photoActs.push({ name: a.name, photo: a.photo, dayIndex: i })));
  const hero = photoActs[0]?.photo || null;                                  // open on the first
  const closer = photoActs.length ? photoActs[photoActs.length - 1].photo : hero; // close on the last (keeper)
  const cardBg = photoActs.length ? photoActs[Math.floor((photoActs.length - 1) / 2)].photo : null; // a mid photo behind card slides — never a blank gradient

  const plannedDays = days.filter(d => (d.activities || []).some(a => a.status !== 'skipped' && a.type !== 'note')).length;
  const placeCount = photoActs.length;
  const nudge = topNudge(trip);
  const isVictory = dayN > 0 && plannedDays === dayN && !nudge;   // every day planned, nothing critical missing
  const isTrailer = placeCount < 2;                              // barely started → aspiration, not a recap

  const slides = [];

  // ── OPEN bookend (image-backed + motivational, state-adaptive) ──
  slides.push({
    type: 'open',
    heroUri: hero,
    title: trip.name || 'Our Trip',
    subtitle: isTrailer ? `${trip.destination || 'Your trip'} — let's make it real.` : stat,
  });

  if (isTrailer) {
    slides.push({ type: 'progress', title: 'Every great trip starts with one place.' });
    if (nudge) slides.push({ type: 'nudge', kicker: nudge.kicker, title: nudge.title, dayIndex: nudge.dayIndex });
  } else {
    // ── REWARD REEL (the body) — ≤ MAX_PHOTOS, ≤2 double-duty teach captions ──
    let count = 0;
    let taught = 0;
    days.forEach((d, i) => {
      const photos = (d.activities || []).filter(a => a.photo && a.status !== 'skipped');
      if (!photos.length || count >= MAX_PHOTOS) return;
      photos.slice(0, 3).forEach((a, j) => {
        if (count >= MAX_PHOTOS) return;
        // Teach by CREDIT, not instruction. Foreground Test: "<place> — you found this one"
        // still rewards their taste if you ignore the Discover credit underneath.
        let caption = a.name;
        if (taught === 0 && i === 0 && j === 0) { caption = `${a.name} — you found this one.`; taught += 1; }
        const slide = { type: 'photo', uri: a.photo, caption };
        if (j === 0) slide.kicker = `Day ${i + 1}`;   // day chapter marker folded onto its first photo — no blank day card
        slides.push(slide);
        count += 1;
      });
    });

    // ── PROGRESS / MOAT beat — momentum + the one feature worth teaching (reward-framed) ──
    if (famN >= 2) {
      slides.push({
        type: 'progress', kicker: 'NICE', heroUri: cardBg,
        title: `${famN} families, one trip — costs split as you go.`,
        subtitle: `${placeCount} ${placeCount === 1 ? 'place' : 'places'} · ${plannedDays} of ${dayN} days planned`,
      });
    } else {
      slides.push({ type: 'progress', heroUri: cardBg, title: `${placeCount} ${placeCount === 1 ? 'place' : 'places'} · ${plannedDays} of ${dayN} days planned` });
    }

    // ── ONE forward nudge (never in victory mode) — rides a dimmed photo, never a blank card ──
    if (nudge && !isVictory) slides.push({ type: 'nudge', kicker: nudge.kicker, title: nudge.title, dayIndex: nudge.dayIndex, heroUri: cardBg });
  }

  // ── CLOSE bookend — image-backed keeper frame, always hopeful, NEVER on a gap ──
  slides.push({
    type: 'close',
    heroUri: closer,
    title: isVictory ? 'All set.' : "This is going to be a good one.",
    subtitle: isVictory ? `${trip.destination || ''} — see you there.` : '',
  });

  return slides;
}
