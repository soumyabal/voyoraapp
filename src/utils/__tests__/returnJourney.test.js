/**
 * returnJourney.test.js — the last-day "heading home" draft. Pre-fills ONLY known facts
 * (home origin, last-day date, arrival mode mirrored), never a cost, never silently
 * committed. Returns null whenever it can't be confidently helpful.
 */
import { returnJourneyDraft } from '../autoArrange';

const day = (label, date, activities = []) => ({ label, date, activities });
const HOME = { label: 'Chicago, IL', lat: 41.88, lng: -87.63 };
const tripOf = (days, origin = HOME) => ({ origin, days });

describe('returnJourneyDraft', () => {
  test('mirrors the arrival mode and heads to the home origin (no cost guessed)', () => {
    const trip = tripOf([
      day('D1', '2026-07-10', [{ id: 't', type: 'transport', subtype: 'flight', name: 'Flight to Miami' }]),
      day('D2', '2026-07-11', [{ id: 'a', type: 'activity', name: 'Beach', time: '10:00' }]),
    ]);
    const d = returnJourneyDraft(trip);
    expect(d.type).toBe('transport');
    expect(d.subtype).toBe('flight');                 // mirrors the arrival
    expect(d.name).toBe('Flight home to Chicago, IL');
    expect(d.lat).toBe(HOME.lat);                     // destination = home
    expect(d.costPerPerson).toBe(0);                  // never guesses a fare
    expect(d.source).toBe('auto-return');
  });

  test('a road trip (drove in) proposes a drive home', () => {
    const trip = tripOf([
      day('D1', '2026-07-10', [{ id: 't', type: 'transport', subtype: 'car', name: 'Drive to the lake' }]),
      day('D2', '2026-07-11', []),
    ]);
    expect(returnJourneyDraft(trip).name).toBe('Drive home to Chicago, IL');
  });

  test('no arrival transport → a generic drive home', () => {
    const trip = tripOf([day('D1', '2026-07-10', []), day('D2', '2026-07-11', [])]);
    expect(returnJourneyDraft(trip).subtype).toBe('car');
  });

  test('proposes nothing when a way home is already planned (find-or-update)', () => {
    const trip = tripOf([
      day('D1', '2026-07-10', [{ id: 't', type: 'transport', subtype: 'flight' }]),
      day('D2', '2026-07-11', [{ id: 'r', type: 'transport', subtype: 'flight', name: 'Flight back' }]),
    ]);
    expect(returnJourneyDraft(trip)).toBeNull();
  });

  test('proposes nothing without a home origin (the soft tip handles it)', () => {
    const trip = tripOf([day('D1', '2026-07-10', []), day('D2', '2026-07-11', [])], null);
    expect(returnJourneyDraft(trip)).toBeNull();
  });

  test('proposes nothing on an EMPTY one-day trip (nowhere to return from)', () => {
    expect(returnJourneyDraft(tripOf([day('D1', '2026-07-10', [])]))).toBeNull();
  });

  test('a DAY TRIP with a stop away from home proposes a drive back FROM the farthest stop', () => {
    const HOLLAND = { lat: 42.79, lng: -86.11 };   // Holland, MI — far from Chicago
    const trip = tripOf([
      day('D1', '2026-07-10', [
        { id: 't', type: 'transport', subtype: 'car', name: 'Drive to Holland', ...HOLLAND },
      ]),
    ]);
    const d = returnJourneyDraft(trip);
    expect(d).not.toBeNull();
    expect(d.subtype).toBe('car');                  // mirrors the outbound drive
    expect(d.lat).toBe(HOME.lat);                   // destination = home
    expect(d.fromLat).toBeCloseTo(HOLLAND.lat);     // departs FROM where the day trip reached
    expect(d.name).toContain('Holland');
    expect(d.name).toContain('Chicago');
  });

  test('a day trip that already has a drive back home proposes nothing', () => {
    const HOLLAND = { lat: 42.79, lng: -86.11 };
    const trip = tripOf([
      day('D1', '2026-07-10', [
        { id: 't', type: 'transport', subtype: 'car', name: 'Drive to Holland', ...HOLLAND },
        { id: 'r', type: 'transport', subtype: 'car', name: 'Drive home', lat: HOME.lat, lng: HOME.lng },
      ]),
    ]);
    expect(returnJourneyDraft(trip)).toBeNull();    // homeward leg already present
  });

  test('open-jaw: the return departs from where the trip ENDS, not where it arrived', () => {
    // Fly into LA, end in San Diego → home flight departs from SAN-area, not LA.
    const SD = { lat: 32.72, lng: -117.16 };
    const trip = tripOf([
      day('D1', '2026-07-10', [{ id: 'f', type: 'transport', subtype: 'flight', name: 'Fly to LA' }]),
      day('D2', '2026-07-11', [{ id: 'h', type: 'stay', name: 'San Diego Inn', nights: 1, ...SD }]),
      day('D3', '2026-07-12', [{ id: 'a', type: 'activity', name: 'Museum', time: '10:00' }]),
    ]);
    const d = returnJourneyDraft(trip);
    expect(d.subtype).toBe('flight');               // mirrors the arrival mode
    expect(d.fromLat).toBeCloseTo(SD.lat);          // departs from the trip END (San Diego), not LA
    expect(d.name).toContain('San Diego Inn');      // ...from where the trip ends
    expect(d.name).toContain('Chicago');            // ...home
  });

  test('a road-trip loop that ends back near home proposes nothing', () => {
    const trip = tripOf([
      day('D1', '2026-07-10', [{ id: 't', type: 'transport', subtype: 'car', name: 'Drive out' }]),
      day('D2', '2026-07-11', [{ id: 'h', type: 'stay', name: 'Suburb Motel', nights: 1, lat: 41.9, lng: -87.65 }]), // ~near Chicago
      day('D3', '2026-07-12', [{ id: 'a', type: 'activity', name: 'X', time: '10:00' }]),
    ]);
    expect(returnJourneyDraft(trip)).toBeNull();     // you end where you started → already home
  });
});
