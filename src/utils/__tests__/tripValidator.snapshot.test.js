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

  // Closed that whole weekday (open Mondays only, trip day is Friday), non-seasonal
  // → hard error "Closed that day" (season-robust, provable).
  closedDarkDay: tripOf([
    day('Day 1', FRI, [
      A('Gallery', 'activity', '11:00', { durationMins: 60, openHours: [{ d: 1, o: 540, c: 1020 }] }),
    ]),
  ]),
  // Open that day but scheduled outside the window → amber "Outside opening hours".
  closedTimeEdge: tripOf([
    day('Day 1', FRI, [
      A('Cafe', 'activity', '20:00', { durationMins: 60, openHours: [{ d: 5, o: 540, c: 1020 }] }),
    ]),
  ]),
  // Seasonal-prone venue scheduled when the snapshot says closed → soft "verify",
  // never red (the weekly snapshot can't see the trip's season).
  closedSeasonal: tripOf([
    day('Day 1', FRI, [
      A('Riverside Water Park', 'activity', '11:00', { durationMins: 120, openHours: [{ d: 1, o: 540, c: 1020 }] }),
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

  // ── Coverage fixtures: gate the rules the originals never exercised, so the
  //    rule-registry extraction is byte-locked across the WHOLE engine. ──

  // Mid-trip empty day → empty_day=warning (edges are info).
  emptyMidTrip: tripOf([
    day('Day 1', FRI, [A('a', 'activity', '10:00', { durationMins: 60 })]),
    day('Day 2', '2026-06-13', []),
    day('Day 3', '2026-06-14', [A('b', 'activity', '10:00', { durationMins: 60 })]),
  ]),
  // A day with only a note → notes_only_day=info.
  notesOnly: tripOf([
    day('Day 1', FRI, [A('n', 'note', '00:00', { name: 'Rest day' })]),
  ]),
  // 8 substantial stops → packed=info (and no food → no_meal).
  packedDay: tripOf([
    day('Day 1', FRI, Array.from({ length: 8 }, (_, k) =>
      A(`s${k}`, 'activity', `${String(7 + k).padStart(2, '0')}:00`, { durationMins: 30 }))),
  ]),
  // Few-but-long touring day → tiring_day=info.
  tiringLong: tripOf([
    day('Day 1', FRI, [
      A('hk', 'activity', '08:00', { name: 'Full-day excursion', durationMins: 480 }),
      A('pk', 'activity', '17:00', { name: 'Evening park', durationMins: 180 }),
    ]),
  ]),
  // 3+ activities, 4h+ span, no food → no_meal=info.
  noMeal: tripOf([
    day('Day 1', FRI, [
      A('m1', 'activity', '09:00', { durationMins: 120 }),
      A('m2', 'activity', '12:00', { durationMins: 120 }),
      A('m3', 'activity', '15:00', { durationMins: 90 }),
    ]),
  ]),
  // Breakfast + dinner bracketing a long touring afternoon, no lunch → meal_gap=info.
  // (no_meal stays silent because the day HAS food.)
  mealGap: tripOf([
    day('Day 1', FRI, [
      A('bf',  'food',     '08:00', { name: 'Breakfast', durationMins: 60 }),   // ends 09:00
      A('tour','activity', '10:00', { name: 'All-day fort tour', durationMins: 300 }),
      A('din', 'food',     '19:00', { name: 'Dinner', durationMins: 90 }),
    ]),
  ]),
  // Before-6am start + after-midnight end → early_start + past_midnight.
  edgeHours: tripOf([
    day('Day 1', FRI, [
      A('sun', 'activity', '05:00', { name: 'Sunrise viewpoint', durationMins: 60 }),
      A('show', 'activity', '23:00', { name: 'Late show', durationMins: 120 }),
    ]),
  ]),
  // Same name twice → duplicate_activity=warning.
  duplicate: tripOf([
    day('Day 1', FRI, [
      A('d1', 'activity', '10:00', { name: 'City Tour', durationMins: 60 }),
      A('d2', 'activity', '14:00', { name: 'City Tour', durationMins: 60 }),
    ]),
  ]),
  // Transport arriving earlier than it departs → multi_day_journey=info.
  overnightTransit: tripOf([
    day('Day 1', FRI, [
      A('tr', 'transport', '22:00', { name: 'Night train', subtype: 'train', arriveTime: '06:00' }),
    ]),
  ]),
  // Late-riser family, pre-9am stop → wake_time (late branch), info.
  wakeLate: tripOf([
    day('Day 1', FRI, [A('w', 'activity', '08:00', { name: 'Morning museum', durationMins: 60 })]),
  ], { families: [{ id: 'fOwl', name: 'Owls', wakeTime: 'late', members: [] }] }),
  // Regular family, pre-7am stop → wake_time (regular branch), info.
  wakeRegular: tripOf([
    day('Day 1', FRI, [A('w', 'activity', '06:30', { name: 'Early market', durationMins: 60 })]),
  ], { families: [{ id: 'fLark', name: 'Larks', members: [] }] }),
  // Veg + no-alcohol families with meat & alcohol stops → dietary_conflict ×2 (warning).
  dietary: tripOf([
    day('Day 1', FRI, [
      A('meat', 'food', '13:00', { name: 'BBQ Steakhouse', durationMins: 90 }),
      A('alco', 'food', '20:00', { name: 'Rooftop Cocktail Bar', durationMins: 90 }),
    ]),
  ], {
    families: [
      { id: 'fVeg', name: 'Greens', dietary: ['vegetarian'], members: [] },
      { id: 'fDry', name: 'Sober', dietary: ['no-alcohol'], members: [] },
    ],
  }),
  // Time-less, known-hours, non-seasonal venue → no_fit_hours=error.
  noFitHours: tripOf([
    day('Day 1', FRI, [
      A('booked', 'activity', '10:00', { durationMins: 120 }),
      A('squeeze', 'activity', undefined, { name: 'Local Gallery', openHours: [{ d: 5, o: 540, c: 1020 }] }),
    ]),
  ]),
  // Google businessStatus → closed_permanently=error + closed_temporarily=warning.
  businessStatus: tripOf([
    day('Day 1', FRI, [
      A('gone', 'activity', '10:00', { name: 'Old Cafe', durationMins: 60, businessStatus: 'CLOSED_PERMANENTLY' }),
      A('maybe', 'activity', '14:00', { name: 'Renovating Museum', durationMins: 60, businessStatus: 'CLOSED_TEMPORARILY' }),
    ]),
  ]),
  // 6h+ venue + 2 other stops → full_day_conflict=warning (+ a natural overlap).
  fullDayVenue: tripOf([
    day('Day 1', FRI, [
      A('pk', 'activity', '09:00', { name: 'Theme Park', durationMins: 480 }),
      A('o1', 'activity', '10:00', { durationMins: 60 }),
      A('o2', 'activity', '11:00', { durationMins: 60 }),
    ]),
  ]),
  // Multi-night stay → check_out_by + lastday_missing_checkout, and NO unbooked_night.
  stayLifecycle: tripOf([
    day('Day 1', FRI, [
      A('in', 'stay', '15:00', { name: 'Grand Hotel', nights: 2, lat: 0, lng: 0 }),
      A('din', 'food', '19:00', { name: 'Dinner', durationMins: 90 }),
    ]),
    day('Day 2', '2026-06-13', [A('tour', 'activity', '10:00', { durationMins: 120 })]),
    day('Day 3', '2026-06-14', [A('brunch', 'food', '10:00', { name: 'Brunch', durationMins: 60 })]),
  ]),
  // First stop far from the trip origin → first_stop_unreachable=info.
  unreachable: tripOf([
    day('Day 1', FRI, [A('far', 'activity', '08:30', { name: 'Far Stop', durationMins: 120, lat: 0, lng: 5 })]),
  ], { origin: { label: 'Home City', lat: 0, lng: 0 } }),
  // Hotel change mid-trip: first hotel booked 2 nights but a 2nd hotel checks in on
  // night 2 → hotel_overlap=warning, with a one-tap trim fix to 1 night.
  hotelChange: tripOf([
    day('Day 1', FRI, [A('h1', 'stay', '15:00', { name: 'Great Wolf Lodge', nights: 2, lat: 0, lng: 0 })]),
    day('Day 2', '2026-06-13', [A('h2', 'stay', '15:00', { name: 'The Baywatch Resort', nights: 1, lat: 0, lng: 0 })]),
    day('Day 3', '2026-06-14', [A('tour', 'activity', '10:00', { durationMins: 60 })]),
  ]),
  // A single hotel booked for more nights than the trip has → hotel_overlap (trip-end branch).
  stayOverhang: tripOf([
    day('Day 1', FRI, [A('h', 'stay', '15:00', { name: 'Lake Resort', nights: 2, lat: 0, lng: 0 })]),
    day('Day 2', '2026-06-13', [A('tour', 'activity', '10:00', { durationMins: 60 })]),
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

  test('closed-venue confidence is tiered (dark-day & time-edge = provable error, seasonal = tip)', () => {
    const cv = (fx) => validateTrip(fx).find((x) => x.type === 'closed_venue');
    // dark weekday, non-seasonal → provable error
    expect(cv(FIXTURES.closedDarkDay).severity).toBe('error');
    // open that day but scheduled OUTSIDE the window, non-seasonal → provable error too
    // (we know the hours + the time → it's shut then). Blocks the green badge: no false green.
    expect(cv(FIXTURES.closedTimeEdge).severity).toBe('error');
    // seasonal-prone → never red; soft verify tip (false "closed" is the worst error)
    expect(cv(FIXTURES.closedSeasonal).severity).toBe('info');
    // every closed-venue flag carries a tap-through to the live hours
    expect(cv(FIXTURES.closedDarkDay).verifyUrl).toBeTruthy();
  });

  test('a long journey conflict stays an error', () => {
    const lj = validateTrip(FIXTURES.longJourney).filter((x) => x.type === 'long_journey_conflict');
    expect(lj).toHaveLength(1);
    expect(lj[0].severity).toBe('error');
  });

  test('coverage fixtures fire their target rule at the right severity (survives jest -u)', () => {
    const has = (fx, type) => validateTrip(FIXTURES[fx]).filter(w => w.type === type);
    const one = (fx, type) => { const m = has(fx, type); expect(m).toHaveLength(1); return m[0]; };

    expect(one('emptyMidTrip', 'empty_day').severity).toBe('warning'); // mid-trip = warning
    one('notesOnly', 'notes_only_day');
    expect(one('packedDay', 'packed').severity).toBe('info');
    expect(one('tiringLong', 'tiring_day').severity).toBe('info');
    expect(one('noMeal', 'no_meal').severity).toBe('info');
    expect(one('mealGap', 'meal_gap').severity).toBe('info');
    // meal_gap is the COMPLEMENT of no_meal: a day with meals never fires no_meal,
    // and a day with a <6h meal gap (the dietary fixture: 5.5h) never fires meal_gap.
    expect(has('mealGap', 'no_meal')).toHaveLength(0);
    expect(has('dietary', 'meal_gap')).toHaveLength(0);
    expect(one('edgeHours', 'early_start').severity).toBe('info');
    expect(one('edgeHours', 'past_midnight').severity).toBe('info');
    expect(one('duplicate', 'duplicate_activity').severity).toBe('warning');
    expect(one('overnightTransit', 'multi_day_journey').severity).toBe('info');
    expect(one('wakeLate', 'wake_time').severity).toBe('info');
    expect(one('wakeRegular', 'wake_time').severity).toBe('info');
    expect(has('dietary', 'dietary_conflict')).toHaveLength(2);
    has('dietary', 'dietary_conflict').forEach(w => expect(w.severity).toBe('warning'));
    const nf = one('noFitHours', 'no_fit_hours');
    expect(nf.severity).toBe('error');
    expect(nf.verifyUrl).toBeTruthy();
    expect(one('businessStatus', 'closed_permanently').severity).toBe('error');
    expect(one('businessStatus', 'closed_temporarily').severity).toBe('warning');
    expect(one('fullDayVenue', 'full_day_conflict').severity).toBe('warning');
    // multi-night stay: lodging covers both nights → zero unbooked_night
    expect(has('stayLifecycle', 'unbooked_night')).toHaveLength(0);
    expect(has('stayLifecycle', 'check_out_by').length).toBeGreaterThanOrEqual(1);
    one('stayLifecycle', 'lastday_missing_checkout');
    expect(one('unreachable', 'first_stop_unreachable').severity).toBe('info');
    const ho = one('hotelChange', 'hotel_overlap');
    expect(ho.severity).toBe('warning');
    expect(ho.trimToNights).toBe(1);
    expect(ho.trimStayId).toBe('h1');
    const so = one('stayOverhang', 'hotel_overlap');
    expect(so.severity).toBe('warning');
    expect(so.trimToNights).toBe(1);
  });

  test('summary counts are locked per fixture (survives jest -u)', () => {
    const counts = Object.fromEntries(
      Object.entries(FIXTURES).map(([k, t]) => [k, summariseWarnings(validateTrip(t))]),
    );
    expect(counts).toMatchSnapshot();
  });
});
