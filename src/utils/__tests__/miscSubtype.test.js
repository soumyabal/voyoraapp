/**
 * miscSubtype.test.js — the "Quick stop" (ad-hoc) activity = type:'activity' + subtype:'misc'.
 * It must (a) default to 15 min (never the 2h activity estimate that ballooned "Fuel"),
 * (b) honor an explicit duration, and (c) stay quiet in Trip Check when short while a long
 * one still surfaces a real overlap.
 */
import { estimateDuration, validateTrip } from '../tripValidator';

const FRI = '2026-06-12';
const trip = (acts) => ({ families: [], days: [{ label: 'Day 1', date: FRI, activities: acts }] });
const overlaps = (acts) => validateTrip(trip(acts)).filter(w => w.type === 'overlap');

describe('estimateDuration — misc subtype', () => {
  test('a misc activity defaults to 15 min, never keyword-inflated', () => {
    expect(estimateDuration({ type: 'activity', subtype: 'misc', name: 'Fuel' })).toBe(15);
    expect(estimateDuration({ type: 'activity', subtype: 'misc', name: 'Museum visit' })).toBe(15);
  });
  test('an explicit duration still wins (e.g. meet a friend 3h)', () => {
    expect(estimateDuration({ type: 'activity', subtype: 'misc', name: 'Meet Sam', durationMins: 180 })).toBe(180);
  });
  test('a normal activity is unaffected (still its usual estimate)', () => {
    expect(estimateDuration({ type: 'activity', subtype: null, name: 'Museum' })).toBe(120);
  });
});

describe('Trip Check — short misc is quiet, long misc is not', () => {
  test('a 15-min fuel stop nudging dinner raises NO overlap tip', () => {
    const acts = [
      { id: 'fuel', type: 'activity', subtype: 'misc', name: 'Fuel', time: '18:55' }, // 15 min → ends 19:10
      { id: 'dinner', type: 'food', name: 'Dinner', time: '19:00', durationMins: 90 },
    ];
    expect(overlaps(acts)).toHaveLength(0);
  });
  test('a 3h misc meet-up that truly collides still raises a tip', () => {
    const acts = [
      { id: 'meet', type: 'activity', subtype: 'misc', name: 'Meet Sam', time: '17:00', durationMins: 180 }, // ends 20:00
      { id: 'dinner', type: 'food', name: 'Dinner', time: '18:00', durationMins: 90 },
    ];
    expect(overlaps(acts).length).toBeGreaterThanOrEqual(1);
  });
});
