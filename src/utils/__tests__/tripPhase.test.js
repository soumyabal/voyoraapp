/**
 * tripPhase.test.js — trip lifecycle (before/during/after) + the landing-day fix
 * for "a not-started trip opens on Day 2".
 */
import { tripPhase, defaultDayFor, daysBetweenISO, nowNextOf, openFocusFor, dayZoneLabel, resolveDayZones, pastActivityIds, isDayInPast, planFloorMin } from '../helpers';

const trip = (start, end, nDays) => ({
  startDate: start, endDate: end,
  days: Array.from({ length: nDays }, (_, i) => ({ label: `Day ${i + 1}` })),
});

describe('tripPhase', () => {
  const t = trip('2026-07-10', '2026-07-13', 4);
  test('upcoming before the start date', () => expect(tripPhase(t, '2026-07-04')).toBe('upcoming'));
  test('active on the start day', () => expect(tripPhase(t, '2026-07-10')).toBe('active'));
  test('active mid-trip', () => expect(tripPhase(t, '2026-07-12')).toBe('active'));
  test('active on the end day', () => expect(tripPhase(t, '2026-07-13')).toBe('active'));
  test('past after the end date', () => expect(tripPhase(t, '2026-07-14')).toBe('past'));
  test('undated when no dates', () => expect(tripPhase({ days: [] }, '2026-07-10')).toBe('undated'));
});

describe('defaultDayFor — the "Day 2 before you start" fix', () => {
  const t = trip('2026-07-10', '2026-07-13', 4);
  test('UPCOMING trip lands on Day 1 (index 0), never Day 2', () => expect(defaultDayFor(t, '2026-07-04')).toBe(0));
  test('ACTIVE: start day → index 0', () => expect(defaultDayFor(t, '2026-07-10')).toBe(0));
  test('ACTIVE: third day → index 2 (today is day 3 of the trip)', () => expect(defaultDayFor(t, '2026-07-12')).toBe(2));
  test('ACTIVE: clamps to the last day', () => expect(defaultDayFor(t, '2026-07-13')).toBe(3));
  test('PAST trip lands on Day 1 (recap)', () => expect(defaultDayFor(t, '2026-07-20')).toBe(0));
  test('undated trip → Day 1', () => expect(defaultDayFor({ days: [{}, {}] }, '2026-07-10')).toBe(0));
  test('no days → 0', () => expect(defaultDayFor({ startDate: '2026-07-10', endDate: '2026-07-13', days: [] }, '2026-07-11')).toBe(0));
});

describe('nowNextOf — live "now / next" orientation', () => {
  const day = { activities: [
    { name: 'Breakfast', time: '08:00' },
    { name: 'Museum', time: '10:00' },
    { name: 'Lunch', time: '13:00', status: 'skipped' }, // skipped → ignored
    { name: 'Park', time: '15:00' },
    { name: 'Note', time: '16:00', type: 'note' },        // note → ignored
  ] };
  test('mid-day: now = the latest started, next = the first upcoming', () => {
    const r = nowNextOf(day, 11 * 60); // 11:00
    expect(r.now.name).toBe('Museum');
    expect(r.next.name).toBe('Park'); // Lunch is skipped → next real is Park
  });
  test('before the first stop: no now, next is the first', () => {
    const r = nowNextOf(day, 7 * 60);
    expect(r.now).toBeNull();
    expect(r.next.name).toBe('Breakfast');
  });
  test('after the last stop: a now, no next', () => {
    const r = nowNextOf(day, 20 * 60);
    expect(r.now.name).toBe('Park');
    expect(r.next).toBeNull();
  });
  test('empty day → empty flag', () => {
    expect(nowNextOf({ activities: [] }, 600).empty).toBe(true);
  });
});

describe('openFocusFor — timezone-aware "open to now"', () => {
  // 4-day trip in LA; days carry activities so we can find now/next.
  const t = {
    startDate: '2026-07-10', endDate: '2026-07-13', defaultTz: 'America/Los_Angeles',
    days: [
      { label: 'Day 1', activities: [{ id: 'd1a', time: '09:00' }] },
      { label: 'Day 2', activities: [{ id: 'd2morning', time: '09:00' }, { id: 'd2afternoon', time: '14:00' }] },
      { label: 'Day 3', activities: [] },
      { label: 'Day 4', activities: [{ id: 'd4a', time: '09:00' }] },
    ],
  };

  test('ACTIVE: lands on the destination day + the current (already-started) activity', () => {
    // 2026-07-11 19:00 UTC = 12:00 PDT on the 11th → Day 2, 12:00 → "now" = the 09:00 stop
    const f = openFocusFor(t, Date.UTC(2026, 6, 11, 19, 0));
    expect(f).toEqual({ dayIndex: 1, activityId: 'd2morning' });
  });

  test('ACTIVE before the first stop → focuses the NEXT activity', () => {
    // 2026-07-11 15:00 UTC = 08:00 PDT → Day 2, before 09:00 → next = the 09:00 stop
    expect(openFocusFor(t, Date.UTC(2026, 6, 11, 15, 0)).activityId).toBe('d2morning');
  });

  test('the destination zone, not the device, decides the day', () => {
    // Same instant, but a Tokyo trip is a calendar day ahead → Day 3, not Day 2.
    const tokyo = { ...t, defaultTz: 'Asia/Tokyo' };
    // 2026-07-11 19:00 UTC = 2026-07-12 04:00 JST → Day 3 (index 2), which is empty → no activity
    expect(openFocusFor(tokyo, Date.UTC(2026, 6, 11, 19, 0))).toEqual({ dayIndex: 2, activityId: null });
  });

  test('UPCOMING → Day 1, no activity focus', () => {
    expect(openFocusFor(t, Date.UTC(2026, 6, 1, 19, 0))).toEqual({ dayIndex: 0, activityId: null });
  });

  test('PAST → Day 1 (recap), no activity focus', () => {
    expect(openFocusFor(t, Date.UTC(2026, 6, 20, 19, 0))).toEqual({ dayIndex: 0, activityId: null });
  });
});

describe('dayZoneLabel — badge only when the day differs from home', () => {
  const day = (date) => ({ date, label: date });
  test('abroad (offset differs from home) → DST-correct abbr', () => {
    const t = { homeTz: 'America/Chicago', defaultTz: 'Asia/Tokyo', days: [day('2026-07-11')] };
    expect(dayZoneLabel(t, 0)).toBe('GMT+9');   // Tokyo has no common abbr → GMT offset form
  });
  test('domestic (same offset as home) → no badge', () => {
    const t = { homeTz: 'America/Chicago', defaultTz: 'America/Chicago', days: [day('2026-07-11')] };
    expect(dayZoneLabel(t, 0)).toBe('');
  });
  test('DST-correct per date: US/Eastern from a Chicago home is shown both summer + winter', () => {
    const t = { homeTz: 'America/Chicago', defaultTz: 'America/New_York', days: [day('2026-07-11'), day('2026-01-11')] };
    expect(dayZoneLabel(t, 0)).toBe('EDT');   // summer
    expect(dayZoneLabel(t, 1)).toBe('EST');   // winter — same zone, DST-aware label
  });
  test('missing zones/date → empty (no crash)', () => {
    expect(dayZoneLabel({ days: [{}] }, 0)).toBe('');
  });
  test('lights up from a day\'s located stops even when defaultTz = home (the origin=home case)', () => {
    // Home + defaultTz both Chicago (origin was home), but the day's stop is in Tokyo →
    // the badge appears from the stop, not the (home) defaultTz.
    const t = {
      homeTz: 'America/Chicago', defaultTz: 'America/Chicago',
      days: [{ date: '2026-07-11', activities: [{ lat: 35.68, lng: 139.76 }] }],  // Tokyo
    };
    expect(dayZoneLabel(t, 0)).toBe('GMT+9');
  });
});

describe('resolveDayZones — a zone label on EVERY stop (consistent, never blank)', () => {
  const CHI = { lat: 41.88, lng: -87.63 };   // Chicago, America/Chicago (CDT in summer)
  const TVC = { lat: 44.76, lng: -85.62 };   // Traverse City MI, America/Detroit (EDT in summer)
  const MKE = { lat: 43.04, lng: -87.91 };   // Milwaukee WI, America/Chicago (CDT) — same zone as Chicago
  const z = (t, i = 0) => resolveDayZones(t, i).zoneById;

  test('Chicago → Michigan travel day: each stop carries its own zone', () => {
    const t = { homeTz: 'America/Chicago', days: [{ date: '2026-07-11', activities: [
      { id: 'breakfast', time: '09:00', ...CHI },
      { id: 'drive',     time: '11:00', ...CHI },
      { id: 'checkin',   time: '14:00', ...TVC },
      { id: 'dinner',    time: '18:00', ...TVC },
    ] }] };
    expect(z(t)).toEqual({ breakfast: 'CDT', drive: 'CDT', checkin: 'EDT', dinner: 'EDT' });
  });

  test('Chicago → Wisconsin (same zone) still shows CDT on each — no more blank (the bug)', () => {
    const t = { homeTz: 'America/Chicago', days: [{ date: '2026-07-11', activities: [
      { id: 'a', time: '09:00', ...CHI },
      { id: 'b', time: '14:00', ...MKE },
    ] }] };
    expect(z(t)).toEqual({ a: 'CDT', b: 'CDT' });
  });

  test('a location-less manual activity inherits the previous activity\'s zone', () => {
    const t = { homeTz: 'America/Chicago', days: [{ date: '2026-07-11', activities: [
      { id: 'checkin', time: '14:00', ...TVC },
      { id: 'walk',    time: '16:00' },              // no coords → inherits EDT
    ] }] };
    expect(z(t)).toEqual({ checkin: 'EDT', walk: 'EDT' });
  });

  test('carries the zone across days: a location-less day inherits yesterday\'s last zone', () => {
    const t = { homeTz: 'America/Chicago', days: [
      { date: '2026-07-11', activities: [{ id: 'x', time: '14:00', ...TVC }] },   // ends in Eastern
      { date: '2026-07-12', activities: [{ id: 'y', time: '10:00' }] },           // no coords → Eastern
    ] };
    expect(z(t, 1)).toEqual({ y: 'EDT' });
  });
});

describe('pastActivityIds / isDayInPast / planFloorMin — clock-aware locking (TZ)', () => {
  const LA = { lat: 34.05, lng: -118.24 };  // PDT (-7) in July
  // A day in LA on 2026-07-11 with stops at 09:00, 13:00, 18:00 (local).
  const trip = {
    homeTz: 'America/Los_Angeles', defaultTz: 'America/Los_Angeles',
    startDate: '2026-07-10', endDate: '2026-07-13',
    days: [
      { date: '2026-07-10', activities: [{ id: 'd0', time: '10:00', ...LA }] },
      { date: '2026-07-11', activities: [
        { id: 'morning',   time: '09:00', ...LA },
        { id: 'afternoon', time: '13:00', ...LA },
        { id: 'evening',   time: '18:00', ...LA },
      ] },
      { date: '2026-07-12', activities: [{ id: 'd2', time: '10:00', ...LA }] },
    ],
  };
  // 2026-07-11 14:00 PDT = 21:00 UTC
  const NOW = Date.UTC(2026, 6, 11, 21, 0);

  test('pastActivityIds: stops whose local start has passed are flagged', () => {
    const past = pastActivityIds(trip, 1, NOW);
    expect(past.has('morning')).toBe(true);    // 09:00 < 14:00
    expect(past.has('afternoon')).toBe(true);  // 13:00 < 14:00
    expect(past.has('evening')).toBe(false);   // 18:00 > 14:00
  });

  test('isDayInPast: yesterday past, today not, tomorrow not', () => {
    expect(isDayInPast(trip, 0, NOW)).toBe(true);   // 07-10 < 07-11
    expect(isDayInPast(trip, 1, NOW)).toBe(false);  // today
    expect(isDayInPast(trip, 2, NOW)).toBe(false);  // tomorrow
  });

  test('planFloorMin: past day → 1440, today → now-minute, future → 0', () => {
    expect(planFloorMin(trip, 0, NOW)).toBe(24 * 60);   // past
    expect(planFloorMin(trip, 1, NOW)).toBe(14 * 60);   // today, 14:00 PDT
    expect(planFloorMin(trip, 2, NOW)).toBe(0);         // future
  });

  test('timezone matters: the same instant is "earlier" in a more-eastern destination', () => {
    // If the trip were in New York (EDT, +3h vs LA), 14:00 PDT = 17:00 EDT → the 13:00 NY stop
    // is past but so is more of the day.
    const nyTrip = { ...trip, homeTz: 'America/New_York', defaultTz: 'America/New_York',
      days: trip.days.map(d => ({ ...d, activities: d.activities.map(a => ({ ...a, lat: 40.71, lng: -74.0 })) })) };
    expect(planFloorMin(nyTrip, 1, NOW)).toBe(17 * 60);  // 17:00 EDT
  });
});

describe('daysBetweenISO', () => {
  test('counts whole days', () => expect(daysBetweenISO('2026-07-10', '2026-07-12')).toBe(2));
  test('handles a month boundary', () => expect(daysBetweenISO('2026-06-30', '2026-07-02')).toBe(2));
  test('same day → 0', () => expect(daysBetweenISO('2026-07-10', '2026-07-10')).toBe(0));
});
