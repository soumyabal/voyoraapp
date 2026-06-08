# Voyara — Tracked Backlog (come-back list)

> Parking lot for agreed-but-deferred work, so nothing gets lost between sessions.
> Check items off as they ship. Newest context at top.

---

## Store / TestFlight readiness (the non-code gates)

- [x] **Branded launch** — real app icon + splash (kith constellation), splash via the
      expo-splash-screen plugin. EAS dev-build prep done (expo-dev-client + key-free config hook).
- [ ] **Privacy policy** — DRAFTED at `docs/privacy-policy.md` (code-accurate: local-only storage,
      no accounts, no analytics, no GPS; sends typed place searches to Google/Wikipedia/Komoot-OSM).
      TODO: review it, set the contact email + any legal entity, **host it** (e.g.
      `https://kithova.com/privacy`), and paste the URL into App Store Connect. App Privacy
      questionnaire answers are pre-filled in `docs/app-store-privacy-answers.md`.
- [ ] **Restrict the Google Places key** in Google Cloud Console: (a) API restriction → Places API
      (New) + Geocoding + Distance Matrix (unconditional, no code change — **do this first, zero risk**);
      (b) iOS app restriction → bundle `com.kithova.app`. The `X-Ios-Bundle-Identifier` header is now
      sent on **all fetch-based Google calls** (search/geocode/distance) via `src/utils/googleApi.js`
      `withBundleId()` — a safe no-op until the restriction is on, drift-guarded against app.json by
      `googleApi.test.js`. ⚠️ **Still needed before enabling (b):** place-photo thumbnails bake the key
      into the URL and render via RN `<Image source={{uri}}>` (DiscoverModal + itinerary cards), which
      doesn't send the header — so an iOS *application* restriction would 403 photos until those Image
      sources also pass `headers: withBundleId()`. Device-verify step. **Plan:** ship API-restriction-only
      (a) for v1, then add the Image headers + enable (b) in a paired device session.
- [ ] **Apple Developer enrollment** ($99/yr) — gates both the EAS device build and TestFlight.
- [ ] **Version sync (optional)** — app.json/package.json are `1.0.0` while git tags are at
      `v1.2.0`; sync if you want the build number to track tags.

## Lint baseline / React Compiler readiness (from the June 2026 lint-to-zero pass)

Lint is now **0 errors** (was 97). The React Compiler rules from `eslint-plugin-react-hooks`
v7 fire even though the compiler is OFF; the false positives are suppressed per-file and
`set-state-in-effect` is `warn` centrally. Follow-ups:

- [ ] **Migrate modals off the `set-state-in-effect` "seed form on open" idiom.** ~20 modals
      do `useEffect(() => { if (visible) setX(initial…) }, [visible, initial])`. The clean fix
      is the **key-prop remount** pattern (`<EditFooModal key={initial?.id ?? 'new'} … />` from
      the parent + `useState(initial?.x)` initializers — delete the effect). Do it
      **opportunistically** when a modal is already open for other work + device-tested — NOT a
      risky 20-file sweep. Tracked because it's the last real React-Compiler blocker if we ever
      enable the compiler. — `*Modal.js` + parents
- [ ] **Clean remaining ~87 advisory warnings incrementally** (import/first in tests,
      exhaustive-deps, scaffolding vars like `setIsRefining`/`handleApplyFix`/`resolveCity`/
      `PACE_LABELS`/the unused `pv` stylesheet). Left in place because they read as intended
      scaffolding — confirm dead before deleting.
- [ ] **Timezone handling.** Distances are now US miles (`formatMi`); timezone-aware times/dates
      were explicitly deferred. Revisit before non-US launch or multi-timezone trips.

## Add-a-stop flow (from the June 2026 entry-point review)

- [ ] **Smarter default SLOT for the header "Manual" button.** It always opens to
      Morning (defaultTime 09:00). The smart-time fix (`11e2210`) stops stops from
      stacking *within* a slot, but on a busy day Manual still suggests later-and-later
      Morning times then clamps near noon. Consider opening to the first slot with room,
      or to the current slot during an ACTIVE trip ("now"). Panel deferred it as a
      separate feature (needs live-trip detection). — `ItineraryScreen.js` (`openAdd`)
- [ ] **Consider · per-slot "+" as a chooser.** Make the per-slot "+ Add here" open a
      tiny menu [🔍 Search a place / ✎ Add manually] (both slot-scoped); could retire the
      header "Manual" button. Deferred from the "+ Add vs Discover" review. — `ItineraryScreen.js`
- [ ] **Consider · two bottom-right FABs.** Discover + Check-Trip both float bottom-right;
      revisit whether both need to be persistent (best decided with usage data). — `ItineraryScreen.js`

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
- [x] ~~**Consider · Promote "closed".**~~ OBSOLETE (`25b4b54`): the red `🔴 Closed`
      live-status cue was REMOVED on owner request — cards now show hours of operation
      (that day's hours, or the weekly summary when closed that day); scheduling-while-
      closed is surfaced by Trip Check, not the card. — `ItineraryScreen.js`
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

## Trip Check — "wall of red" de-alarmed (shipped P0, polish deferred)

A first-timer opened a fresh/sample trip and was greeted by a red "6" badge + a row
of red chips ("Schedule overlap ×3 · Tight travel time · Very packed day"). Three
agents (UX + travel + a11y) agreed: the engine's fine, the alarm is manufactured —
heuristic guesses dressed as errors (cry-wolf), severity by colour alone (WCAG 1.4.1).
Shipped: **re-tiered severities** (red/`error` only for provable conflicts — closed
venue, 6h+ journey; estimate-based overlap/travel-time/packed → `info` tips); the
inline red row → **one calm summary pill** ("1 to check · 3 tips" / "✓ Looks
well-paced"); the trip badge → **green ✓ unless a real conflict survives** (no inflated
count); checker copy "conflict/warning" → "to fix / to check / tips". Verified June 2026.

- [ ] **Per-day health dot (option #6).** Put a small green/amber dot on each Day tab
      so "which day has something" is glanceable, and the trip badge can retire. — `ItineraryScreen.js`
- [ ] **Completeness as its own affordance (separate from health).** The badge now has
      THREE states (amber conflict / neutral "…" in-progress / earned green ✓ when every
      day is planned) so a half-empty trip no longer claims "all set". Richer follow-ups
      the panel proposed: a quiet "N of M days planned" progress meter / ring next to the
      badge, and turning each empty day's "nothing planned" state into an INVITING
      "Day 2 is open · Add something" CTA (Wanderlog/Furkot pattern — completeness lives
      on the day, not the alarm badge). — `ItineraryScreen.js`
- [ ] **Calm-on-arrival (option #7).** Don't even compute-and-show the pill on a fresh
      AI/sample trip until the user engages (edits/taps). Safe now that #1 distinguishes
      conflict from tip. — `ItineraryScreen.js`
- [ ] **A11y polish (a11y consult).** Add a single `accessibilityLiveRegion`/
      `announceForAccessibility` summary (fired only on count change, not every render);
      let the day pill wrap under Dynamic Type (drop `numberOfLines={1}` / raise the tap
      target to 44pt); verify severity icon strokes hit WCAG 1.4.11 (3:1). — `ItineraryScreen.js`
- [ ] **Remove dead code.** `SEV_CHIP` + `dayWarnChip`/`dayWarnings` styles are now
      unused after the pill replaced the chip row. — `ItineraryScreen.js`

## Manual Add Activity — overwhelm (gate fixed, form still long)

A test user forgot the NAME and the top-right "Add" button stayed greyed with no
explanation (it's off-screen when scrolled — the textbook disabled-button trap). Two
agents (forms-UX + first-time-user) both said: stop disabling submit, auto-name like
Calendar/Reminders/Things. Shipped: NAME is now optional (defaults from the type +
place/time, e.g. "Drive · 09:00"), the button never disables, and tapping a TYPE tile
prefills an editable name. The broader "form is overwhelming" is NOT yet addressed:

- [ ] **Progressive disclosure on Add Activity.** Collapse the long form (TYPE, NAME,
      ADDRESS, DAY, WHEN, TIME, DURATION, COST, +Details/Notes/Reminder) to the essentials
      first with an "Add details" expander (extend the existing `showMore` pattern upward).
      Both reviewers stressed: KEEP the per-family COST field visible — it's the moat —
      collapse only ADDRESS / DURATION / MEAL / Notes. — `AddActivityModal.js`

## "✨ Plan my day" — shipped MVP, tray follow-up

A non-planner overloaded a day and kept tapping "Arrange"; it re-flagged the same
issues every tap (an unconditional alert on residual warnings) → felt like a loop.
Replaced "Arrange" with one-tap **"✨ Plan my day"** (`planDay()` in autoArrange.js):
deterministic, day-scoped, CONVERGENT (re-tapping a planned day → calm "already
arranged", never the same prompt — gated on `changed`), with honest triage
(`overflow` beyond pace cap, `unresolved` dark-day/permanent closures; seasonal stays
a soft tip; nothing dropped/auto-moved). One-time gentle education on first use
(`planDayNoteSeen`). Shown on empty days too. 4 unit tests incl. the fixed-point.

- [ ] **"Didn't fit today" tray.** Today overflow/unresolved items stay ON the day
      (flagged) and are only *reported*. Add a real tray that parks them with a one-tap
      "Move to Day N" (reuse `autoArrange.bestDayFor`) + "Keep anyway". Needs a small
      schema slot for trayed items (version bump). — `ItineraryScreen.js` / `store`

## Open/closed reliability + seasonal hours — shipped MVP, Phase-2 follow-ups

The weekly opening-hours we cache are a snapshot of the season we fetched in, so a
hard "🔴 Closed" on a future/seasonal date is often a *false* alarm (a false "closed"
is the worst error — it deletes a place that's actually open). Shipped (panel-backed):
`closed_venue` now confidence-tiered — dark-weekday non-seasonal = red error, open-but-
outside-window = amber, **seasonal-prone venue (SEASONAL_RE) = soft "🗓️ Verify hours for
your dates" tip**; every flag carries a **"Check current hours" tap-through** to the live
listing; added `businessStatus` (CLOSED_PERMANENTLY = red, CLOSED_TEMPORARILY = warning).

- [ ] **Re-check hours when the trip is near** (≤7–14 days): fetch `currentOpeningHours`
      (Google's next-7-days incl. special days) + store `placeId` + a "hours checked on"
      date, then tighten flags back up because the data is in-season. — Phase 2 (needs a
      refresh trigger; placeId not stored yet).
- [ ] **Gemini seasonal verdict** ("is X open in <month>?") → a coarse "open May–Sep"
      that resolves the seasonal "verify" tips. Backend-only; feed the SOFT tip, never a
      red error (hallucination risk). — Phase 2.
- [ ] **Proactive seasonal verify even when shown open.** Today we only soften the
      *closed* case; a seasonal venue that the snapshot shows OPEN on an out-of-season date
      is a silent false "open". Consider a gentle per-seasonal-venue "verify for your dates"
      regardless of open/closed. — needs care not to nag.
- [ ] **`hoursFetchedMonth` for cross-season precision.** Persist the fetch month so the
      tip can fire specifically when trip-month ≠ fetch-month (additive field; default→soft). — `DiscoverModal.js`

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
