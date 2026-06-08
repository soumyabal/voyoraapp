/**
 * itineraryParser.test.js — proves the deterministic STRUCTURE parse on the owner's real Gemini
 * sample (docs/smart-paste-import.md). Validates: dates→days, segments, slots/stops/options, type
 * classification, and candidate place extraction. Entity recall is heuristic (documented) — these
 * assert the spine is reliable, not that extraction is perfect.
 */
import { parseItineraryText, extractCandidates, classifyType } from '../itineraryParser';

// The Gemini itinerary, in its natural newline format.
const SAMPLE = `
Segment 1: Los Angeles (June 30 – July 3)
June 30: Arrival & Santa Monica
Land at LAX, grab your rental car, and head straight to the coast.
Spend the afternoon walking the Santa Monica Pier and renting a bike to cruise along the beach path to Venice Beach.
July 1: Hollywood & Griffith Observatory
Morning: Hike the trails at Griffith Park for a close-up view of the Hollywood Sign.
Afternoon: Explore the Griffith Observatory for panoramic views of the city.
Evening: Drive down the Sunset Strip or find a dinner spot in West Hollywood.
July 2: Theme Park or Museum Day
Option A: Spend a high-energy day at Universal Studios Hollywood.
Option B: Dive into culture by visiting the Getty Center and the Los Angeles County Museum of Art (LACMA).
Segment 2: The Coastal Road Trip (July 3)
July 3: Pacific Coast Highway (PCH) to San Diego
Check out of your LA hotel and head south down the coast.
Stop 1 (Huntington Beach): Grab breakfast and watch the surfers at Surf City USA.
Stop 2 (Laguna Beach): Stroll around Heisler Park for stunning cliffside ocean views.
Stop 3 (San Juan Capistrano): Stretch your legs at the historic Mission San Juan Capistrano.
Segment 3: San Diego (July 3 – July 8)
July 4: Independence Day Celebrations
Morning: Explore the historic Gaslamp Quarter or Balboa Park.
Evening: Head to San Diego Bay to watch the Big Bay Boom fireworks show, typically starting at 9:00 PM.
July 5: La Jolla & Sunset Cliffs
Morning: Visit La Jolla Cove to see the wild sea lions and kayak through the ocean caves.
Evening: Catch a classic California sunset at Sunset Cliffs Natural Park.
July 6: Balboa Park & San Diego Zoo
Spend the day at Balboa Park, then dedicate the afternoon to the world-famous San Diego Zoo.
July 7: Coronado Island & Old Town
Morning: Drive across the bridge to Coronado Island and visit the Hotel del Coronado.
Afternoon: Head to Old Town San Diego State Historic Park.
July 8: Coastal Drive Back & Departure
Check out of your San Diego hotel.
Drive 2 to 2.5 hours north back to LAX, drop off your rental car and catch your flight home to ORD.
`;

describe('parseItineraryText — structure', () => {
  const r = parseItineraryText(SAMPLE, { year: 2026 });

  test('extracts the 3 segments with cities', () => {
    expect(r.segments).toHaveLength(3);
    expect(r.segments.map(s => s.city)).toEqual(['Los Angeles', 'The Coastal Road Trip', 'San Diego']);
  });

  test('extracts 9 dated days, June 30 → July 8, in order', () => {
    expect(r.days).toHaveLength(9);
    expect(r.days[0].date).toBe('2026-06-30');
    expect(r.days[r.days.length - 1].date).toBe('2026-07-08');
    expect(r.days.map(d => d.date)).toEqual([
      '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03',
      '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
    ]);
  });

  test('assigns days to their segment city', () => {
    expect(r.days[0].segment).toBe('Los Angeles');     // June 30
    expect(r.days[4].segment).toBe('San Diego');       // July 4
  });

  test('captures slots, stops and options as typed items', () => {
    const jul3 = r.days.find(d => d.date === '2026-07-03');
    const stops = jul3.items.filter(i => i.kind === 'stop');
    expect(stops.map(s => s.place)).toEqual(['Huntington Beach', 'Laguna Beach', 'San Juan Capistrano']);

    const jul2 = r.days.find(d => d.date === '2026-07-02');
    expect(jul2.items.filter(i => i.kind === 'option').map(o => o.optionKey)).toEqual(['A', 'B']);

    const jul1 = r.days.find(d => d.date === '2026-07-01');
    expect(jul1.items.filter(i => i.kind === 'slot').map(s => s.slot)).toEqual(['morning', 'afternoon', 'evening']);
  });
});

describe('parseItineraryText — type classification', () => {
  const r = parseItineraryText(SAMPLE, { year: 2026 });
  const itemsOf = (date) => r.days.find(d => d.date === date).items;

  test('classifies arrival/flight, drives, meals, and hotel checkout', () => {
    expect(itemsOf('2026-06-30')[0].type).toBe('transport');   // "Land at LAX..."
    expect(itemsOf('2026-07-03').find(i => i.place === 'Huntington Beach').type).toBe('food'); // "Grab breakfast..."
    const jul8 = itemsOf('2026-07-08');
    expect(jul8.find(i => /Check out/.test(i.text)).type).toBe('stay');   // standalone checkout line
    expect(jul8.some(i => i.type === 'transport')).toBe(true);  // "...catch your flight home to ORD"
  });

  test('the action lexicon maps clean lines to the right type', () => {
    expect(classifyType('Dinner at a rooftop restaurant').type).toBe('food');
    expect(classifyType('Drive down the coast').type).toBe('transport');
    expect(classifyType('Check out of the hotel').type).toBe('stay');
    expect(classifyType('Visit the art museum').type).toBe('activity');
  });

  test('expanded transport modes: ship / train / bus with subtypes', () => {
    expect(classifyType('Board the ferry to Mackinac Island')).toEqual({ type: 'transport', sub: 'ship' });
    expect(classifyType('7-day Caribbean cruise')).toEqual({ type: 'transport', sub: 'ship' });
    expect(classifyType('Take the bullet train to Kyoto')).toEqual({ type: 'transport', sub: 'train' });
    expect(classifyType('Eurostar to Paris')).toEqual({ type: 'transport', sub: 'train' });
    expect(classifyType('Catch the airport shuttle')).toEqual({ type: 'transport', sub: 'bus' });
    // a scenic "cruise along the coast" stays a DRIVE, not a ship
    expect(classifyType('Cruise along the Pacific Coast Highway')).toEqual({ type: 'transport', sub: 'car' });
    // more stay / food cues
    expect(classifyType('Check in to the ryokan').type).toBe('stay');
    expect(classifyType('Tapas crawl in the old town').type).toBe('food');
  });

  test('KNOWN LIMITATION: a compound line is typed by its FIRST action (documented)', () => {
    // "Drive down the Sunset Strip or find a dinner spot..." → transport wins (drive first).
    // Sentence-splitting to catch the second intent is listed as future work in the doc.
    const jul1 = itemsOf('2026-07-01');
    expect(jul1.find(i => /dinner/.test(i.text)).type).toBe('transport');
  });
});

describe('parseItineraryText — real-world formats (markdown + "Day N")', () => {
  // The common ChatGPT shape: markdown bullets/bold + "Day N" headers (no calendar dates).
  const MD = `
# Tokyo Trip

**Day 1: Arrival in Tokyo**
- Morning: Land at Narita and take the train to Shinjuku.
- Afternoon: Explore Shinjuku Gardens.
- Evening: Dinner in Shibuya.

**Day 2: Temples & Culture**
- Visit Sensoji Temple.
- Afternoon: the Meiji Shrine.

**Day 3: Day Trip**
1. Morning: Take the bullet train to Hakone.
2. Evening: Return to Tokyo.
`;

  test('parses "Day N" headers and synthesises consecutive dates from the base', () => {
    const r = parseItineraryText(MD, { startDate: '2026-09-10' });
    expect(r.days).toHaveLength(3);
    expect(r.days.map(d => d.date)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(r.days[0].title).toMatch(/Arrival in Tokyo/);
  });

  test('strips markdown bullets/bold and still classifies + finds slots', () => {
    const r = parseItineraryText(MD, { startDate: '2026-09-10' });
    const d1 = r.days[0];
    expect(d1.items.filter(i => i.kind === 'slot').map(i => i.slot)).toEqual(['morning', 'afternoon', 'evening']);
    expect(d1.items.find(i => /Land at Narita/.test(i.text)).type).toBe('transport');
    expect(d1.items.find(i => /Dinner in Shibuya/.test(i.text)).type).toBe('food');
  });

  test('an embedded calendar date in a "Day N" header wins over the synthesised one', () => {
    const r = parseItineraryText('Day 1 (July 4): Fireworks\nEvening: Watch the show.', { year: 2026, startDate: '2026-01-01' });
    expect(r.days[0].date).toBe('2026-07-04');
  });

  test('WALL OF TEXT: parses even when newlines are lost (markers run together)', () => {
    // The same plan as one paragraph (the common "paste lost its newlines" case).
    const wall = 'Segment 1: Los Angeles (June 30 – July 3) June 30: Arrival Land at LAX. ' +
      'Morning: Santa Monica Pier. July 1: Hollywood Afternoon: Griffith Observatory. ' +
      'Stop 1 (Laguna Beach): Heisler Park.';
    const r = parseItineraryText(wall, { year: 2026 });
    expect(r.segments).toHaveLength(1);
    expect(r.days.map(d => d.date)).toEqual(['2026-06-30', '2026-07-01']);
    expect(r.days[1].items.some(i => i.slot === 'afternoon')).toBe(true);
    expect(r.days[1].items.some(i => i.kind === 'stop' && i.place === 'Laguna Beach')).toBe(true);
  });
});

describe('parseItineraryText — entity candidates (heuristic recall)', () => {
  const r = parseItineraryText(SAMPLE, { year: 2026 });
  const allCands = r.days.flatMap(d => [...(d.titleCandidates || []), ...d.items.flatMap(i => i.candidates || [])]);

  test('finds the marquee POIs', () => {
    for (const poi of [
      'Santa Monica Pier', 'Griffith Observatory', 'Universal Studios Hollywood',
      'Getty Center', 'San Diego Zoo', 'Hotel del Coronado', 'Mission San Juan Capistrano',
      'La Jolla Cove', 'Balboa Park',
    ]) {
      expect(allCands).toContain(poi);
    }
  });

  test('expands aliases (PCH → Pacific Coast Highway via the alias table, LACMA)', () => {
    expect(extractCandidates('Cruise the PCH today')).toContain('Pacific Coast Highway');
    expect(extractCandidates('the Getty Center and LACMA')).toContain('Los Angeles County Museum of Art');
  });

  test('filters obvious non-places (the documented false-positive guard)', () => {
    expect(extractCandidates('July 4: Independence Day Celebrations')).not.toContain('Independence Day');
  });
});
