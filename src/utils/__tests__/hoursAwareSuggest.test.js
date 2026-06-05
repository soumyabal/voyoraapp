/**
 * hoursAwareSuggest.test.js — Trip Check must NOT suggest moving a venue to a time it's
 * closed (the cyclic "move the 5 PM venue to 19:44" trap). When "later" is past close, the
 * overlap/travel tip drops the time button and says "move it to another day".
 */
import { validateTrip } from '../tripValidator';

const FRI = '2026-06-12'; // wd 5
const trip = (acts) => ({ families: [], days: [{ label: 'Day 1', date: FRI, activities: acts }] });

test('an overlap whose only "later" slot is past close suggests a day move, not a closed time', () => {
  const acts = [
    { id: 'big', type: 'activity', name: 'Big Park', time: '15:00', durationMins: 180 }, // ends 18:00
    { id: 'garden', type: 'activity', name: 'Garden', time: '16:00', durationMins: 60, openHours: [{ d: 5, o: 600, c: 1020 }] }, // open 10–5
  ];
  const w = validateTrip(trip(acts)).find(x => x.type === 'overlap');
  expect(w).toBeTruthy();
  expect(w.suggestedTime).toBeUndefined();          // no closed-time button (would be 18:00, past 5pm)
  expect(w.impactedActivities[0].suggestedTime).toBeUndefined();
  expect(w.hint).toMatch(/another day/i);
});

test('an overlap that CAN move later within hours still suggests the time', () => {
  const acts = [
    { id: 'big', type: 'activity', name: 'Big Park', time: '11:00', durationMins: 120 }, // ends 13:00
    { id: 'garden', type: 'activity', name: 'Garden', time: '12:00', durationMins: 60, openHours: [{ d: 5, o: 600, c: 1020 }] }, // open 10–5; 13:00+60≤17:00
  ];
  const w = validateTrip(trip(acts)).find(x => x.type === 'overlap');
  expect(w.suggestedTime).toBe('13:00');
  expect(w.impactedActivities[0].suggestedTime).toBe('13:00');
});

describe('no false green — a venue outside its hours is a green-blocking error', () => {
  const { summariseWarnings } = require('../tripValidator');
  test('a venue scheduled past its close raises an ERROR (badge cannot be green)', () => {
    const acts = [
      { id: 'g', type: 'activity', name: 'Garden', time: '17:45', durationMins: 60, openHours: [{ d: 5, o: 600, c: 1020 }] }, // 10–5, scheduled 17:45
    ];
    const w = validateTrip(trip(acts));
    expect(summariseWarnings(w).errors).toBeGreaterThanOrEqual(1);
    expect(w.find(x => x.type === 'closed_venue').severity).toBe('error');
  });

  test('an unscheduled venue that cannot fit its hours is also a green-blocking error', () => {
    const acts = [
      { id: 'g', type: 'activity', name: 'Garden', durationMins: 60, openHours: [{ d: 5, o: 600, c: 1020 }] }, // no time → unscheduled
    ];
    const w = validateTrip(trip(acts));
    expect(w.some(x => x.type === 'no_fit_hours' && x.severity === 'error')).toBe(true);
  });
});
