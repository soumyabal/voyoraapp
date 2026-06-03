# Decision: how Voyara represents "where the group sleeps each night"

> Question: a hotel is one check-in `stay` activity on one day; later nights have
> no `stay`, so nothing knows where you sleep on Day 3. Should we add a hotel
> entry to every night's day? **Decision: No — model the booking once and
> *derive* the per-night view.** Both web research and the in-house product
> designer reached this independently. June 2026.

## What the field does
TripIt, Wanderlog, Furkot, Booking.com all store accommodation as **one
multi-night reservation = a check-in→check-out span**, and *render* the per-night
"where you sleep" from it. None writes a lodging row onto every day. (Furkot
"finds a place for every night" and pre-fills check-in/out from the one booking.)

## Why NOT "a stay per night" (the rejected option)
Voyara puts the **whole** booking total on the single check-in activity
(`DiscoverModal.js` `handleConfirmAdd`: `costMode:'total'`, `costAmount = rate ×
nights` = e.g. $378, `costPerPerson = total / members`). And every costed
activity auto-creates one Splitwise expense (`store/index.js` `activityToExpense`,
called from `addActivity` and `applyArrangedActivities`). So a `stay` on Day 1 +
Day 2 + Day 3 would either **triple-bill the hotel** (breaks the moat) or require
zero-cost "marker" carve-outs synced across N day-records by *four* store actions
— plus it'd trip the duplicate-activity warning ("Hotel X added 3 times"). High
risk on the one part of the app that must never be wrong, for zero gain over
deriving it.

## The decision — derive (Option 1)
Keep **one** check-in `stay` (cost stays there only) and add a pure helper that
answers "where do I sleep the night of day N" by scanning backward to the most
recent check-in whose span still covers that night.

### Schema (one additive, optional field)
```js
// Activity (type:'stay')
{ type:'stay', name, time, lat, lng,
  costMode:'total', costAmount:378, costPerPerson:…,  // UNCHANGED — cost lives here only
  nights: 2 }   // NEW optional number; already computed in DiscoverModal, today thrown into `detail`
```
No AsyncStorage version bump (additive/optional; absent → `nights = 1`). Check-out
is **derived** (`checkInIdx + nights`), not stored.

### Helper
```js
// where the group sleeps the NIGHT OF trip.days[dayIndex]
lodgingForNight(trip, dayIndex) =>
  | { stay, checkInDayIndex, nights, nightNumber, isCheckInDay, isLastNight }
  | { overnightTransit: activity }   // red-eye / sleeper train → no hotel tonight
  | null                             // unbooked (or home-base) night
```
- Overnight travel wins first (reuses the midnight-cross signal `tripValidator.js`
  already trusts: `arriveTime < time`).
- Else scan backward; a stay covers night `i` when `checkInIdx <= i < checkInIdx + nights`.
- Most recent stay already checked out → `null` (unbooked). Multi-city hotel
  changes and last-night-fly-home fall out automatically.

### UI — a derived, non-editable "🌙 Sleeping at …" footer chip per day
- **Arrival day:** the `stay` is a normal editable row; chip = "Night 1 of 2 · Hotel Indigo".
- **Middle night:** no row, just the chip — "Night 2 of 2 · Hotel Indigo  (no extra charge)". The muted "(no extra charge)" tells the user the cost is already on Day 1, so they don't add a second hotel expense.
- **Last day (check out, fly home):** "Check out by 11am" (derived) + "🏡 No hotel tonight — heading home".

### Edge cases (all from the same derivation)
overnight transit → show the journey, suppress hotel · multi-city → second
check-in `stay` with its own `nights` · last night → `null` = home · home-base
trip → a `trip.homeBase` flag renders "🏡 Home" and suppresses the unbooked nag.

### Engine integration
- **Trip-Check** rules read the helper: `unbooked_night` (warning — `null` and not
  last day / overnight / home-base), `lastday_missing_checkout`, `hotel_no_checkin`.
- **Auto-arrange** improves for free: change `autoArrange.js:128` `dayAnchor` to
  fall back to `lodgingForNight(...).stay` so middle-night routes cluster near the
  actual hotel (today only the check-in day has an anchor).

## Plan
**P0:** persist `nights` (number) on the check-in `stay`; add `lodgingForNight`;
render the per-day footer chip (3 states); add `unbooked_night` +
`lastday_missing_checkout`. Zero cost-path change, no double-billing possible.
**P1:** derived `dayAnchor` for auto-arrange; `homeBase` flag; `hotel_no_checkin` /
`checkin_too_early`.
**Deferred (Phase 2):** promote lodging to a first-class booking *entity* when the
FastAPI/SQLite backend + real Booking.com pricing land — overkill now.

*Voyara · lodging model decision · June 2026.*
