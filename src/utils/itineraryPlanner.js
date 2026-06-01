/**
 * itineraryPlanner.js
 *
 * Smart, traveler-aware itinerary generator.
 * Uses curated place databases for recognised destinations.
 * Falls back to generic templates for unrecognised cities.
 *
 * Group profiling drives every decision:
 *   Kids (< 13)     → theme parks, museums, family dinners — NO nightlife
 *   Teens (13-17)   → shopping, beaches, pop-culture spots
 *   Elderly / Wheelchair → only accessible venues, relaxed pace, early dinners
 *   Vegetarian      → only restaurants with solid veggie options
 *   Interests       → score places higher when they match traveler interests
 */

import { uid } from './helpers';

// ─── LA Places Database ───────────────────────────────────────────────────────

const LA_ACTIVITIES = [
  {
    id: 'la_griffith',
    name: 'Griffith Observatory',
    detail: 'Free to grounds · Planetarium $7 · Best skyline views in LA',
    access: 'Fully wheelchair accessible via west-side drive-up',
    costPerPerson: 7,
    address: '2800 E Observatory Rd, Los Angeles, CA 90027',
    lat: 34.1184, lng: -118.3004,
    url: 'https://griffithobservatory.org',
    mapUrl: 'https://maps.google.com/?q=Griffith+Observatory,Los+Angeles',
    rating: '4.8 ⭐',
    note: 'Book planetarium show online. Take the free DASH Observatory bus from Greek Theatre parking.',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'morning', duration: 2.5, tags: ['science', 'scenic', 'landmark', 'family'],
  },
  {
    id: 'la_nhm',
    name: 'Natural History Museum of LA County',
    detail: 'Dinosaur Hall · Gem vault · Live butterfly pavilion · Kid favourite',
    access: 'Fully wheelchair accessible, stroller-friendly, elevators throughout',
    costPerPerson: 15,
    address: '900 W Exposition Blvd, Los Angeles, CA 90007',
    lat: 34.0179, lng: -118.2883,
    url: 'https://nhm.org',
    mapUrl: 'https://maps.google.com/?q=Natural+History+Museum+Los+Angeles',
    rating: '4.6 ⭐',
    note: 'Combo ticket with La Brea Tar Pits saves $5/person. Allow 2-3 hrs.',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'morning', duration: 3, tags: ['science', 'family', 'indoor', 'history'],
  },
  {
    id: 'la_tarpits',
    name: 'La Brea Tar Pits & Museum',
    detail: 'Active Ice Age fossil excavation · Mammoth & sabertooth displays',
    access: 'Wheelchair accessible paths and museum entrance',
    costPerPerson: 15,
    address: '5801 Wilshire Blvd, Los Angeles, CA 90036',
    lat: 34.0639, lng: -118.3561,
    url: 'https://tarpits.org',
    mapUrl: 'https://maps.google.com/?q=La+Brea+Tar+Pits,Los+Angeles',
    rating: '4.5 ⭐',
    note: 'Right next to LACMA — combine both in one afternoon. Kids love the fossil pits!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'afternoon', duration: 1.5, tags: ['science', 'outdoor', 'family', 'history'],
  },
  {
    id: 'la_lacma',
    name: 'LACMA — Los Angeles County Museum of Art',
    detail: 'Largest art museum in western US · Iconic Urban Lights installation',
    access: 'Fully wheelchair accessible, elevators in all wings',
    costPerPerson: 20,
    address: '5905 Wilshire Blvd, Los Angeles, CA 90036',
    lat: 34.0638, lng: -118.3592,
    url: 'https://lacma.org',
    mapUrl: 'https://maps.google.com/?q=LACMA+Los+Angeles',
    rating: '4.7 ⭐',
    note: 'The Urban Lights sculpture outside is free — stunning photo opportunity at dusk.',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'afternoon', duration: 2, tags: ['art', 'cultural', 'indoor'],
  },
  {
    id: 'la_universal',
    name: 'Universal Studios Hollywood',
    detail: 'Wizarding World of Harry Potter · Jurassic World · Hollywood Studio Tour',
    access: 'Wheelchair accessible throughout, ADA parking, companion restrooms on every level',
    costPerPerson: 109,
    address: '100 Universal City Plaza, Universal City, CA 91608',
    lat: 34.1381, lng: -118.3534,
    url: 'https://www.universalstudioshollywood.com',
    mapUrl: 'https://maps.google.com/?q=Universal+Studios+Hollywood',
    rating: '4.7 ⭐',
    note: 'Book 2+ weeks ahead to save $30/person. Studio Tour wheelchair-accessible via rear entrance. Arrive 30 min before open!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'allday', duration: 8, tags: ['theme-park', 'entertainment', 'family', 'action'],
  },
  {
    id: 'la_warnerbros',
    name: 'Warner Bros Studio Tour Hollywood',
    detail: 'Friends set · Batman · Harry Potter props · Behind-the-scenes Hollywood magic',
    access: 'Fully wheelchair accessible, accessible trams and walking paths',
    costPerPerson: 70,
    address: '3400 W Riverside Dr, Burbank, CA 91505',
    lat: 34.1477, lng: -118.3371,
    url: 'https://www.wbstudiotour.com',
    mapUrl: 'https://maps.google.com/?q=Warner+Bros+Studio+Tour+Burbank',
    rating: '4.8 ⭐',
    note: 'Book well in advance — tours sell out. Teens love the Friends Central Perk set!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'morning', duration: 3, tags: ['entertainment', 'cultural', 'indoor'],
  },
  {
    id: 'la_santamonicapier',
    name: 'Santa Monica Pier & Pacific Park',
    detail: 'Solar-powered Ferris wheel · Rides · End of Route 66 · Free beach access',
    access: 'Wheelchair accessible pier, ADA-adapted rides with staff assistance',
    costPerPerson: 15,
    address: '200 Santa Monica Pier, Santa Monica, CA 90401',
    lat: 34.0099, lng: -118.4973,
    url: 'https://santamonicapier.org',
    mapUrl: 'https://maps.google.com/?q=Santa+Monica+Pier',
    rating: '4.7 ⭐',
    note: 'Best in the morning — less crowded. Ferris wheel is wheelchair accessible with staff help.',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'morning', duration: 2, tags: ['outdoor', 'scenic', 'family', 'beach', 'rides'],
  },
  {
    id: 'la_venicebeach',
    name: 'Venice Beach Boardwalk',
    detail: '1.5-mile flat boardwalk · Street performers · Muscle Beach · Local art stalls',
    access: 'Completely flat, ideal for wheelchairs — no barriers on the boardwalk',
    costPerPerson: 0,
    address: 'Ocean Front Walk, Venice, CA 90291',
    lat: 33.9850, lng: -118.4695,
    url: 'https://www.visitveniceca.com',
    mapUrl: 'https://maps.google.com/?q=Venice+Beach+Boardwalk,Los+Angeles',
    rating: '4.6 ⭐',
    note: 'Best before 11am. Aryan will love the skate park — accessible spectator area available!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'morning', duration: 1.5, tags: ['outdoor', 'beach', 'scenic', 'free'],
  },
  {
    id: 'la_thegrove',
    name: 'The Grove & Original Farmers Market',
    detail: 'Open-air shopping · Electric trolley · Fountain shows · Farmers Market since 1934',
    access: 'Fully flat and wheelchair accessible throughout',
    costPerPerson: 0,
    address: '189 The Grove Dr, Los Angeles, CA 90036',
    lat: 34.0721, lng: -118.3586,
    url: 'https://thegrovela.com',
    mapUrl: 'https://maps.google.com/?q=The+Grove+Los+Angeles',
    rating: '4.6 ⭐',
    note: 'Farmers Market has excellent vegetarian food stalls. Great for shopping (Neha & Priya)!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'afternoon', duration: 2, tags: ['shopping', 'leisure', 'outdoor', 'family'],
  },
  {
    id: 'la_hollywoodwof',
    name: 'Hollywood Walk of Fame & TCL Chinese Theatre',
    detail: '2,700+ stars · Celebrity handprints at TCL Chinese Theatre · Free to stroll',
    access: 'Flat sidewalk, fully wheelchair accessible',
    costPerPerson: 0,
    address: '6925 Hollywood Blvd, Hollywood, CA 90028',
    lat: 34.1015, lng: -118.3265,
    url: 'https://walkoffame.com',
    mapUrl: 'https://maps.google.com/?q=Hollywood+Walk+of+Fame',
    rating: '4.5 ⭐',
    note: 'Best in early morning or evening — hot and crowded midday. Spot Bollywood stars on the Walk!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'afternoon', duration: 1, tags: ['cultural', 'scenic', 'free', 'landmark'],
  },
  {
    id: 'la_olvera',
    name: 'Olvera Street — Birthplace of Los Angeles',
    detail: 'Historic Mexican marketplace · Founded 1781 · Artisan stalls & colourful murals',
    access: 'Mostly flat; some uneven cobblestone — manageable with wheelchair',
    costPerPerson: 0,
    address: '10 Olvera St, Los Angeles, CA 90012',
    lat: 34.0578, lng: -118.2361,
    url: 'https://olvera-street.com',
    mapUrl: 'https://maps.google.com/?q=Olvera+Street+Los+Angeles',
    rating: '4.5 ⭐',
    note: 'Raj & Vikram will love the history. Stop at La Golondrina for a churro — oldest restaurant in LA!',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'morning', duration: 1.5, tags: ['cultural', 'history', 'outdoor', 'free'],
  },
  {
    id: 'la_3rdstpromenade',
    name: 'Third Street Promenade, Santa Monica',
    detail: 'Pedestrian shopping · Street performers · Steps from the beach',
    access: 'Fully flat, excellent wheelchair access',
    costPerPerson: 0,
    address: 'Third Street Promenade, Santa Monica, CA 90401',
    lat: 34.0145, lng: -118.4969,
    url: null,
    mapUrl: 'https://maps.google.com/?q=Third+Street+Promenade+Santa+Monica',
    rating: '4.5 ⭐',
    note: 'Neha\'s favourite! H&M, Zara, Patagonia, local boutiques — all fully accessible.',
    kidFriendly: true, wheelchairOk: true, adultsOnly: false,
    timeSlot: 'afternoon', duration: 2, tags: ['shopping', 'outdoor', 'free'],
  },
];

const LA_FOOD = [
  // ── Dinners ─────────────────────────────────────────────────────────────────
  {
    id: 'la_mussofrank',
    name: 'Musso & Frank Grill',
    detail: 'Hollywood\'s oldest restaurant since 1919 · Classic American steakhouse',
    access: 'Wheelchair accessible main entrance and seating',
    costPerPerson: 48,
    address: '6667 Hollywood Blvd, Hollywood, CA 90028',
    lat: 34.1012, lng: -118.3394,
    url: 'https://mussoandfrank.com',
    mapUrl: 'https://maps.google.com/?q=Musso+and+Frank+Grill+Hollywood',
    rating: '4.5 ⭐',
    note: 'A Hollywood institution — Charlie Chaplin once dined here. Vegetarian pasta available.',
    mealType: 'dinner', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['american', 'historic', 'dinner'],
  },
  {
    id: 'la_republique',
    name: 'Republique',
    detail: 'French-Californian bistro · James Beard-nominated · Beautiful historic building',
    access: 'Step-free entrance, fully accessible restrooms',
    costPerPerson: 45,
    address: '624 S La Brea Ave, Los Angeles, CA 90036',
    lat: 34.0620, lng: -118.3533,
    url: 'https://republiquela.com',
    mapUrl: 'https://maps.google.com/?q=Republique+Restaurant+Los+Angeles',
    rating: '4.7 ⭐',
    note: 'Book 2-3 weeks ahead. Excellent vegetarian options — the roasted mushroom dish is outstanding.',
    mealType: 'dinner', vegetarianOk: true, wheelchairOk: true, kidFriendly: false,
    tags: ['french', 'fine-dining', 'dinner'],
  },
  {
    id: 'la_graciasmadre',
    name: 'Gracias Madre',
    detail: 'Award-winning plant-based Mexican · Fully vegan · Celebrity hotspot in WeHo',
    access: 'Wheelchair accessible entrance and restrooms',
    costPerPerson: 35,
    address: '8905 Melrose Ave, West Hollywood, CA 90069',
    lat: 34.0793, lng: -118.3813,
    url: 'https://graciasmadreweho.com',
    mapUrl: 'https://maps.google.com/?q=Gracias+Madre+West+Hollywood',
    rating: '4.4 ⭐',
    note: 'Perfect for Priya — 100% plant-based. The enchiladas de rajas are a must-try!',
    mealType: 'dinner', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['mexican', 'vegetarian', 'dinner'],
  },
  {
    id: 'la_bottegalouie',
    name: 'Bottega Louie',
    detail: 'Grand Italian-American brasserie · Patisserie · Downtown LA landmark',
    access: 'Fully wheelchair accessible, spacious dining room',
    costPerPerson: 38,
    address: '700 S Grand Ave, Los Angeles, CA 90017',
    lat: 34.0469, lng: -118.2554,
    url: 'https://bottegalouie.com',
    mapUrl: 'https://maps.google.com/?q=Bottega+Louie+Los+Angeles',
    rating: '4.6 ⭐',
    note: 'Great for large groups — they handle parties well. Don\'t leave without the macarons!',
    mealType: 'dinner', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['italian', 'dinner', 'groups'],
  },
  {
    id: 'la_nobu',
    name: 'Nobu Malibu',
    detail: 'World-class Japanese fusion · Oceanfront deck · Special occasion dining',
    access: 'Wheelchair accessible indoor and outdoor deck seating',
    costPerPerson: 85,
    address: '22706 Pacific Coast Hwy, Malibu, CA 90265',
    lat: 34.0354, lng: -118.6811,
    url: 'https://noburestaurants.com/malibu',
    mapUrl: 'https://maps.google.com/?q=Nobu+Malibu+Restaurant',
    rating: '4.6 ⭐',
    note: 'Book 3-4 weeks ahead — fills fast! Vegetarian omakase available on request.',
    mealType: 'dinner', vegetarianOk: true, wheelchairOk: true, kidFriendly: false,
    tags: ['japanese', 'fine-dining', 'dinner', 'ocean'],
  },
  {
    id: 'la_cheesecakefactory',
    name: 'The Cheesecake Factory at The Grove',
    detail: 'Huge American menu · Great for families & large groups · Always reliable',
    access: 'Fully wheelchair accessible, large dining room',
    costPerPerson: 30,
    address: '189 The Grove Dr, Los Angeles, CA 90036',
    lat: 34.0721, lng: -118.3586,
    url: 'https://thecheesecakefactory.com',
    mapUrl: 'https://maps.google.com/?q=Cheesecake+Factory+The+Grove+Los+Angeles',
    rating: '4.3 ⭐',
    note: 'Perfect family dinner after The Grove shopping. Extensive vegetarian menu.',
    mealType: 'dinner', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['american', 'dinner', 'family'],
  },
  // ── Lunches ─────────────────────────────────────────────────────────────────
  {
    id: 'la_loteria',
    name: 'Loteria Grill at the Original Farmers Market',
    detail: 'Authentic Mexican · Award-winning guacamole · Outdoor market seating',
    access: 'Outdoor open seating, wheelchair accessible',
    costPerPerson: 18,
    address: '6333 W 3rd St Stall 322, Los Angeles, CA 90036',
    lat: 34.0724, lng: -118.3586,
    url: 'https://loteriagrill.com',
    mapUrl: 'https://maps.google.com/?q=Loteria+Grill+Farmers+Market+Los+Angeles',
    rating: '4.5 ⭐',
    note: 'Order the mushroom & rajas tacos — best vegetarian option in the market!',
    mealType: 'lunch', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['mexican', 'lunch', 'casual'],
  },
  {
    id: 'la_guisados',
    name: 'Guisados',
    detail: 'Braised taco specialists · Local legend since 2010 · Incredible flavour',
    access: 'Accessible entrance, indoor and outdoor seating',
    costPerPerson: 14,
    address: '2100 E Cesar E Chavez Ave, Los Angeles, CA 90033',
    lat: 34.0512, lng: -118.2128,
    url: 'https://guisados.co',
    mapUrl: 'https://maps.google.com/?q=Guisados+Restaurant+Los+Angeles',
    rating: '4.8 ⭐',
    note: 'Get the sampler! Vegetarian options: rajas con crema, bean & cheese, mushroom.',
    mealType: 'lunch', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['mexican', 'lunch', 'casual', 'local'],
  },
  {
    id: 'la_thelobster',
    name: 'The Lobster — Santa Monica',
    detail: 'Fresh seafood · Pacific Ocean views · Right next to Santa Monica Pier',
    access: 'Elevator to main dining level, wheelchair accessible throughout',
    costPerPerson: 55,
    address: '1602 Ocean Ave, Santa Monica, CA 90401',
    lat: 34.0106, lng: -118.4984,
    url: 'https://thelobster.com',
    mapUrl: 'https://maps.google.com/?q=The+Lobster+Restaurant+Santa+Monica',
    rating: '4.4 ⭐',
    note: 'Ask for a window table — stunning ocean views. Vegetarian pasta options available.',
    mealType: 'lunch', vegetarianOk: true, wheelchairOk: true, kidFriendly: true,
    tags: ['seafood', 'scenic', 'lunch'],
  },
];

const LA_STAY = [
  {
    id: 'la_hotel_loews',
    name: 'Loews Hollywood Hotel',
    detail: '4-star · Adjacent to TCL Chinese Theatre · Rooftop pool · 2 restaurants',
    access: 'ADA accessible rooms & suites, roll-in shower available on request',
    costPerPerson: 120,
    address: '1755 N Highland Ave, Hollywood, CA 90028',
    lat: 34.1022, lng: -118.3390,
    url: 'https://loewshotels.com/hollywood-hotel',
    mapUrl: 'https://maps.google.com/?q=Loews+Hollywood+Hotel',
    rating: '4.3 ⭐',
    note: 'Request an ADA room with roll-in shower when booking. Valet parking available.',
    wheelchairOk: true,
  },
];

const LA_TRANSPORT = [
  {
    id: 'la_lax_arrive',
    name: 'LAX → Hotel Private Accessible Transfer',
    detail: 'Pre-booked accessible van · ~45 min to Hollywood · Luggage assistance',
    access: 'Wheelchair lift equipped, certified accessible vehicle',
    costPerPerson: 25,
    address: 'Los Angeles International Airport, Los Angeles, CA 90045',
    lat: 33.9416, lng: -118.4085,
    url: null,
    mapUrl: 'https://maps.google.com/?q=LAX+Airport+Los+Angeles',
    rating: null,
    note: 'Book via Uber Wheelchair or a pre-arranged accessible van service. Book 48 hrs ahead.',
    wheelchairOk: true,
  },
  {
    id: 'la_lax_depart',
    name: 'Hotel → LAX Transfer',
    detail: 'Pre-booked accessible van · Allow 2.5 hrs before departure',
    access: 'Wheelchair lift equipped, luggage assistance',
    costPerPerson: 25,
    address: 'Los Angeles International Airport, Los Angeles, CA 90045',
    lat: 33.9416, lng: -118.4085,
    url: null,
    mapUrl: 'https://maps.google.com/?q=LAX+Airport+Los+Angeles',
    rating: null,
    note: 'LAX is very busy — allow 2.5 hrs minimum before your flight.',
    wheelchairOk: true,
  },
];

// ─── San Diego Places Database ────────────────────────────────────────────────

const SD_ACTIVITIES = [
  { id: 'sd_zoo', name: 'San Diego Zoo', detail: 'World-famous zoo with 3,700+ animals · Giant pandas, polar bears, koalas', access: 'Fully wheelchair accessible — tram & Skyfari aerial tram available', costPerPerson: 67, address: '2920 Zoo Dr, San Diego, CA 92101', url: 'https://sandiegozoo.org', mapUrl: 'https://maps.google.com/?q=San+Diego+Zoo', rating: '4.8 ⭐', note: 'Book online — saves queue time. Arrive at opening for the best animal activity.', kidFriendly: true, wheelchairOk: true, timeSlot: 'morning', tags: ['family', 'animals', 'kids'] },
  { id: 'sd_balboa', name: 'Balboa Park', detail: '1,200-acre cultural park · 17 museums, Spanish colonial architecture, botanical gardens', access: 'Mostly accessible — some uneven paths between museums', costPerPerson: 0, address: '1549 El Prado, San Diego, CA 92101', url: 'https://balboapark.org', mapUrl: 'https://maps.google.com/?q=Balboa+Park+San+Diego', rating: '4.7 ⭐', note: 'Park entry is free — museums charge separately. Tuesday is free museum day for San Diego residents.', kidFriendly: true, wheelchairOk: true, timeSlot: 'morning', tags: ['culture', 'family', 'outdoors'] },
  { id: 'sd_midway', name: 'USS Midway Museum', detail: 'America\'s longest-serving aircraft carrier · 29 restored aircraft, flight simulators', access: 'Elevator access to main deck; some areas inaccessible for wheelchairs', costPerPerson: 26, address: '910 N Harbor Dr, San Diego, CA 92101', url: 'https://midway.org', mapUrl: 'https://maps.google.com/?q=USS+Midway+Museum+San+Diego', rating: '4.8 ⭐', note: 'Kids love the flight simulators. Wear comfortable shoes — lots of walking on steel decks.', kidFriendly: true, wheelchairOk: false, timeSlot: 'morning', tags: ['history', 'family', 'culture'] },
  { id: 'sd_lajolla', name: 'La Jolla Cove', detail: 'Stunning coastal bluffs · Sea caves, snorkelling, sea lions · One of San Diego\'s most photographed spots', access: 'Accessible viewing from blufftop paths; beach access via steps', costPerPerson: 0, address: '1100 Coast Blvd, La Jolla, CA 92037', url: '', mapUrl: 'https://maps.google.com/?q=La+Jolla+Cove+San+Diego', rating: '4.7 ⭐', note: 'Go early morning for sea lions lazing on the rocks. Snorkel gear rentals nearby.', kidFriendly: true, wheelchairOk: false, timeSlot: 'morning', tags: ['outdoors', 'beach', 'nature'] },
  { id: 'sd_oldtown', name: 'Old Town San Diego', detail: 'California\'s birthplace · Historic adobe buildings, artisan shops, Mexican restaurants', access: 'Mostly flat and accessible throughout', costPerPerson: 0, address: '4002 Wallace St, San Diego, CA 92110', url: 'https://oldtownsandiego.org', mapUrl: 'https://maps.google.com/?q=Old+Town+San+Diego', rating: '4.4 ⭐', note: 'Free state historic park. Best Mexican food in San Diego is here — try Casa de Reyes.', kidFriendly: true, wheelchairOk: true, timeSlot: 'afternoon', tags: ['history', 'culture', 'food'] },
  { id: 'sd_coronado', name: 'Coronado Beach', detail: 'Consistently ranked America\'s best beach · Wide sandy shores, views of the Hotel del Coronado', access: 'Accessible beach mats available at lifeguard stations', costPerPerson: 0, address: 'Ocean Blvd, Coronado, CA 92118', url: '', mapUrl: 'https://maps.google.com/?q=Coronado+Beach+San+Diego', rating: '4.8 ⭐', note: 'Take the Coronado Ferry ($6.25) from the Embarcadero for a scenic water crossing.', kidFriendly: true, wheelchairOk: true, timeSlot: 'afternoon', tags: ['beach', 'outdoors', 'family'] },
];

const SD_FOOD = [
  { id: 'sd_guild', name: 'Guild Hall / Gaslamp Quarter', detail: 'San Diego\'s historic entertainment district · Dozens of restaurants, craft beer bars, rooftop dining', access: 'Flat streets, mostly accessible', costPerPerson: 38, address: 'Gaslamp Quarter, San Diego, CA 92101', mapUrl: 'https://maps.google.com/?q=Gaslamp+Quarter+San+Diego', rating: '4.3 ⭐', note: 'Great for group dinners — wide variety of cuisines. Reserve ahead on weekends.' },
  { id: 'sd_puesto', name: 'Puesto at the Headquarters', detail: 'Award-winning Mexican street food · Gourmet tacos in historic San Diego Police Headquarters', access: 'Accessible outdoor courtyard seating', costPerPerson: 28, address: '789 W Harbor Dr, San Diego, CA 92101', url: 'https://eatpuesto.com', mapUrl: 'https://maps.google.com/?q=Puesto+San+Diego', rating: '4.5 ⭐', note: 'Excellent vegetarian and vegan taco options. The al pastor is a must-try.' },
  { id: 'sd_market', name: 'Little Italy Food Hall', detail: 'Trendy neighbourhood market · Local vendors, craft food stalls, great for families', access: 'Fully accessible indoor food hall', costPerPerson: 20, address: '550 W Date St, San Diego, CA 92101', url: '', mapUrl: 'https://maps.google.com/?q=Little+Italy+Food+Hall+San+Diego', rating: '4.4 ⭐', note: 'Perfect for groups — everyone picks what they want. Great Saturday farmers market too.' },
];

const SD_STAY = [
  { id: 'sd_arrive', name: 'Arrive San Diego', detail: 'Transfer from airport to downtown hotel · San Diego International Airport is 5 minutes from downtown', access: 'Accessible taxis and rideshare available curbside', costPerPerson: 20, address: 'San Diego International Airport, CA 92101', mapUrl: 'https://maps.google.com/?q=San+Diego+Airport', note: 'San Diego airport is one of the most convenient in the US — right next to downtown.' },
];

// ─── San Francisco Places Database ───────────────────────────────────────────

const SFO_ACTIVITIES = [
  { id: 'sfo_gg', name: 'Golden Gate Bridge', detail: 'Walk or bike across the iconic suspension bridge · 1.7 miles each way · Spectacular bay views', access: 'Accessible east walkway (west side has steps); accessible viewing areas at both ends', costPerPerson: 0, address: 'Golden Gate Bridge, San Francisco, CA 94129', url: 'https://goldengate.org', mapUrl: 'https://maps.google.com/?q=Golden+Gate+Bridge+San+Francisco', rating: '4.8 ⭐', note: 'Bring a jacket — the bridge is almost always foggy and windy. Best photos from Battery Spencer lookout.', kidFriendly: true, wheelchairOk: true, timeSlot: 'morning', tags: ['landmark', 'scenic', 'outdoors'] },
  { id: 'sfo_alcatraz', name: 'Alcatraz Island', detail: 'Famous federal penitentiary on an island · Ferry + audio tour · One of San Francisco\'s top attractions', access: 'Ferry accessible; island terrain challenging for wheelchairs', costPerPerson: 45, address: 'Alcatraz Island, San Francisco, CA 94133', url: 'https://nps.gov/alca', mapUrl: 'https://maps.google.com/?q=Alcatraz+Island+San+Francisco', rating: '4.7 ⭐', note: 'Book weeks in advance — sells out fast especially on weekends. Night tours are especially atmospheric.', kidFriendly: true, wheelchairOk: false, timeSlot: 'morning', tags: ['history', 'landmark', 'culture'] },
  { id: 'sfo_wharf', name: "Fisherman's Wharf", detail: 'Historic waterfront · Sea lions at Pier 39, Ghirardelli Square, fresh crab stalls, street performers', access: 'Fully accessible flat waterfront promenade', costPerPerson: 0, address: "Fisherman's Wharf, San Francisco, CA 94133", url: '', mapUrl: "https://maps.google.com/?q=Fisherman's+Wharf+San+Francisco", rating: '4.3 ⭐', note: 'Kids love the sea lions at Pier 39 — free to watch. Dungeness crab in season is unmissable.', kidFriendly: true, wheelchairOk: true, timeSlot: 'morning', tags: ['family', 'food', 'landmark'] },
  { id: 'sfo_ggpark', name: 'Golden Gate Park', detail: '1,000+ acres · De Young Museum, Japanese Tea Garden, Botanical Garden, Conservatory of Flowers', access: 'Paved paths throughout; some garden areas have steps', costPerPerson: 0, address: '501 Stanyan St, San Francisco, CA 94117', url: 'https://goldengatepark.com', mapUrl: 'https://maps.google.com/?q=Golden+Gate+Park+San+Francisco', rating: '4.7 ⭐', note: 'Rent bikes or take the park shuttle. De Young Museum is world-class and kid-friendly.', kidFriendly: true, wheelchairOk: true, timeSlot: 'afternoon', tags: ['outdoors', 'family', 'culture'] },
  { id: 'sfo_chinatown', name: 'San Francisco Chinatown', detail: 'The oldest and most densely populated Chinatown in North America · Dragon Gate, dim sum, herbalists', access: 'Some steep hills — Grant Ave main strip is manageable', costPerPerson: 0, address: 'Grant Ave, San Francisco, CA 94108', url: '', mapUrl: 'https://maps.google.com/?q=Chinatown+San+Francisco', rating: '4.4 ⭐', note: 'Start at Dragon Gate on Grant Ave and work your way up. The fortune cookie factory on Ross Alley is free.', kidFriendly: true, wheelchairOk: false, timeSlot: 'afternoon', tags: ['culture', 'food', 'history'] },
  { id: 'sfo_cable', name: 'Cable Car Ride', detail: 'Ride the world\'s last manually operated cable car system · Powell-Hyde or Powell-Mason lines', access: 'Limited accessibility — consider the F-Market historic streetcar as an accessible alternative', costPerPerson: 8, address: 'Powell & Market St, San Francisco, CA 94102', url: 'https://sfmta.com', mapUrl: 'https://maps.google.com/?q=Powell+Street+Cable+Car+San+Francisco', rating: '4.6 ⭐', note: 'Board at the turntable on Powell & Market for a seat. Hold on tight on the hills — kids love it!', kidFriendly: true, wheelchairOk: false, timeSlot: 'afternoon', tags: ['landmark', 'family', 'culture'] },
];

const SFO_FOOD = [
  { id: 'sfo_ferry', name: 'Ferry Building Marketplace', detail: 'Iconic marketplace on the Embarcadero · Artisan food vendors, local cheeses, farm-fresh produce', access: 'Fully accessible', costPerPerson: 22, address: '1 Ferry Building, San Francisco, CA 94111', url: 'https://ferrybuildingmarketplace.com', mapUrl: 'https://maps.google.com/?q=Ferry+Building+San+Francisco', rating: '4.6 ⭐', note: 'Saturday farmers market is outstanding. Hog Island Oyster Co inside is a local favourite.' },
  { id: 'sfo_union', name: 'Union Square dining', detail: 'Dozens of restaurants in the heart of San Francisco · All cuisines, all budgets', access: 'Flat, fully accessible square', costPerPerson: 35, address: 'Union Square, San Francisco, CA 94108', mapUrl: 'https://maps.google.com/?q=Union+Square+San+Francisco', rating: '4.2 ⭐', note: 'Great base for dinner — Wayfare Tavern (Tyler Florence) and Bix are highly rated.' },
];

const SFO_STAY = [
  { id: 'sfo_arrive', name: 'Arrive San Francisco', detail: 'BART from SFO Airport to downtown is the easiest option · ~30 min, $10', access: 'BART is fully accessible', costPerPerson: 10, address: 'San Francisco International Airport, CA 94128', mapUrl: 'https://maps.google.com/?q=San+Francisco+Airport', note: 'BART runs directly from the airport terminal to Union Square. No need for a taxi if travelling light.' },
];

// ─── Group Profiler ───────────────────────────────────────────────────────────

export function profileGroup(trip, travelers = []) {
  const allMembers = trip.families.flatMap(f => f.members);
  const enriched = allMembers.map(m => {
    const tv = travelers.find(t => t.id === m.travelerId) || {};
    return { ...tv, ...m };
  });

  const hasKids       = enriched.some(m => m.age > 0 && m.age < 13);
  const hasTeens      = enriched.some(m => m.age >= 13 && m.age < 18);
  const hasElders     = enriched.some(m => m.age >= 65 || (m.needs || []).some(n => n.includes('Elderly')));
  const hasWheelchair = enriched.some(m => (m.needs || []).some(n => n.toLowerCase().includes('wheelchair')));
  const isRelaxed     = hasElders || enriched.some(m => m.pacePreference === 'relaxed');
  const vegetarianCount = enriched.filter(m =>
    (m.dietary || []).some(d => d.toLowerCase().includes('vegetarian') || d.toLowerCase().includes('vegan'))
  ).length;
  const interests = [...new Set(enriched.flatMap(m => m.interests || []))];

  return { hasKids, hasTeens, hasElders, hasWheelchair, isRelaxed, vegetarianCount, interests, memberCount: allMembers.length };
}

// ─── Day schedule builder ─────────────────────────────────────────────────────

function mkActivity(place, time, type) {
  return {
    id: uid(),
    type: type || place.type || 'activity',
    time,
    name: place.name,
    detail: place.detail,
    access: place.access,
    costPerPerson: place.costPerPerson || 0,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    url: place.url || null,
    mapUrl: place.mapUrl || null,
    rating: place.rating || null,
    note: place.note || null,
  };
}

// Build the day schedule for a given template
function buildDayFromTemplate(template, profile) {
  const { isRelaxed, vegetarianCount, hasWheelchair } = profile;
  const dinnerTime = isRelaxed ? '18:30' : '19:30';
  const acts = [];

  template.forEach(entry => {
    // Filter food for dietary
    if (entry.foodType === 'dinner') {
      const pool = LA_FOOD.filter(f =>
        f.mealType === 'dinner'
        && (vegetarianCount === 0 || f.vegetarianOk)
        && (!hasWheelchair || f.wheelchairOk)
        && !acts.some(a => a.name === f.name)
      );
      const pick = pool.find(f => f.id === entry.preferredId) || pool[0];
      if (pick) acts.push(mkActivity(pick, dinnerTime, 'food'));
    } else if (entry.foodType === 'lunch') {
      const pool = LA_FOOD.filter(f =>
        f.mealType === 'lunch'
        && (vegetarianCount === 0 || f.vegetarianOk)
        && (!hasWheelchair || f.wheelchairOk)
        && !acts.some(a => a.name === f.name)
      );
      const pick = pool.find(f => f.id === entry.preferredId) || pool[0];
      if (pick) acts.push(mkActivity(pick, entry.time || '12:30', 'food'));
    } else if (entry.activityId) {
      const place = LA_ACTIVITIES.find(a => a.id === entry.activityId);
      if (place && (!hasWheelchair || place.wheelchairOk)) {
        acts.push(mkActivity(place, entry.time, 'activity'));
      }
    } else if (entry.stayId) {
      const stay = LA_STAY.find(s => s.id === entry.stayId);
      if (stay) acts.push(mkActivity(stay, entry.time, 'stay'));
    } else if (entry.transportId) {
      const tr = LA_TRANSPORT.find(t => t.id === entry.transportId);
      if (tr) acts.push(mkActivity(tr, entry.time, 'transport'));
    } else if (entry.raw) {
      acts.push({ id: uid(), ...entry.raw });
    }
  });

  return acts.filter(Boolean);
}

// ─── LA Day Templates (profile-adaptive) ─────────────────────────────────────

function laArrivalDay(profile) {
  return buildDayFromTemplate([
    { transportId: 'la_lax_arrive', time: '14:00' },
    { stayId: 'la_hotel_loews', time: '16:00' },
    { activityId: 'la_hollywoodwof', time: '17:30' },
    { foodType: 'dinner', preferredId: 'la_mussofrank' },
  ], profile);
}

function laHollywoodDay(profile) {
  return buildDayFromTemplate([
    { activityId: 'la_griffith', time: '09:30' },
    { foodType: 'lunch', preferredId: 'la_loteria', time: '12:30' },
    { activityId: 'la_thegrove', time: '14:00' },
    { activityId: 'la_tarpits', time: '16:00' },
    { foodType: 'dinner', preferredId: 'la_republique' },
  ], profile);
}

function laMuseumsDay(profile) {
  return buildDayFromTemplate([
    { activityId: 'la_nhm', time: '09:30' },
    { foodType: 'lunch', preferredId: 'la_guisados', time: '12:30' },
    { activityId: 'la_lacma', time: '14:00' },
    { foodType: 'dinner', preferredId: 'la_graciasmadre' },
  ], profile);
}

function laUniversalDay(profile) {
  const restNote = {
    id: uid(), type: 'note', time: '17:30',
    name: 'Hotel Rest & Freshen Up',
    detail: 'Rest after a big theme park day · Pool available',
    access: 'Hotel fully accessible',
    costPerPerson: 0,
  };
  const acts = buildDayFromTemplate([
    { activityId: 'la_universal', time: '09:00' },
    { foodType: 'dinner', preferredId: 'la_bottegalouie' },
  ], profile);
  acts.splice(1, 0, restNote); // insert rest between Universal and dinner
  return acts;
}

function laCoastalDay(profile) {
  return buildDayFromTemplate([
    { activityId: 'la_venicebeach', time: '09:30' },
    { activityId: 'la_santamonicapier', time: '11:00' },
    { foodType: 'lunch', preferredId: 'la_thelobster', time: '13:30' },
    { activityId: 'la_3rdstpromenade', time: '15:30' },
    { foodType: 'dinner', preferredId: 'la_nobu' },
  ], profile);
}

function laDepartureDay(profile) {
  const souvenir = {
    id: uid(), type: 'note', time: '11:00',
    name: 'Souvenir Shopping & Hotel Checkout',
    detail: 'Last-minute picks · Check out by 12pm',
    access: 'Hotel fully accessible',
    costPerPerson: 50,
  };
  return [
    ...buildDayFromTemplate([
      { activityId: 'la_olvera', time: '09:30' },
    ], profile),
    souvenir,
    ...buildDayFromTemplate([
      { transportId: 'la_lax_depart', time: '13:30' },
    ], profile),
  ];
}

// Sequence of day builders for LA (longest trip: 6 days)
const LA_DAY_SEQUENCE = [
  laArrivalDay,
  laHollywoodDay,
  laMuseumsDay,
  laUniversalDay,
  laCoastalDay,
  laDepartureDay,
];

// ─── Main Generator ───────────────────────────────────────────────────────────

/**
 * generateSmartItinerary(trip, travelers)
 * Returns array of day-activity arrays, or null if destination not recognised.
 *
 * Usage in store:
 *   const days = generateSmartItinerary(trip, travelers);
 *   if (days) applyDays(days); else fallbackToTemplates();
 */
// ─── City day sequence builders (SD + SFO) ───────────────────────────────────

function buildSDDay(dayIndex, profile, isFirst, isLast) {
  const scale = c => Math.round(c * 1.0);

  if (isFirst) return [
    { ...SD_STAY[0],   id: uid(), type: 'transport', time: '11:00' },
    { id: uid(), type: 'stay',     time: '13:30', name: 'Hotel check-in — Downtown San Diego', detail: 'Drop bags, freshen up. Gaslamp Quarter is right outside.', access: 'Accessible rooms on request', costPerPerson: 0, mapUrl: 'https://maps.google.com/?q=Downtown+San+Diego+Hotels' },
    { id: uid(), type: 'food',     time: '14:30', name: 'Welcome lunch — Little Italy', detail: 'Explore San Diego\'s vibrant Little Italy neighbourhood', access: 'Flat, accessible streets', costPerPerson: scale(20), mapUrl: 'https://maps.google.com/?q=Little+Italy+San+Diego', note: 'Amici\'s East Coast Pizzeria and Bencotto are local favourites.' },
    { id: uid(), type: 'activity', time: '17:00', name: 'Waterfront Embarcadero walk', detail: 'Stroll along San Diego Harbour, see the USS Midway from the outside', access: 'Flat, fully accessible waterfront path', costPerPerson: 0, mapUrl: 'https://maps.google.com/?q=Embarcadero+San+Diego', note: 'Great orientation walk to get your bearings — views of Coronado Bridge and the bay.' },
    { id: uid(), type: 'food',     time: '19:30', name: 'Welcome dinner — Gaslamp Quarter', detail: profile.hasKids ? 'Family-friendly Gaslamp restaurants — Yard House or Tin Fish' : 'Gaslamp Quarter — great restaurants for groups', access: 'Accessible restaurants throughout', costPerPerson: scale(38), mapUrl: 'https://maps.google.com/?q=Gaslamp+Quarter+San+Diego' },
  ];

  if (isLast) return [
    { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel or nearby café before travel day', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
    { id: uid(), type: 'activity', time: '09:30', name: 'Old Town San Diego', detail: 'Last look at California\'s birthplace — artisan shops and Mexican culture', access: 'Mostly flat and accessible', costPerPerson: 0, ...SD_ACTIVITIES[4] },
    { id: uid(), type: 'food',     time: '12:30', name: 'Farewell lunch — Old Town', detail: 'Best Mexican food in San Diego before you leave', access: 'Accessible entrance', costPerPerson: scale(22), mapUrl: 'https://maps.google.com/?q=Old+Town+Mexican+Cafe+San+Diego', note: 'Old Town Mexican Café or Casa de Reyes — both excellent.' },
    { id: uid(), type: 'stay',     time: '14:00', name: 'Hotel checkout', detail: 'Check out and store luggage if needed', costPerPerson: 0, access: 'Accessible lobby', mapUrl: '' },
  ];

  const dayThemes = [
    // Zoo day
    [
      { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel breakfast or nearby café', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
      { ...SD_ACTIVITIES[0], id: uid(), type: 'activity', time: '09:00' },
      { id: uid(), type: 'food',     time: '13:00', name: 'Lunch at the Zoo', detail: 'Albert\'s Restaurant or one of the Zoo\'s cafés', costPerPerson: scale(22), access: 'Accessible dining', mapUrl: 'https://maps.google.com/?q=San+Diego+Zoo', note: 'Bring snacks — zoo food can be pricey. Water bottles too.' },
      { id: uid(), type: 'activity', time: '15:00', name: 'Balboa Park', detail: 'Explore the park museums and Spanish colonial gardens after the zoo', access: 'Mostly accessible', costPerPerson: 0, ...SD_ACTIVITIES[1] },
      { ...SD_FOOD[0], id: uid(), type: 'food', time: '19:30' },
    ],
    // Beach + La Jolla day
    [
      { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel breakfast or local café', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
      { ...SD_ACTIVITIES[3], id: uid(), type: 'activity', time: '09:30' },
      { id: uid(), type: 'food',     time: '13:00', name: 'Lunch — La Jolla village', detail: 'Great cafés and restaurants in La Jolla village above the cove', costPerPerson: scale(25), access: 'Accessible options', mapUrl: 'https://maps.google.com/?q=La+Jolla+Village+San+Diego', note: 'George\'s at the Cove for ocean views or Eddie V\'s for seafood.' },
      { ...SD_ACTIVITIES[5], id: uid(), type: 'activity', time: '15:00' },
      { ...SD_FOOD[1], id: uid(), type: 'food', time: '19:30' },
    ],
    // USS Midway + Old Town day
    [
      { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel breakfast', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
      { ...SD_ACTIVITIES[2], id: uid(), type: 'activity', time: '09:00' },
      { ...SD_FOOD[2], id: uid(), type: 'food', time: '13:00' },
      { ...SD_ACTIVITIES[4], id: uid(), type: 'activity', time: '15:00' },
      { ...SD_FOOD[0], id: uid(), type: 'food', time: '19:30' },
    ],
  ];

  return dayThemes[(dayIndex - 1) % dayThemes.length];
}

function buildSFODay(dayIndex, profile, isFirst, isLast) {
  const scale = c => Math.round(c * 1.0);

  if (isFirst) return [
    { ...SFO_STAY[0],  id: uid(), type: 'transport', time: '11:00' },
    { id: uid(), type: 'stay',     time: '13:00', name: 'Hotel check-in — San Francisco', detail: 'Union Square or Fisherman\'s Wharf area recommended for families', access: 'Accessible rooms on request', costPerPerson: 0, mapUrl: 'https://maps.google.com/?q=Union+Square+San+Francisco+Hotels' },
    { ...SFO_ACTIVITIES[2], id: uid(), type: 'activity', time: '14:30' },
    { id: uid(), type: 'activity', time: '17:00', name: 'Pier 39 sea lions', detail: 'Watch the resident sea lions on the docks — free and loved by kids', access: 'Flat, accessible boardwalk', costPerPerson: 0, mapUrl: 'https://maps.google.com/?q=Pier+39+San+Francisco', note: 'Over 1,000 California sea lions call this home. Best viewing from the K dock.' },
    { ...SFO_FOOD[0], id: uid(), type: 'food', time: '19:30' },
  ];

  if (isLast) return [
    { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel or nearby café', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
    { ...SFO_ACTIVITIES[4], id: uid(), type: 'activity', time: '09:30' },
    { id: uid(), type: 'food',     time: '12:30', name: 'Farewell dim sum — Chinatown', detail: 'Classic San Francisco send-off — Yank Sing or City View Restaurant', access: 'Accessible', costPerPerson: scale(25), mapUrl: 'https://maps.google.com/?q=Yank+Sing+San+Francisco', note: 'Order from the cart — just point at what looks good. Kids love it.' },
    { id: uid(), type: 'stay',     time: '14:00', name: 'Hotel checkout', detail: 'Check out and head to airport', costPerPerson: 0, access: 'Accessible lobby', mapUrl: '' },
    { id: uid(), type: 'transport', time: '15:30', name: 'BART to SFO Airport', detail: 'Take BART from Embarcadero or Powell to SFO · ~30 minutes, fully accessible', access: 'Fully accessible', costPerPerson: 10, mapUrl: 'https://maps.google.com/?q=SFO+Airport', note: 'Allow 2.5hrs before your flight. BART is the easiest option — no traffic stress.' },
  ];

  const dayThemes = [
    // Golden Gate + GG Park
    [
      { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel or local café', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
      { ...SFO_ACTIVITIES[0], id: uid(), type: 'activity', time: '09:30' },
      { id: uid(), type: 'food',     time: '13:00', name: 'Lunch near Golden Gate', detail: 'Warming Hut Café at Crissy Field or Boudin Sourdough at the Fisherman\'s Wharf', access: 'Accessible', costPerPerson: scale(18), mapUrl: 'https://maps.google.com/?q=Warming+Hut+San+Francisco', note: 'Boudin sourdough bread bowls are a SF institution — great for kids.' },
      { ...SFO_ACTIVITIES[3], id: uid(), type: 'activity', time: '14:30' },
      { ...SFO_FOOD[1], id: uid(), type: 'food', time: '19:30' },
    ],
    // Alcatraz + cable car
    [
      { id: uid(), type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Early start — Alcatraz ferry departs from Pier 33', costPerPerson: scale(14), access: 'Accessible', mapUrl: '' },
      { ...SFO_ACTIVITIES[1], id: uid(), type: 'activity', time: '09:00' },
      { id: uid(), type: 'food',     time: '13:00', name: 'Lunch — Fisherman\'s Wharf', detail: 'Fresh Dungeness crab, clam chowder, and sourdough near Pier 39', access: 'Flat waterfront, accessible', costPerPerson: scale(25), mapUrl: "https://maps.google.com/?q=Fisherman's+Wharf+San+Francisco" },
      { ...SFO_ACTIVITIES[5], id: uid(), type: 'activity', time: '15:00' },
      { ...SFO_FOOD[0], id: uid(), type: 'food', time: '19:30' },
    ],
    // Chinatown + Union Square
    [
      { id: uid(), type: 'food',     time: '08:30', name: 'Breakfast', detail: 'Hotel or nearby café', costPerPerson: scale(16), access: 'Accessible', mapUrl: '' },
      { ...SFO_ACTIVITIES[4], id: uid(), type: 'activity', time: '10:00' },
      { id: uid(), type: 'food',     time: '12:30', name: 'Dim sum lunch', detail: 'Authentic Cantonese dim sum in the heart of Chinatown', access: 'Accessible options available', costPerPerson: scale(22), mapUrl: 'https://maps.google.com/?q=Great+Eastern+Restaurant+San+Francisco', note: 'Great Eastern or Yank Sing — both excellent. Order lots and share.' },
      { id: uid(), type: 'activity', time: '14:30', name: 'Union Square shopping', detail: 'San Francisco\'s premier shopping district — Macy\'s, Saks, boutiques, galleries', access: 'Flat, fully accessible', costPerPerson: 0, mapUrl: 'https://maps.google.com/?q=Union+Square+San+Francisco' },
      { ...SFO_FOOD[1], id: uid(), type: 'food', time: '19:30' },
    ],
  ];

  return dayThemes[(dayIndex - 1) % dayThemes.length];
}

// ─── Smart Itinerary Generator ────────────────────────────────────────────────

export function generateSmartItinerary(trip, travelers = []) {
  const dest = (trip.destination || '').toLowerCase();

  // LA recognition
  const isLA = dest.includes('los angeles') || dest.includes('l.a.') || dest.includes(', la') || dest.startsWith('la,') || dest.includes('hollywood') || dest.includes('santa monica') || dest.includes('venice beach') || dest.includes('malibu');

  // San Diego recognition
  const isSD = dest.includes('san diego') || dest.startsWith('sd,') || dest.includes(', sd');

  // San Francisco recognition
  const isSFO = dest.includes('san francisco') || dest.includes('s.f.') || dest.startsWith('sf,') || dest.includes(', sf') || dest.includes('sfo') || dest.includes('bay area');

  if (!isLA && !isSD && !isSFO) return null; // caller falls back to generic templates

  const profile = profileGroup(trip, travelers);
  const numDays = trip.days.length;

  if (isLA) {
    const plans = LA_DAY_SEQUENCE.slice(0, numDays);
    while (plans.length < numDays) {
      const mid = plans[Math.floor(plans.length / 2)];
      plans.splice(plans.length - 1, 0, mid);
    }
    return plans.map(builderFn => builderFn(profile));
  }

  if (isSD) {
    return Array.from({ length: numDays }, (_, i) =>
      buildSDDay(i, profile, i === 0, i === numDays - 1)
    );
  }

  if (isSFO) {
    return Array.from({ length: numDays }, (_, i) =>
      buildSFODay(i, profile, i === 0, i === numDays - 1)
    );
  }

  return null;
}

// Export place data for cross-file use
export { LA_ACTIVITIES, LA_FOOD, LA_STAY, LA_TRANSPORT, SD_ACTIVITIES, SFO_ACTIVITIES };
