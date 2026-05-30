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
        id: 'f1', name: 'Sharma Family', color: '#6c5ce7',
        members: [
          { id: 'm1', name: 'Raj Sharma', age: 42, needs: [] },
          { id: 'm2', name: 'Priya Sharma', age: 39, needs: ['🌿 Dietary Needs'] },
          { id: 'm3', name: 'Aryan Sharma', age: 12, needs: [] },
        ],
      },
      {
        id: 'f2', name: 'Gupta Family', color: '#e84393',
        members: [
          { id: 'm4', name: 'Vikram Gupta', age: 45, needs: [] },
          { id: 'm5', name: 'Sunita Gupta', age: 72, needs: ['🧓 Elderly (65+)', '♿ Wheelchair'] },
          { id: 'm6', name: 'Neha Gupta', age: 16, needs: [] },
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
];
