/**
 * transportDuration.test.js — a transport leg's duration follows the Departs→Arrives the
 * user entered (the "Drive 05:00→16:00 still shows ~2h" bug), not the fixed per-mode default.
 */
import { estimateDuration } from '../tripValidator';
import { travelLeg } from '../geo';

test('Departs + Arrives drives the duration (05:00 → 16:00 = 11h, not the 2h car default)', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'car', time: '05:00', arriveTime: '16:00' })).toBe(11 * 60);
});

test('Arrives earlier than Departs crosses midnight (22:00 → 06:00 = 8h)', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'flight', time: '22:00', arriveTime: '06:00' })).toBe(8 * 60);
});

test('a car/untyped leg with Arrives ≤ Departs does NOT balloon to 24h (the Wisconsin Dells return bug)', () => {
  // A same-day drive whose Arrives was set equal-or-earlier (a data slip or an AI-pasted value)
  // must not read as a +24h overnight drive that then triggers a false "long journey" warning.
  expect(estimateDuration({ type: 'transport', subtype: 'car', time: '14:00', arriveTime: '14:00' })).toBe(120);
  expect(estimateDuration({ type: 'transport', subtype: 'car', time: '14:00', arriveTime: '13:00' })).toBe(120);
  expect(estimateDuration({ type: 'transport', time: '11:00', arriveTime: '11:00' })).toBe(120); // untyped
});

test('overnight modes (flight/train/ship/bus) STILL add a day when Arrives ≤ Departs (real red-eye)', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'flight', time: '23:00', arriveTime: '07:00' })).toBe(8 * 60);
  expect(estimateDuration({ type: 'transport', subtype: 'train', time: '22:00', arriveTime: '06:00' })).toBe(8 * 60);
  expect(estimateDuration({ type: 'transport', subtype: 'bus', time: '23:30', arriveTime: '05:30' })).toBe(6 * 60);
});

test('a car with origin coords + a bad Arrives uses the distance leg, never 24h', () => {
  const d = estimateDuration({ type: 'transport', subtype: 'car', time: '14:00', arriveTime: '14:00', lat: 0, lng: 3 }, { lat: 0, lng: 0 });
  expect(d).toBeGreaterThan(0);
  expect(d).toBeLessThan(24 * 60);
});

test('no Arrives → falls back to the per-mode default', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'car', time: '05:00' })).toBe(120);
  expect(estimateDuration({ type: 'transport', subtype: 'flight' })).toBe(180);
});

test('every transport sub-mode has its own default', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'train' })).toBe(90);
  expect(estimateDuration({ type: 'transport', subtype: 'ship' })).toBe(240);   // ferry/cruise
  expect(estimateDuration({ type: 'transport', subtype: 'pitstop' })).toBe(15);
  expect(estimateDuration({ type: 'transport', subtype: 'bus' })).toBe(120);     // unknown sub-mode → default
  expect(estimateDuration({ type: 'transport' })).toBe(120);                     // no sub-mode → default
});

test('an explicit duration override still wins over the span', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'flight', time: '08:00', arriveTime: '18:00', durationMins: 240 })).toBe(240);
});

test('pitstop has no arrive time → stays 15 min', () => {
  expect(estimateDuration({ type: 'transport', subtype: 'pitstop', time: '12:00' })).toBe(15);
});

describe('origin-aware drive duration (no Arrives, but we know both ends)', () => {
  const origin = { lat: 0, lng: 0 };
  const farDrive = { type: 'transport', subtype: 'car', time: '16:00', lat: 0, lng: 3 }; // ~333 km

  test('a drive with origin + destination geocode uses the real leg, not the 2h default', () => {
    const d = estimateDuration(farDrive, origin);
    expect(d).toBe(travelLeg(origin, farDrive).min); // distance-based
    expect(d).toBeGreaterThan(120);                   // beats the flat car default
  });

  test('no origin → still the per-mode default (back-compatible)', () => {
    expect(estimateDuration(farDrive)).toBe(120);
  });

  test('flights/trains/ships keep their per-mode default even with an origin', () => {
    expect(estimateDuration({ type: 'transport', subtype: 'flight', time: '08:00', lat: 0, lng: 3 }, origin)).toBe(180);
    expect(estimateDuration({ type: 'transport', subtype: 'train', time: '08:00', lat: 0, lng: 3 }, origin)).toBe(90);
  });

  test('explicit Arrives still wins over the distance estimate', () => {
    expect(estimateDuration({ ...farDrive, arriveTime: '18:00' }, origin)).toBe(120); // 16:00→18:00
  });

  test('missing destination coords → falls back to the default', () => {
    expect(estimateDuration({ type: 'transport', subtype: 'car', time: '16:00' }, origin)).toBe(120);
  });
});
