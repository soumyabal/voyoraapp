/**
 * tripValidator.snapshot.test.js — CHARACTERIZATION net for validateTrip().
 *
 * Locks the FULL output of the rules engine for representative trips, so the
 * upcoming rule-registry extraction (moving ~18 inline rules into modules) can be
 * proven byte-identical — a dropped rule, changed severity, reordered/duplicated
 * warning, changed message, or lost fix-field all show up as a snapshot diff.
 *
 * Fixtures are fully deterministic: literal ids, a fixed date (2026-06-12 = Friday),
 * integer/literal coords — no uid()/Date/random — so the snapshot can't be flaky.
 * The inline invariant asserts survive a careless `jest -u`.
 */
import { validateTrip, summariseWarnings } from '../tripValidator';

const day = (label, date, activities) => ({ label, date, activities });
const A   = (id, type, time, extra = {}) => ({ id, type, name: id, time, ...extra });
const tripOf = (days, extra = {}) => ({ families: [], days, ...extra });

const FRI = '2026-06-12'; // weekday 5

const FIXTURES = {
  // A calm, well-paced day — should be (near) all-clear.
  allClear: tripOf([
    day('Day 1', FRI, [
      A('Museum', 'activity', '10:00', { durationMins: 120, lat: 0, lng: 0 }),
      A('Lunch', 'food', '13:00', { durationMins: 60, lat: 0, lng: 0.001 }),
    ]),
  ]),

  // Two stops at the same place that overlap by ≥90 min → overlap=warning, and
  // crucially NOT a travel_time warning (the coordinated Rule 1 vs 1b interaction
  // that broke once).
  overlapBig: tripOf([
    day('Day 1', FRI, [
      A('Tour', 'activity', '09:00', { durationMins: 180, lat: 0, lng: 0 }), // ends 12:00
      A('Show', 'activity', '10:00', { durationMins: 60, lat: 0, lng: 0 }),  // overlap 120 min
    ]),
  ]),

  // Far apart with too little time between → travel_time (now a soft 'info' tip).
  travelTight: tripOf([
    day('Day 1', FRI, [
      A('Spot A', 'activity', '09:00', { durationMins: 120, lat: 0, lng: 0 }),    // ends 11:00
      A('Spot B', 'activity', '11:10', { durationMins: 60, lat: 0, lng: 0.09 }),  // ~30 min away, 10 min gap
    ]),
  ]),

  // Scheduled outside opening hours (open 9–17 Fri, visited 20:00) → closed_venue=error.
  closedVenue: tripOf([
    day('Day 1', FRI, [
      A('Gallery', 'activity', '20:00', { durationMins: 60, openHours: [{ d: 5, o: 540, c: 1020 }] }),
    ]),
  ]),

  // Two cities tagged on one day → multi_city_day=warning.
  multiCity: tripOf([
    day('Day 1', FRI, [
      A('Louvre', 'activity', '10:00', { durationMins: 120, city: 'Paris' }),
      A('Basilica', 'activity', '14:00', { durationMins: 60, city: 'Lyon' }),
    ]),
  ]),

  // A 6h+ journey crammed with other stops → long_journey_conflict=error (the kind
  // of genuine, provable conflict that still warrants red).
  longJourney: tripOf([
    day('Day 1', FRI, [
      A('Flight', 'transport', '08:00', { subtype: 'flight', durationMins: 420 }),
      A('Museum', 'activity', '15:00', { durationMins: 120 }),
      A('Dinner', 'food', '19:00', { durationMins: 90 }),
    ]),
    day('Day 2', '2026-06-13', []),
  ]),
};

describe('validateTrip — golden snapshots (characterization)', () => {
  for (const [name, trip] of Object.entries(FIXTURES)) {
    test(`${name}: full warnings array is stable`, () => {
      expect(validateTrip(trip)).toMatchSnapshot();
    });
  }
});

describe('validateTrip — invariants that must survive any refactor', () => {
  test('a pure overlap is NOT also reported as travel_time (the historical break)', () => {
    const w = validateTrip(FIXTURES.overlapBig);
    expect(w.filter((x) => x.type === 'travel_time')).toHaveLength(0);
    expect(w.filter((x) => x.type === 'overlap').length).toBeGreaterThanOrEqual(1);
  });

  test('tight travel time is a soft tip (info), never red', () => {
    const tt = validateTrip(FIXTURES.travelTight).filter((x) => x.type === 'travel_time');
    expect(tt).toHaveLength(1);
    expect(tt[0].severity).toBe('info');
  });

  test('a closed venue stays a provable error (the badge depends on it)', () => {
    const cv = validateTrip(FIXTURES.closedVenue).filter((x) => x.type === 'closed_venue');
    expect(cv).toHaveLength(1);
    expect(cv[0].severity).toBe('error');
  });

  test('a long journey conflict stays an error', () => {
    const lj = validateTrip(FIXTURES.longJourney).filter((x) => x.type === 'long_journey_conflict');
    expect(lj).toHaveLength(1);
    expect(lj[0].severity).toBe('error');
  });

  test('summary counts are locked per fixture (survives jest -u)', () => {
    const counts = Object.fromEntries(
      Object.entries(FIXTURES).map(([k, t]) => [k, summariseWarnings(validateTrip(t))]),
    );
    expect(counts).toMatchSnapshot();
  });
});
