/**
 * tripCopy.test.js — the varied, deterministic motivational copy. No AI/API/IP.
 * Locks: determinism (same input → same line), variety (different days/trips →
 * different lines), and the rule-derived day categories.
 */
import { coverTagline, countdownLine, dayVibe, closingNote } from '../tripCopy';

const trip = (over = {}) => ({
  name: 'Coast Trip', destination: 'San Diego, California', startDate: '2099-06-12',
  days: Array.from({ length: 4 }, (_, i) => ({ label: `Day ${i + 1}`, date: '2099-06-1' + (2 + i), activities: [] })),
  families: [{ members: [{}, {}] }, { members: [{}] }],
  ...over,
});

describe('determinism + place fill', () => {
  test('coverTagline is stable for a trip and includes the place', () => {
    const t = trip();
    expect(coverTagline(t)).toBe(coverTagline(t));     // deterministic
    expect(coverTagline(t)).toContain('San Diego');    // place-aware pool
  });
  test('closingNote is stable and ends with the sparkle', () => {
    const t = trip();
    expect(closingNote(t)).toBe(closingNote(t));
    expect(closingNote(t)).toMatch(/✨$/);
  });
  test('different trips get different copy (variety, not monotony)', () => {
    const lines = new Set([
      coverTagline(trip({ name: 'A', startDate: '2099-01-01' })),
      coverTagline(trip({ name: 'B', startDate: '2099-02-02' })),
      coverTagline(trip({ name: 'C', startDate: '2099-03-03' })),
      coverTagline(trip({ name: 'D', startDate: '2099-04-04' })),
    ]);
    expect(lines.size).toBeGreaterThan(1);
  });
});

describe('countdownLine', () => {
  test('future trip mentions the day count; past/today are graceful', () => {
    expect(countdownLine(trip({ startDate: '2099-12-31' }))).toMatch(/\d+ days/);
    expect(countdownLine(trip({ startDate: '2000-01-01' }))).toBeTruthy(); // past → still a line
    expect(countdownLine(trip({ startDate: null }))).toBe('');
  });
});

describe('dayVibe — categories + per-day variety', () => {
  const food = (n) => Array.from({ length: n }, (_, i) => ({ type: 'food', name: `Meal ${i}` }));
  test('empty day → an "open day" style line', () => {
    expect(dayVibe({ activities: [] }, 0)).toMatch(/open|blank|nothing/i);
  });
  test('outdoors keywords steer the vibe', () => {
    const d = { activities: [{ type: 'activity', name: 'Sunset Beach hike' }, { type: 'activity', name: 'Nature trail' }, { type: 'activity', name: 'Lake kayak' }] };
    expect(dayVibe(d, 0)).toMatch(/air|outdoors|nature/i);
  });
  test('same-type consecutive days get DIFFERENT lines (kills monotony)', () => {
    const foodieDay = { activities: food(2) };
    expect(dayVibe(foodieDay, 0)).not.toBe(dayVibe(foodieDay, 1)); // seed = day index rotates the pool
  });
  test('deterministic for a given (day, seed)', () => {
    const d = { activities: food(2) };
    expect(dayVibe(d, 2)).toBe(dayVibe(d, 2));
  });
});
