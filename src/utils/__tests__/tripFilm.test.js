/**
 * tripFilm.test.js — buildTripFilm turns a trip into a reward-led film: image-backed
 * bookends, a reward reel, ONE forward nudge, ≤2 double-duty teach lines, and it NEVER
 * ends on a gap. State-adaptive: trailer (barely started) / building / victory (all planned).
 */
import { buildTripFilm } from '../tripFilm';

const photoAct = (id, name) => ({ id, name, type: 'activity', time: '10:00', photo: `https://x/${id}.jpg`, lat: 0, lng: 0 });
const last = (film) => film[film.length - 1];

describe('buildTripFilm', () => {
  // 2 families, day 1 planned, days 2-3 empty → a real gap (building mode).
  const building = {
    name: 'Bali', destination: 'Bali, Indonesia',
    families: [{ id: 'A', name: 'Sharma', members: [{ id: 'a1' }] }, { id: 'B', name: 'Gupta', members: [{ id: 'b1' }] }],
    days: [
      { label: 'Day 1', date: '2026-07-10', activities: [photoAct('p1', 'Beach Club'), photoAct('p2', 'Temple')] },
      { label: 'Day 2', date: '2026-07-11', activities: [] },
      { label: 'Day 3', date: '2026-07-12', activities: [] },
    ],
  };

  test('image-backed bookends: opens on the first photo, closes on the last', () => {
    const film = buildTripFilm(building);
    expect(film[0].type).toBe('open');
    expect(film[0].heroUri).toBe('https://x/p1.jpg');   // hero = first photo
    expect(film[0].title).toBe('Bali');
    expect(last(film).type).toBe('close');
    expect(last(film).heroUri).toBe('https://x/p2.jpg'); // keeper = last photo
  });

  test('NEVER ends on a nudge — the close is always last', () => {
    const film = buildTripFilm(building);
    const nudgeIdx = film.findIndex(s => s.type === 'nudge');
    expect(nudgeIdx).toBeGreaterThan(-1);                 // there IS a nudge (empty days)
    expect(nudgeIdx).toBeLessThan(film.length - 1);       // ...but it's never the last slide
    expect(last(film).type).toBe('close');
  });

  test('exactly ONE forward-framed nudge (reward voice, no "missing")', () => {
    const nudges = buildTripFilm(building).filter(s => s.type === 'nudge');
    expect(nudges).toHaveLength(1);
    expect(nudges[0].title.toLowerCase()).not.toMatch(/missing|incomplete|error|forgot/);
  });

  test('≤2 double-duty teach lines: one "you found this" caption + the moat beat', () => {
    const film = buildTripFilm(building);
    const found = film.filter(s => s.type === 'photo' && /you found this/.test(s.caption || ''));
    const moat = film.filter(s => s.type === 'progress' && /families, one trip/.test(s.title || ''));
    expect(found).toHaveLength(1);
    expect(moat).toHaveLength(1);                         // the signature feature, reward-framed
    expect(found.length + moat.length).toBeLessThanOrEqual(2);
  });

  test('no blank cards: no standalone day slide, and every card slide rides a photo', () => {
    const film = buildTripFilm(building);
    expect(film.some(s => s.type === 'day')).toBe(false);          // day card removed
    const firstPhoto = film.find(s => s.type === 'photo');
    expect(firstPhoto.kicker).toBe('Day 1');                       // day marker folded onto the photo
    film.filter(s => s.type === 'progress' || s.type === 'nudge')
      .forEach(s => expect(s.heroUri).toBeTruthy());               // cards ride a dimmed photo, never blank
  });

  test('victory mode: every day planned, no gap → no nudge, celebratory close', () => {
    const victory = {
      name: 'Daytrip', destination: 'San Francisco',
      families: [{ id: 'A', members: [{ id: 'a1' }] }],
      days: [{ label: 'Day 1', date: '2026-07-10', activities: [photoAct('p1', 'Pier'), photoAct('p2', 'Park')] }],
    };
    const film = buildTripFilm(victory);
    expect(film.some(s => s.type === 'nudge')).toBe(false);
    expect(last(film).type).toBe('close');
    expect(last(film).title).toBe('All set.');
  });

  test('trailer mode: barely started → aspiration + a nudge, no reward reel', () => {
    const trailer = {
      name: 'New trip', destination: 'Rome',
      families: [{ id: 'A', members: [{ id: 'a1' }] }],
      days: [{ label: 'Day 1', date: '2026-07-10', activities: [] }, { label: 'Day 2', date: '2026-07-11', activities: [] }],
    };
    const film = buildTripFilm(trailer);
    expect(film.some(s => s.type === 'photo')).toBe(false);      // nothing to reward yet
    expect(film[0].type).toBe('open');
    expect(film[0].subtitle).toMatch(/Rome/);                    // destination-forward
    expect(last(film).type).toBe('close');
  });
});
