# Voyara — Tracked Backlog (come-back list)

> Parking lot for agreed-but-deferred work, so nothing gets lost between sessions.
> Check items off as they ship. Newest context at top.

---

## Itinerary card — design polish (from the June 2026 planner + UX review)

The card was redesigned to the 56px-leading-thumbnail layout (committed `7cd8f33`).
Both reviewers flagged these *follow-ups* that were NOT done in that pass:

- [ ] **P1 · Tokenize badges.** The meta pills still use raw hex pastels. Swap to
      semantic tokens (`accentSoft/accent`, `warnSoft/warn`, `dangerSoft/danger`,
      `hairline/subtle`); per-family cost → `smartSoft/smart` (the one allowed
      purple). Calms the palette + fixes borderline contrast. — `ItineraryScreen.js`
- [ ] **P1 · One `⋮` overflow + 44pt targets.** Collapse the inline edit/move icons
      and the `▲▼` reorder glyphs into a single `⋮` overflow menu; use `<Icon>`
      chevrons for `▾ details`. Current edit/move targets are ~31pt — under the 44pt
      minimum the design system mandates. — `ItineraryScreen.js`
- [ ] **P2 · Accessibility labels.** Add `accessibilityLabel`s so VoiceOver reads
      "Courtyard Cafe, food, 12:30, $35 per person, rated 4.8." — `ItineraryScreen.js`
- [ ] **Consider · Promote "closed".** When a stop is scheduled while closed, pull
      the red `🔴 Closed` cue out of the pill row to first position — a closed-venue
      day is a day-breaker, not a footnote (planner note). — `ItineraryScreen.js`
- [ ] **Consider · Density toggle.** Optional compact/comfortable card density (pure
      style swap) for photo-lovers vs. planners. Default = compact. — `ItineraryScreen.js`

## Travel time / distance — reliability

Current legs ("🚗 7 min · 2.3 km") are a **free estimate**, not real routing:
straight-line haversine for the distance × **1.3 road-detour** for the time, at fixed
speeds (walk 4.8 km/h ≤1 km, else drive 26 km/h). Directionally useful (powers the
"Tight travel time" check); NOT minute-accurate, and **under**estimates around water/
highways (e.g. the Dells river). Displayed km is straight-line; the minutes already
include the detour factor (so the two aren't on the same basis).

- [ ] **Real routing.** Swap the free estimate for Google Routes / OSRM behind
      `travelLeg(a,b)` → true road distance + time (+ traffic). Same shape in/out, so
      callers don't change. (Also roadmap #1 in `intelligent-planner.md`.) — `geo.js`
- [ ] **Minor · consistent display.** Show the road-estimate distance (×1.3) so km and
      minutes are on the same basis, or label the distance "straight-line". — `geo.js` /
      `ItineraryScreen.js TravelConnector`

## Add flow (from the June 2026 planner + UX review)

Resolved to "two, clearly distinct" — Discover = find real places (FAB + every slot's
"+ Add"); "✎ Manual" = enter your own (transport/custom/per-family cost). Shipped
`22ba724`. Remaining:

- [ ] **Dedupe the day/slot/time picker.** The slot + suggested-time logic is duplicated
      across `AddActivityModal` (the WHEN grid) and `DiscoverModal` (`handleConfirmAdd`/
      `quickAdd`); `utils/slots.js` centralizes the math but the picker UI/placement still
      drifts. Extract to one shared component so the two add paths can't diverge. Both
      reviewers flagged this. — `AddActivityModal.js` / `DiscoverModal.js` / `utils/slots.js`
- [ ] **Default the manual editor to Drive when opened via the bridge** (initialTile), since
      the bridge is framed as "drive, flight, or custom" — claws back a tap. — `AddActivityModal.js`

## Trip starting point (Day-1 origin) — shipped P0, generalize in P1

`trip.origin = {label, lat, lng}` captured at create (wizard Step 1), in Edit Trip,
and via a tappable Day-1 chip (`SetOriginModal`). Day 1's first stop shows a leg from
it; ≤60 km → "🚗 5 min · 1.3 km", beyond → "🧭 239 km" (distance only — the city-speed
estimate is garbage at range). Also anchors Day-1 auto-arrange. Verified June 2026.
The right general model (from the itinerary-architect consult): *every day starts where
you slept the night before* — origin is just Day-0's boundary case.

- [ ] **P1 · Opening leg on every day from the prior night's hotel.** Mirror of the
      "🌙 Sleeping at…" footer: draw a leg from `lodgingForNight(trip, N-1).stay` into
      day N's first stop (Day 1 already does this from `trip.origin`). — `ItineraryScreen.js`
- [ ] **P1 · Last-day return leg.** A closing leg from the last stop back to the origin
      (road trip) or the departure airport. Design `trip.origin` to double as the return
      anchor; add a sibling `trip.returnTo` only if open-jaw (fly home from a different
      city) is needed. — `ItineraryScreen.js`
- [ ] **P1 · `origin.kind` (flight|drive|home).** Today flight vs drive is *inferred*
      from distance (>60 km → distance-only). A `kind` would let a genuine long road-trip
      show a real drive and a flight show "✈️ arrive", instead of one heuristic. — `SetOriginModal.js`
- [ ] **P1 · Trip-Check origin rule.** The origin leg is informational (never red) since
      there's no departure time to be "late" against. If a trip start-time is ever added,
      a "leave by HH:MM to make your first stop" check becomes possible. — `tripValidator.js`

## Off-Places lodging (Airbnb) — shipped, one follow-up

Adding a place that isn't a Google Places business (Airbnb/VRBO, a rental, a friend's
house) now works two ways: **(A)** type an address in the ✎ Manual editor → **Find**
geocodes it to lat/lng; **(B)** long-press the Discover map → "Add a stop here" drops a
pin → opens Manual seeded with those coords (Stay default). Either way the stop gets a
lat/lng so it anchors the day + draws travel legs. Verified on device June 2026.

- [ ] **Enable the classic Geocoding API on the Places key.** `reverseGeocode` (pin →
      street address, for display only) returns `null` on the current key — confirmed on
      device: a dropped pin shows "✓ Located" but no address text. Graceful (the pin's
      coords are still saved + schedule fine), but the address line stays blank. Turn on
      *Geocoding API* for that key to populate it. — `places.js reverseGeocode`

## Testing / architecture

- [ ] **Extract + test Discover logic.** `placeScore`, added/seen/toggle derivation,
      and `toggleAdd` are pure but live inside `DiscoverModal` (untested — every bug
      this session lived in that component layer). Pull into a tested `discover` helper.
- [ ] **product-tester habit.** Run the product-tester agent on UI diffs before commit
      (the WebView/map bits can't be unit-tested).

---

*Voyara · backlog · update as items ship.*
