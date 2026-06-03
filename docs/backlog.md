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

## Testing / architecture

- [ ] **Extract + test Discover logic.** `placeScore`, added/seen/toggle derivation,
      and `toggleAdd` are pure but live inside `DiscoverModal` (untested — every bug
      this session lived in that component layer). Pull into a tested `discover` helper.
- [ ] **product-tester habit.** Run the product-tester agent on UI diffs before commit
      (the WebView/map bits can't be unit-tested).

---

*Voyara · backlog · update as items ship.*
