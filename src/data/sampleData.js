// ── Global Traveler Library ───────────────────────────────────────────────────
export const sampleTravelers = [
  {
    id: 'tv1', name: 'Raj Sharma',   age: 42, emoji: '👨',
    dietary: [], needs: [],
    pacePreference: 'moderate', interests: ['history', 'food'], notes: '',
  },
  {
    id: 'tv2', name: 'Priya Sharma', age: 39, emoji: '👩',
    dietary: ['vegetarian'], needs: ['🌿 Dietary Needs'],
    pacePreference: 'moderate', interests: ['food', 'shopping'], notes: '',
  },
  {
    id: 'tv3', name: 'Aryan Sharma', age: 12, emoji: '👦',
    dietary: [], needs: [],
    pacePreference: 'packed', interests: ['sport'], notes: '',
  },
  {
    id: 'tv4', name: 'Vikram Gupta', age: 45, emoji: '👨',
    dietary: [], needs: [],
    pacePreference: 'moderate', interests: ['history'], notes: '',
  },
  {
    id: 'tv5', name: 'Sunita Gupta', age: 72, emoji: '👵',
    dietary: [], needs: ['🧓 Elderly (65+)', '♿ Wheelchair'],
    pacePreference: 'relaxed', interests: [], notes: 'Requires wheelchair accessible venues and rest breaks',
  },
  {
    id: 'tv6', name: 'Neha Gupta',   age: 16, emoji: '👧',
    dietary: [], needs: [],
    pacePreference: 'packed', interests: ['shopping', 'art'], notes: '',
  },
];

// ── Saved Travel Groups ───────────────────────────────────────────────────────
export const sampleGroups = [
  { id: 'sg1', name: 'Sharma Family', color: '#6c5ce7', travelerIds: ['tv1', 'tv2', 'tv3'] },
  { id: 'sg2', name: 'Gupta Family',  color: '#e84393', travelerIds: ['tv4', 'tv5', 'tv6'] },
];

// ── Sample Trips ──────────────────────────────────────────────────────────────
export const sampleTrips = [
  {
    id: 't1',
    name: 'Bali Family Escape',
    destination: 'Bali, Indonesia',
    emoji: '🌴',
    startDate: '2026-07-10',
    endDate: '2026-07-17',
    mode: 'ai',
    bgColors: ['#e17055', '#fdcb6e'],
    itineraryPushed: false,
    families: [
      {
        id: 'f1', name: 'Sharma Family', color: '#6c5ce7', groupId: 'sg1',
        members: [
          { id: 'm1', name: 'Raj Sharma',   age: 42, needs: [],                    travelerId: 'tv1' },
          { id: 'm2', name: 'Priya Sharma', age: 39, needs: ['🌿 Dietary Needs'],  travelerId: 'tv2' },
          { id: 'm3', name: 'Aryan Sharma', age: 12, needs: [],                    travelerId: 'tv3' },
        ],
      },
      {
        id: 'f2', name: 'Gupta Family', color: '#e84393', groupId: 'sg2',
        members: [
          { id: 'm4', name: 'Vikram Gupta', age: 45, needs: [],                                    travelerId: 'tv4' },
          { id: 'm5', name: 'Sunita Gupta', age: 72, needs: ['🧓 Elderly (65+)', '♿ Wheelchair'],  travelerId: 'tv5' },
          { id: 'm6', name: 'Neha Gupta',   age: 16, needs: [],                                    travelerId: 'tv6' },
        ],
      },
    ],
    days: [
      {
        label: 'Day 1', date: '2026-07-10',
        activities: [
          { id: 'a1', type: 'transport', time: '08:00', name: 'Flight DEL → DPS', detail: 'Terminal 2 · Depart 08:00, Arrive 18:30', access: 'Wheelchair assistance at airport', costPerPerson: 300 },
          { id: 'a2', type: 'stay', time: '19:30', name: 'Check-in: The Layar Villa, Seminyak', detail: 'Pool villa with AC · 7 nights', access: 'Ground floor room available', costPerPerson: 140 },
          { id: 'a3', type: 'food', time: '21:00', name: 'Welcome dinner at Ku De Ta', detail: 'Beachfront dining, Seminyak', access: 'Accessible entrance, elevator', costPerPerson: 35 },
        ],
      },
      {
        label: 'Day 2', date: '2026-07-11',
        activities: [
          { id: 'a4', type: 'activity', time: '09:00', name: 'Tanah Lot Temple', detail: 'Iconic sea temple · Entry $5/person', access: 'Partially accessible, uneven stone paths', costPerPerson: 8 },
          { id: 'a5', type: 'food', time: '12:30', name: 'Lunch at Jimbaran Bay', detail: 'Fresh seafood by the beach', access: 'Accessible beachfront seating', costPerPerson: 22 },
          { id: 'a6', type: 'activity', time: '16:00', name: 'Uluwatu Cliff Walk & Kecak Dance', detail: 'Sunset kecak dance $8/person', access: 'Steep paths — not wheelchair friendly', costPerPerson: 12 },
          { id: 'a7', type: 'food', time: '20:00', name: 'Dinner at Jimbaran Seafood Cafes', detail: 'Fresh catch, BBQ on the beach', access: 'Beachside seating, accessible', costPerPerson: 28 },
        ],
      },
      {
        label: 'Day 3', date: '2026-07-12',
        activities: [
          { id: 'a8', type: 'transport', time: '08:00', name: 'Drive to Ubud (1.5 hrs)', detail: 'Private van with guide', access: 'Comfortable ride, stops on request', costPerPerson: 12 },
          { id: 'a9', type: 'activity', time: '09:30', name: 'Tegallalang Rice Terraces', detail: 'UNESCO heritage · Photography spot', access: 'Accessible viewing platforms', costPerPerson: 5 },
          { id: 'a10', type: 'food', time: '13:00', name: 'Warung Babi Guling Ibu Oka', detail: 'Famous suckling pig, Ubud', access: 'Small warung, limited accessibility', costPerPerson: 14 },
          { id: 'a11', type: 'activity', time: '15:00', name: 'Sacred Monkey Forest', detail: '700+ monkeys in ancient forest', access: 'Partly paved, some slope areas', costPerPerson: 6 },
          { id: 'a12', type: 'food', time: '19:30', name: 'Dinner at Locavore Nxt', detail: 'Award-winning Indonesian cuisine', access: 'Fully accessible, advance booking', costPerPerson: 55 },
        ],
      },
      {
        label: 'Day 4', date: '2026-07-13',
        activities: [
          { id: 'a13', type: 'activity', time: '08:00', name: 'Mount Batur Sunrise Hike', detail: 'Guided volcano trek, 4 hrs', access: 'Not suitable for elderly/wheelchair', costPerPerson: 45 },
          { id: 'a14', type: 'food', time: '13:00', name: 'Lunch at Kintamani Village', detail: 'Buffet with caldera views', access: 'Accessible, wide terrace', costPerPerson: 18 },
          { id: 'a15', type: 'food', time: '20:00', name: 'BBQ night at villa', detail: 'In-villa catering, private chef', access: 'Villa fully accessible', costPerPerson: 40 },
        ],
      },
      {
        label: 'Day 5', date: '2026-07-14',
        activities: [
          { id: 'a16', type: 'activity', time: '09:00', name: 'Nusa Penida Day Trip', detail: 'Speed boat + Blue Lagoon & Kelingking Beach', access: 'Boat not wheelchair accessible', costPerPerson: 65 },
          { id: 'a17', type: 'food', time: '20:00', name: 'Dinner at Merah Putih', detail: 'Modern Indonesian, Seminyak', access: 'Fully accessible, valet parking', costPerPerson: 48 },
        ],
      },
      {
        label: 'Day 6', date: '2026-07-15',
        activities: [
          { id: 'a18', type: 'activity', time: '09:00', name: 'Spa Morning at COMO Shambhala', detail: 'Traditional Balinese massage', access: 'Fully accessible spa facilities', costPerPerson: 90 },
          { id: 'a19', type: 'food', time: '18:00', name: 'Sunset cocktails at Potato Head', detail: 'Iconic beach club, book in advance', access: 'Accessible with lift', costPerPerson: 30 },
          { id: 'a20', type: 'food', time: '20:30', name: 'Farewell Dinner at Sarong', detail: 'Fine dining, private room for group', access: 'Fully accessible, private dining', costPerPerson: 75 },
        ],
      },
      {
        label: 'Day 7', date: '2026-07-16',
        activities: [
          { id: 'a21', type: 'activity', time: '10:00', name: 'Last-minute souvenir shopping', detail: 'Kuta Art Market, airport duty-free', access: 'Accessible shopping areas', costPerPerson: 50 },
          { id: 'a22', type: 'transport', time: '15:00', name: 'Transfer to Ngurah Rai Airport', detail: 'Private van (90 min before flight)', access: 'Accessible vehicle with ramp', costPerPerson: 12 },
        ],
      },
      {
        label: 'Day 8', date: '2026-07-17',
        activities: [
          { id: 'a23', type: 'transport', time: '00:30', name: 'Flight DPS → DEL', detail: 'Depart 00:30 · Arrive early morning', access: 'Wheelchair pre-arranged', costPerPerson: 300 },
        ],
      },
    ],
    expenses: [
      { id: 'e1', name: 'Villa Booking (7 nights)', amount: 1960, category: '🏨', paidBy: 'm1', splitBetween: ['m1','m4'], participatingFamilies: ['f1','f2'], source: 'manual' },
      { id: 'e2', name: 'Group Flights (12 seats)', amount: 3600, category: '✈️', paidBy: 'm4', splitBetween: ['m1','m2','m3','m4','m5','m6'], participatingFamilies: ['f1','f2'], source: 'manual' },
      { id: 'e3', name: 'Travel Insurance (group)', amount: 480, category: '💊', paidBy: 'm1', splitBetween: ['m1','m2','m3','m4','m5','m6'], participatingFamilies: ['f1','f2'], source: 'manual' },
      { id: 'e4', name: 'Private Van Hire (7 days)', amount: 700, category: '✈️', paidBy: 'm4', splitBetween: ['m1','m4'], participatingFamilies: ['f1','f2'], source: 'manual' },
      { id: 'e5', name: 'Entry Tickets & Permits', amount: 210, category: '🎯', paidBy: 'm1', splitBetween: ['m1','m2','m3','m4','m5','m6'], participatingFamilies: ['f1','f2'], source: 'manual' },
    ],
  },

  // ── LA Family Adventure ────────────────────────────────────────────────────
  {
    id: 't2',
    name: 'LA Family Adventure',
    destination: 'Los Angeles, California',
    emoji: '🎬',
    startDate: '2026-08-15',
    endDate: '2026-08-20',
    mode: 'ai',
    bgColors: ['#0984e3', '#6c5ce7'],
    itineraryPushed: false,
    families: [
      {
        id: 'laf1', name: 'Sharma Family', color: '#6c5ce7', groupId: 'sg1',
        members: [
          { id: 'lam1', name: 'Raj Sharma',   age: 42, needs: [],                   travelerId: 'tv1' },
          { id: 'lam2', name: 'Priya Sharma', age: 39, needs: ['🌿 Dietary Needs'], travelerId: 'tv2' },
          { id: 'lam3', name: 'Aryan Sharma', age: 12, needs: [],                   travelerId: 'tv3' },
        ],
      },
      {
        id: 'laf2', name: 'Gupta Family', color: '#e84393', groupId: 'sg2',
        members: [
          { id: 'lam4', name: 'Vikram Gupta', age: 45, needs: [],                                    travelerId: 'tv4' },
          { id: 'lam5', name: 'Sunita Gupta', age: 72, needs: ['🧓 Elderly (65+)', '♿ Wheelchair'], travelerId: 'tv5' },
          { id: 'lam6', name: 'Neha Gupta',   age: 16, needs: [],                                    travelerId: 'tv6' },
        ],
      },
    ],
    days: [
      {
        label: 'Day 1', date: '2026-08-15',
        activities: [
          { id: 'la_a1', type: 'transport', time: '14:00', name: 'LAX → Hotel Private Accessible Transfer', detail: 'Pre-booked accessible van · ~45 min to Hollywood · Luggage assistance', access: 'Wheelchair lift equipped, certified accessible vehicle', costPerPerson: 25, address: 'Los Angeles International Airport, Los Angeles, CA 90045', lat: 33.9416, lng: -118.4085, url: null, mapUrl: 'https://maps.google.com/?q=LAX+Airport+Los+Angeles', rating: null, note: 'Book via Uber Wheelchair or pre-arranged accessible van. Book 48 hrs ahead.' },
          { id: 'la_a2', type: 'stay', time: '16:00', name: 'Check-in: Loews Hollywood Hotel', detail: '4-star · Adjacent to TCL Chinese Theatre · Rooftop pool · 2 restaurants', access: 'ADA accessible rooms & suites, roll-in shower available on request', costPerPerson: 120, address: '1755 N Highland Ave, Hollywood, CA 90028', lat: 34.1022, lng: -118.3390, url: 'https://loewshotels.com/hollywood-hotel', mapUrl: 'https://maps.google.com/?q=Loews+Hollywood+Hotel', rating: '4.3 ⭐', note: 'Request ADA room with roll-in shower when booking. Valet parking available.' },
          { id: 'la_a3', type: 'activity', time: '17:30', name: 'Hollywood Walk of Fame & TCL Chinese Theatre', detail: '2,700+ stars · Celebrity handprints · Iconic Hollywood landmark · Free to stroll', access: 'Flat sidewalk, fully wheelchair accessible', costPerPerson: 0, address: '6925 Hollywood Blvd, Hollywood, CA 90028', lat: 34.1015, lng: -118.3265, url: 'https://walkoffame.com', mapUrl: 'https://maps.google.com/?q=Hollywood+Walk+of+Fame', rating: '4.5 ⭐', note: 'Look for Bollywood stars on the Walk! Best for photos before sunset.' },
          { id: 'la_a4', type: 'food', time: '19:00', name: 'Musso & Frank Grill', detail: 'Hollywood\'s oldest restaurant since 1919 · Classic American steakhouse', access: 'Wheelchair accessible main entrance and seating', costPerPerson: 48, address: '6667 Hollywood Blvd, Hollywood, CA 90028', lat: 34.1012, lng: -118.3394, url: 'https://mussoandfrank.com', mapUrl: 'https://maps.google.com/?q=Musso+and+Frank+Grill+Hollywood', rating: '4.5 ⭐', note: 'Charlie Chaplin once dined here. Vegetarian pasta options available.' },
        ],
      },
      {
        label: 'Day 2', date: '2026-08-16',
        activities: [
          { id: 'la_a5', type: 'activity', time: '09:30', name: 'Griffith Observatory', detail: 'Free to grounds · Planetarium $7 · Best panoramic skyline views in LA', access: 'Fully wheelchair accessible via west-side drive-up entrance', costPerPerson: 7, address: '2800 E Observatory Rd, Los Angeles, CA 90027', lat: 34.1184, lng: -118.3004, url: 'https://griffithobservatory.org', mapUrl: 'https://maps.google.com/?q=Griffith+Observatory,Los+Angeles', rating: '4.8 ⭐', note: 'Book planetarium show online. Take the free DASH Observatory bus from Greek Theatre parking.' },
          { id: 'la_a6', type: 'food', time: '12:30', name: 'Loteria Grill at the Original Farmers Market', detail: 'Authentic Mexican · Award-winning guacamole · Outdoor market seating', access: 'Outdoor open seating, wheelchair accessible throughout', costPerPerson: 18, address: '6333 W 3rd St Stall 322, Los Angeles, CA 90036', lat: 34.0724, lng: -118.3586, url: 'https://loteriagrill.com', mapUrl: 'https://maps.google.com/?q=Loteria+Grill+Farmers+Market+Los+Angeles', rating: '4.5 ⭐', note: 'Try the mushroom & rajas tacos — best vegetarian option in the whole market!' },
          { id: 'la_a7', type: 'activity', time: '14:00', name: 'The Grove & Original Farmers Market', detail: 'Open-air shopping · Electric trolley · Fountain shows · Farmers Market since 1934', access: 'Fully flat and wheelchair accessible throughout', costPerPerson: 0, address: '189 The Grove Dr, Los Angeles, CA 90036', lat: 34.0721, lng: -118.3586, url: 'https://thegrovela.com', mapUrl: 'https://maps.google.com/?q=The+Grove+Los+Angeles', rating: '4.6 ⭐', note: 'Great for Neha & Priya — Zara, H&M, Apple Store all accessible. Trolley is free!' },
          { id: 'la_a8', type: 'activity', time: '16:00', name: 'La Brea Tar Pits & Museum', detail: 'Active Ice Age fossil excavation · Mammoth & sabertooth skull displays', access: 'Wheelchair accessible paths, museum entrance, and all exhibit floors', costPerPerson: 15, address: '5801 Wilshire Blvd, Los Angeles, CA 90036', lat: 34.0639, lng: -118.3561, url: 'https://tarpits.org', mapUrl: 'https://maps.google.com/?q=La+Brea+Tar+Pits,Los+Angeles', rating: '4.5 ⭐', note: 'Aryan will love the active excavation pit! Combo ticket with NHM saves $5/person.' },
          { id: 'la_a9', type: 'food', time: '18:30', name: 'Republique', detail: 'French-Californian bistro · James Beard-nominated · Beautiful 1929 historic building', access: 'Step-free entrance, fully accessible restrooms, accessible seating', costPerPerson: 45, address: '624 S La Brea Ave, Los Angeles, CA 90036', lat: 34.0620, lng: -118.3533, url: 'https://republiquela.com', mapUrl: 'https://maps.google.com/?q=Republique+Restaurant+Los+Angeles', rating: '4.7 ⭐', note: 'Book 2-3 weeks ahead. Excellent vegetarian options — the roasted mushroom dish is outstanding.' },
        ],
      },
      {
        label: 'Day 3', date: '2026-08-17',
        activities: [
          { id: 'la_a10', type: 'activity', time: '09:30', name: 'Natural History Museum of LA County', detail: 'Dinosaur Hall · Gem vault · Live butterfly pavilion (seasonal) · Kid favourite', access: 'Fully wheelchair accessible, stroller-friendly, elevators throughout', costPerPerson: 15, address: '900 W Exposition Blvd, Los Angeles, CA 90007', lat: 34.0179, lng: -118.2883, url: 'https://nhm.org', mapUrl: 'https://maps.google.com/?q=Natural+History+Museum+Los+Angeles', rating: '4.6 ⭐', note: 'Aryan will be blown away by the Dinosaur Hall! Allow 2-3 hours minimum.' },
          { id: 'la_a11', type: 'food', time: '12:30', name: 'Guisados', detail: 'Braised taco specialists · LA local legend since 2010 · Incredible flavours', access: 'Accessible entrance, indoor and outdoor seating available', costPerPerson: 14, address: '2100 E Cesar E Chavez Ave, Los Angeles, CA 90033', lat: 34.0512, lng: -118.2128, url: 'https://guisados.co', mapUrl: 'https://maps.google.com/?q=Guisados+Restaurant+Los+Angeles', rating: '4.8 ⭐', note: 'Get the sampler! Vegetarian picks: rajas con crema, mushroom, bean & cheese.' },
          { id: 'la_a12', type: 'activity', time: '14:00', name: 'LACMA — Los Angeles County Museum of Art', detail: 'Largest art museum in western US · Urban Lights installation · Diverse collections', access: 'Fully wheelchair accessible, elevators in all wings, accessible restrooms', costPerPerson: 20, address: '5905 Wilshire Blvd, Los Angeles, CA 90036', lat: 34.0638, lng: -118.3592, url: 'https://lacma.org', mapUrl: 'https://maps.google.com/?q=LACMA+Los+Angeles', rating: '4.7 ⭐', note: 'Neha will love the contemporary art wings. The Urban Lights sculpture outside is free — stunning at dusk!' },
          { id: 'la_a13', type: 'food', time: '18:30', name: 'Gracias Madre', detail: 'Award-winning plant-based Mexican · Fully vegan · Celebrity hotspot in West Hollywood', access: 'Wheelchair accessible entrance, restrooms and outdoor patio', costPerPerson: 35, address: '8905 Melrose Ave, West Hollywood, CA 90069', lat: 34.0793, lng: -118.3813, url: 'https://graciasmadreweho.com', mapUrl: 'https://maps.google.com/?q=Gracias+Madre+West+Hollywood', rating: '4.4 ⭐', note: 'Perfect for Priya — 100% plant-based. The enchiladas de rajas are a must-try!' },
        ],
      },
      {
        label: 'Day 4', date: '2026-08-18',
        activities: [
          { id: 'la_a14', type: 'activity', time: '09:00', name: 'Universal Studios Hollywood', detail: 'Wizarding World of Harry Potter · Jurassic World · Classic Hollywood Studio Tour', access: 'Wheelchair accessible throughout, ADA parking, companion restrooms on every level', costPerPerson: 109, address: '100 Universal City Plaza, Universal City, CA 91608', lat: 34.1381, lng: -118.3534, url: 'https://www.universalstudioshollywood.com', mapUrl: 'https://maps.google.com/?q=Universal+Studios+Hollywood', rating: '4.7 ⭐', note: 'Book 2+ weeks ahead to save $30/person. Studio Tour has a separate wheelchair-accessible entrance at the rear.' },
          { id: 'la_a15', type: 'note', time: '17:30', name: 'Hotel Rest & Pool Time', detail: 'Rest after a full theme park day · Rooftop pool & deck at hotel', access: 'Hotel pool and deck fully accessible', costPerPerson: 0, note: 'Sunita can relax at the accessible pool deck — well earned after a big day!' },
          { id: 'la_a16', type: 'food', time: '19:00', name: 'Bottega Louie', detail: 'Grand Italian-American brasserie · Macarons · Downtown LA landmark · Great for groups', access: 'Fully wheelchair accessible, spacious dining room, accessible restrooms', costPerPerson: 38, address: '700 S Grand Ave, Los Angeles, CA 90017', lat: 34.0469, lng: -118.2554, url: 'https://bottegalouie.com', mapUrl: 'https://maps.google.com/?q=Bottega+Louie+Los+Angeles', rating: '4.6 ⭐', note: 'Book ahead for groups. Don\'t leave without the macarons from the patisserie!' },
        ],
      },
      {
        label: 'Day 5', date: '2026-08-19',
        activities: [
          { id: 'la_a17', type: 'activity', time: '09:30', name: 'Venice Beach Boardwalk', detail: '1.5-mile flat boardwalk · Street performers · Muscle Beach · Local art stalls', access: 'Completely flat — ideal for wheelchair users, no barriers on the boardwalk', costPerPerson: 0, address: 'Ocean Front Walk, Venice, CA 90291', lat: 33.9850, lng: -118.4695, url: 'https://www.visitveniceca.com', mapUrl: 'https://maps.google.com/?q=Venice+Beach+Boardwalk,Los+Angeles', rating: '4.6 ⭐', note: 'Best before 11am. The skate park has an accessible spectator area — Aryan will love watching!' },
          { id: 'la_a18', type: 'activity', time: '11:00', name: 'Santa Monica Pier & Pacific Park', detail: 'Solar-powered Ferris wheel · Pacific Park rides · Historic End of Route 66', access: 'Wheelchair accessible pier, ADA-adapted rides available with staff assistance', costPerPerson: 15, address: '200 Santa Monica Pier, Santa Monica, CA 90401', lat: 34.0099, lng: -118.4973, url: 'https://santamonicapier.org', mapUrl: 'https://maps.google.com/?q=Santa+Monica+Pier', rating: '4.7 ⭐', note: 'Ferris wheel is wheelchair accessible with advance notice to Pacific Park staff. Aryan will love the rides!' },
          { id: 'la_a19', type: 'food', time: '13:30', name: 'The Lobster — Santa Monica', detail: 'Fresh seafood & steaks · Stunning Pacific Ocean views · Right next to the Pier', access: 'Elevator to main dining level, fully wheelchair accessible', costPerPerson: 55, address: '1602 Ocean Ave, Santa Monica, CA 90401', lat: 34.0106, lng: -118.4984, url: 'https://thelobster.com', mapUrl: 'https://maps.google.com/?q=The+Lobster+Restaurant+Santa+Monica', rating: '4.4 ⭐', note: 'Request a window table for ocean views. Vegetarian pasta & salads available.' },
          { id: 'la_a20', type: 'activity', time: '15:30', name: 'Third Street Promenade Shopping', detail: 'Pedestrian shopping street · Street performers · Pacific Ocean steps away', access: 'Completely flat, excellent wheelchair access throughout', costPerPerson: 0, address: 'Third Street Promenade, Santa Monica, CA 90401', lat: 34.0145, lng: -118.4969, url: null, mapUrl: 'https://maps.google.com/?q=Third+Street+Promenade+Santa+Monica', rating: '4.5 ⭐', note: 'Neha\'s highlight! H&M, Zara, Patagonia, local boutiques — all accessible.' },
          { id: 'la_a21', type: 'food', time: '18:30', name: 'Nobu Malibu', detail: 'World-class Japanese fusion · Oceanfront deck dining · Special group occasion', access: 'Wheelchair accessible indoor and outdoor deck seating', costPerPerson: 85, address: '22706 Pacific Coast Hwy, Malibu, CA 90265', lat: 34.0354, lng: -118.6811, url: 'https://noburestaurants.com/malibu', mapUrl: 'https://maps.google.com/?q=Nobu+Malibu+Restaurant', rating: '4.6 ⭐', note: 'Book 3-4 weeks ahead — fills fast! Vegetarian omakase available on request.' },
        ],
      },
      {
        label: 'Day 6', date: '2026-08-20',
        activities: [
          { id: 'la_a22', type: 'activity', time: '09:30', name: 'Olvera Street — Birthplace of Los Angeles', detail: 'Historic Mexican marketplace · Founded 1781 · Artisan stalls & colourful murals', access: 'Mostly flat; some uneven cobblestone — manageable with wheelchair assistance', costPerPerson: 0, address: '10 Olvera St, Los Angeles, CA 90012', lat: 34.0578, lng: -118.2361, url: 'https://olvera-street.com', mapUrl: 'https://maps.google.com/?q=Olvera+Street+Los+Angeles', rating: '4.5 ⭐', note: 'Raj & Vikram will love the history. Get a churro from La Golondrina — oldest restaurant in LA!' },
          { id: 'la_a23', type: 'note', time: '11:00', name: 'Hotel Checkout & Souvenir Shopping', detail: 'Checkout by 12pm · Last-minute souvenir picks at nearby stalls', access: 'Hotel fully accessible', costPerPerson: 50 },
          { id: 'la_a24', type: 'transport', time: '13:30', name: 'Hotel → LAX Transfer', detail: 'Pre-booked accessible van · Allow 2.5 hrs before departure flight', access: 'Wheelchair lift equipped, luggage assistance included', costPerPerson: 25, address: 'Los Angeles International Airport, Los Angeles, CA 90045', lat: 33.9416, lng: -118.4085, url: null, mapUrl: 'https://maps.google.com/?q=LAX+Airport+Los+Angeles', rating: null, note: 'LAX is very busy — allow 2.5 hrs minimum. Pre-arrange TSA Cares for Sunita.' },
        ],
      },
    ],
    expenses: [
      { id: 'le1', name: 'Hotel Booking (5 nights)', amount: 3600, category: '🏨', paidBy: 'lam1', splitBetween: ['lam1','lam4'], participatingFamilies: ['laf1','laf2'], source: 'manual' },
      { id: 'le2', name: 'Return Flights (6 seats)', amount: 4200, category: '✈️', paidBy: 'lam4', splitBetween: ['lam1','lam2','lam3','lam4','lam5','lam6'], participatingFamilies: ['laf1','laf2'], source: 'manual' },
      { id: 'le3', name: 'Universal Studios Tickets', amount: 654, category: '🎯', paidBy: 'lam1', splitBetween: ['lam1','lam2','lam3','lam4','lam5','lam6'], participatingFamilies: ['laf1','laf2'], source: 'manual' },
      { id: 'le4', name: 'Travel Insurance', amount: 360, category: '💊', paidBy: 'lam1', splitBetween: ['lam1','lam2','lam3','lam4','lam5','lam6'], participatingFamilies: ['laf1','laf2'], source: 'manual' },
    ],
  },
];
