/**
 * transportDuration.test.js — a transport leg's duration follows the Departs→Arrives the
 * user entered (the "Drive 05:00→16:00 still shows ~2h" bug), not the fixed per-mode default.
 */
import { estimateDuration } from '../tripValidator';

test('Departs + Arrives drives the duration (05:00 → 16:00 = 11h, not the 2h car default)', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'car', time: '05:00', arriveTime: '16:00' })).toBe(11 * 60);
});

test('Arrives earlier than Departs crosses midnight (22:00 → 06:00 = 8h)', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'flight', time: '22:00', arriveTime: '06:00' })).toBe(8 * 60);
});

test('no Arrives → falls back to the per-mode default', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'car', time: '05:00' })).toBe(120);
  expect(estimateDuration({ type: 'transport', subtype: 'flight' })).toBe(180);
});

test('an explicit duration override still wins over the span', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'flight', time: '08:00', arriveTime: '18:00', durationMins: 240 })).toBe(240);
});

test('pitstop has no arrive time → stays 15 min', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'pitstop', time: '12:00' })).toBe(15);
});
