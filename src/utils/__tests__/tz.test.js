/**
 * tz.test.js — the timezone engine. Node's jest runtime has full ICU, so these exercise the
 * real Intl path (the same code feature-detects on Hermes via tzSupported()).
 */
import {
  offsetMinutes, zonedWallToUtcMs, tzAbbr, zoneShortLabel,
  formatGmtOffset, crossZoneLegMinutes, tzForCoords, tzForDay,
  zonedNowDate, zonedNowMinutes, deviceTz, tzSupported, _resetTzSupportCache,
} from '../tz';

const zoneNowParts = (tz, ms) => [zonedNowDate(tz, ms), zonedNowMinutes(tz, ms)];

describe('offsetMinutes — DST-correct minutes ahead of UTC', () => {
  test('America/New_York: EST in winter (-300), EDT in summer (-240)', () => {
    expect(offsetMinutes('America/New_York', Date.UTC(2025, 0, 15))).toBe(-300);
    expect(offsetMinutes('America/New_York', Date.UTC(2025, 6, 15))).toBe(-240);
  });
  test('Asia/Kolkata is +330 (no DST), year-round', () => {
    expect(offsetMinutes('Asia/Kolkata', Date.UTC(2025, 0, 15))).toBe(330);
    expect(offsetMinutes('Asia/Kolkata', Date.UTC(2025, 6, 15))).toBe(330);
  });
  test('UTC is 0; empty tz is 0', () => {
    expect(offsetMinutes('UTC', Date.UTC(2025, 5, 1))).toBe(0);
    expect(offsetMinutes('', Date.UTC(2025, 5, 1))).toBe(0);
  });
});

describe('zonedWallToUtcMs — floating wall time → absolute instant', () => {
  test('08:00 EDT (summer) = 12:00 UTC', () => {
    expect(zonedWallToUtcMs('2025-07-01', '08:00', 'America/New_York'))
      .toBe(Date.UTC(2025, 6, 1, 12, 0));
  });
  test('08:00 EST (winter) = 13:00 UTC', () => {
    expect(zonedWallToUtcMs('2025-01-01', '08:00', 'America/New_York'))
      .toBe(Date.UTC(2025, 0, 1, 13, 0));
  });
  test('09:30 IST = 04:00 UTC (half-hour zone)', () => {
    expect(zonedWallToUtcMs('2025-06-01', '09:30', 'Asia/Kolkata'))
      .toBe(Date.UTC(2025, 5, 1, 4, 0));
  });
  test('no tz → treats the wall time as UTC (graceful)', () => {
    expect(zonedWallToUtcMs('2025-06-01', '10:00', null)).toBe(Date.UTC(2025, 5, 1, 10, 0));
  });
  test('round-trips through offsetMinutes', () => {
    const ms = zonedWallToUtcMs('2025-07-01', '15:00', 'America/Los_Angeles');
    // 15:00 PDT (-420) → 22:00 UTC
    expect(ms).toBe(Date.UTC(2025, 6, 1, 22, 0));
  });
  test('an unparseable date → NaN (guarded)', () => {
    expect(Number.isNaN(zonedWallToUtcMs('nope', '10:00', 'UTC'))).toBe(true);
  });
});

describe('tzAbbr / zoneShortLabel', () => {
  test('tzAbbr gives a short name for the instant', () => {
    expect(tzAbbr('America/New_York', Date.UTC(2025, 6, 15))).toBe('EDT');
    expect(tzAbbr('America/New_York', Date.UTC(2025, 0, 15))).toBe('EST');
  });
  test('zoneShortLabel resolves the instant from (date, wall)', () => {
    expect(zoneShortLabel('America/Los_Angeles', '2025-07-01', '09:00')).toBe('PDT');
    expect(zoneShortLabel('America/Los_Angeles', '2025-01-01', '09:00')).toBe('PST');
  });
  test('empty tz → empty label (no crash)', () => {
    expect(tzAbbr('', Date.UTC(2025, 5, 1))).toBe('');
    expect(zoneShortLabel(null, '2025-06-01', '10:00')).toBe('');
  });
});

describe('formatGmtOffset', () => {
  test('formats whole and half-hour offsets', () => {
    expect(formatGmtOffset(0)).toBe('GMT');
    expect(formatGmtOffset(-420)).toBe('GMT-7');
    expect(formatGmtOffset(330)).toBe('GMT+5:30');
    expect(formatGmtOffset(-210)).toBe('GMT-3:30');
  });
});

describe('crossZoneLegMinutes — true elapsed time of a cross-zone leg', () => {
  test('LA 09:00 PDT → NYC 17:00 EDT same day = 5h (300 min)', () => {
    const min = crossZoneLegMinutes(
      { date: '2025-07-01', time: '09:00', tz: 'America/Los_Angeles' },
      { date: '2025-07-01', time: '17:00', tz: 'America/New_York' },
    );
    expect(min).toBe(300);   // 16:00 UTC → 21:00 UTC
  });
  test('a red-eye that lands the next calendar day is positive', () => {
    const min = crossZoneLegMinutes(
      { date: '2025-07-01', time: '23:00', tz: 'America/Los_Angeles' },
      { date: '2025-07-02', time: '07:00', tz: 'America/New_York' },
    );
    expect(min).toBe(300);   // 06:00Z → 11:00Z next day
  });
  test('missing endpoint → NaN', () => {
    expect(Number.isNaN(crossZoneLegMinutes(null, { date: '2025-07-01', time: '09:00', tz: 'UTC' }))).toBe(true);
  });
});

describe('tzForCoords — offline coords → IANA zone', () => {
  test('resolves well-known cities', () => {
    expect(tzForCoords(34.05, -118.24)).toBe('America/Los_Angeles');
    expect(tzForCoords(40.71, -74.00)).toBe('America/New_York');
    expect(tzForCoords(51.5, -0.12)).toBe('Europe/London');
  });
  test('null for missing / non-numeric coords', () => {
    expect(tzForCoords(null, -118)).toBeNull();
    expect(tzForCoords(34, undefined)).toBeNull();
    expect(tzForCoords('x', 'y')).toBeNull();
  });
  test('out-of-range coords are guarded (no throw → null)', () => {
    expect(tzForCoords(999, 999)).toBeNull();
  });
  test('accepts numeric strings (geocode output is sometimes stringy)', () => {
    expect(tzForCoords('34.05', '-118.24')).toBe('America/Los_Angeles');
  });
});

describe('zonedNowDate / zonedNowMinutes — the destination "now"', () => {
  // 2025-07-01 12:00 UTC
  const noonUTC = Date.UTC(2025, 6, 1, 12, 0);
  test('same instant is a different civil date across zones', () => {
    expect(zoneNowParts('America/Los_Angeles', noonUTC)).toEqual(['2025-07-01', 5 * 60]);  // 05:00 PDT
    expect(zoneNowParts('Asia/Tokyo', noonUTC)).toEqual(['2025-07-01', 21 * 60]);          // 21:00 JST
  });
  test('rolls the date back when the zone is behind UTC midnight', () => {
    const sixUTC = Date.UTC(2025, 6, 1, 6, 0);  // 06:00 UTC
    // LA is -7 → 23:00 the PREVIOUS day
    expect(zoneNowParts('America/Los_Angeles', sixUTC)).toEqual(['2025-06-30', 23 * 60]);
  });
  test('rolls the date forward when the zone is ahead', () => {
    const eveUTC = Date.UTC(2025, 6, 1, 18, 0);  // 18:00 UTC
    // Tokyo +9 → 03:00 the NEXT day
    expect(zoneNowParts('Asia/Tokyo', eveUTC)).toEqual(['2025-07-02', 3 * 60]);
  });
});

describe('tzForDay — the single zone-resolution rule', () => {
  test('day override wins over the trip default', () => {
    const trip = { defaultTz: 'America/Chicago', days: [{ tz: 'America/New_York' }] };
    expect(tzForDay(trip, 0)).toBe('America/New_York');
  });
  test('falls back to defaultTz, then homeTz', () => {
    expect(tzForDay({ defaultTz: 'Asia/Tokyo', days: [{}] }, 0)).toBe('Asia/Tokyo');
    expect(tzForDay({ homeTz: 'Europe/Paris', days: [{}] }, 0)).toBe('Europe/Paris');
  });
  test('no zones anywhere → device zone (never crashes)', () => {
    expect(typeof tzForDay({ days: [{}] }, 0)).toBe('string');
    expect(typeof tzForDay(null, 0)).toBe('string');
  });
});

describe('tzSupported (the runtime spike) + deviceTz', () => {
  test('reports true on a full-ICU runtime (Node/jest)', () => {
    _resetTzSupportCache();
    expect(tzSupported()).toBe(true);
  });
  test('is cached after first call', () => {
    _resetTzSupportCache();
    tzSupported();
    expect(tzSupported()).toBe(true);  // second call returns the cached value
  });
  test('deviceTz returns a non-empty IANA string', () => {
    const z = deviceTz();
    expect(typeof z).toBe('string');
    expect(z.length).toBeGreaterThan(0);
  });
});
