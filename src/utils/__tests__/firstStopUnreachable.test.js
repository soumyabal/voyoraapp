/**
 * firstStopUnreachable.test.js — the "359 km at 08:00" Trip Check tip. A day's first stop
 * scheduled earlier than you could realistically arrive from where the day STARTS (home on
 * Day 1, last night's hotel otherwise). Soft 'info' (it's a drive estimate — flying ignores
 * it); on a multi-day arrival day with no lodging it folds in a hotel-check-in nudge.
 */
import { validateTrip } from '../tripValidator';

const HQ = { lat: 42.15, lng: -87.98 };    // home (Buffalo Grove area)
const DEST = { lat: 44.76, lng: -85.62 };  // ~350 km away (Traverse City)
const act = (id, time, extra = {}) => ({ id, type: 'activity', name: id, time, ...DEST, ...extra });
const tips = (trip) => validateTrip(trip).filter(w => w.type === 'first_stop_unreachable');

describe('first_stop_unreachable', () => {
  test('Day 1 first stop too early for the drive from home → fires, with a hotel hint', () => {
    const trip = { origin: HQ, families: [], days: [
      { label: 'Day 1', date: '2026-06-05', activities: [act('Maple Bay', '08:00')] },
      { label: 'Day 2', date: '2026-06-06', activities: [] },
    ] };
    const t = tips(trip);
    expect(t).toHaveLength(1);
    expect(t[0].severity).toBe('info');               // never an error — it's a drive guess
    expect(t[0].message).toMatch(/08:00/);
    expect(t[0].hint).toMatch(/hotel check-in/);      // multi-day arrival day, no lodging
  });

  test('a near start anchor (hotel ~3 km away) → no tip', () => {
    const near = { lat: 44.75, lng: -85.60 };
    const trip = { origin: near, families: [], days: [
      { label: 'Day 1', date: '2026-06-05', activities: [act('Beach', '09:00')] },
      { label: 'Day 2', date: '2026-06-06', activities: [] },
    ] };
    expect(tips(trip)).toHaveLength(0);
  });

  test('first stop already late enough for the drive → no tip', () => {
    const trip = { origin: HQ, families: [], days: [
      { label: 'Day 1', date: '2026-06-05', activities: [act('Maple Bay', '15:00')] },
      { label: 'Day 2', date: '2026-06-06', activities: [] },
    ] };
    expect(tips(trip)).toHaveLength(0);
  });

  test('a very long haul (flight territory) frames it as a travel day, not "~17h drive"', () => {
    const CHI = { lat: 41.88, lng: -87.63 };          // Chicago
    const FLA = { lat: 28.0, lng: -81.7 };            // central Florida (~1500 km)
    const trip = { origin: CHI, families: [], days: [
      { label: 'Day 1', date: '2026-06-05', activities: [{ id: 'p', type: 'activity', name: 'Park', time: '08:00', ...FLA }] },
      { label: 'Day 2', date: '2026-06-06', activities: [] },
    ] };
    const t = tips(trip);
    expect(t).toHaveLength(1);
    expect(t[0].message).not.toMatch(/\dh from/);     // no absurd "~17h" claim
    expect(t[0].message).toMatch(/travel day/);
    expect(t[0].suggestedTime).toBeNull();            // arrival would wrap past day-end → omit it
  });

  test('no origin set → no tip (cannot estimate the drive)', () => {
    const trip = { families: [], days: [
      { label: 'Day 1', date: '2026-06-05', activities: [act('Maple Bay', '08:00')] },
      { label: 'Day 2', date: '2026-06-06', activities: [] },
    ] };
    expect(tips(trip)).toHaveLength(0);
  });
});
