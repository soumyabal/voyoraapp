# Voyara — Intelligent Travel Planner: Skills, Rules & Checks

> **What this is.** The canonical reference for Voyara's *planning intelligence* — every
> business rule, check, and "smart" behaviour that makes the app feel like an expert
> trip planner rather than a blank calendar. This is the north star: the direction is
> a deterministic, explainable **rule-engine** that PLACES things well and CHECKS them
> honestly, with the LLM used only for synthesis, never as the source of truth.
>
> Last updated: June 2026. Living document — add a row here whenever a rule is added.

---

## 1. Philosophy — what "intelligent" means here

1. **Deterministic & explainable, not a black box.** Every placement and every warning
   comes from a rule with a stated reason the user can read ("open 9 AM–5 PM, you're
   scheduled at 6 PM"). No "the AI said so."
2. **One engine PLACES, the same engine CHECKS.** Auto-arrange (`scheduleDay`) and Trip
   Check (`validateTrip`) share the same duration model, windows, and distance math, so
   an arranged day already *clears* the checks instead of tripping them. They can never
   disagree.
3. **Safe fallibility.** Rules guess; users correct. Drafts are previewed, actions are
   undoable, and a reset always exists. A wrong guess never mangles the real plan.
4. **Free engines first.** Haversine distance, opening-hours math, and heuristics cost
   nothing and run offline. Paid APIs (Places, future Routes) are used only where they
   add real signal, and always degrade gracefully to the free path.
5. **Intent is input, never inferred.** When the user pins a meal, a day, or a stay, the
   engine obeys — it only *fills the gaps*.

---

## 2. Engine map (where the intelligence lives)

| Module | Role |
|---|---|
| `src/utils/tripValidator.js` | **Trip Check** — all day-level + trip-level validation rules; `estimateDuration`; `lodgingForNight` |
| `src/utils/autoArrange.js` | **Auto-arrange** — `scheduleDay` (per-day re-timer) + `autoArrange` (basket→draft) |
| `src/utils/geo.js` | **Distance & travel** — haversine + walk/drive travel-time model |
| `src/utils/hours.js` | **Opening hours** — weekday, is-open-at, human label |
| `src/utils/expenses.js` | **Per-family split (the moat)** — costed activity → Splitwise expense |
| `src/utils/slots.js` | Time-of-day slots + smart suggested times |
| `src/modals/DiscoverModal.js` | **Discover intelligence** — search, map heat-zoom, added/seen states, nearby |

Detailed companion docs: [`trip-check-rules.md`](trip-check-rules.md), [`lodging-model.md`](lodging-model.md),
[`day-by-day-planning.md`](day-by-day-planning.md), [`design-rules-and-planning.md`](design-rules-and-planning.md).

---

## 3. Skill: Trip Check (the validator)

`validateTrip(trip)` returns warnings with severity `error | warning | info`. Each carries an
icon, a plain-English message, a fix hint, and the affected activity ids (so the UI can offer
a one-tap fix). Rules run per-day, then trip-wide.

### Per-day rules

| # | Type | Sev | What it catches |
|---|------|-----|-----------------|
| 1 | `overlap` | error ≥90 min · else warning | Next activity starts before the previous one's *estimated* end (duration-based) |
| 1b | `travel_time` | error ≥20 min short · else warning | **Distance-aware**: two located stops are too far apart for the gap between them (free haversine estimate). Pure time overlaps stay with rule 1; transport legs between stops count as the travel |
| 2 | `full_day_conflict` | error | A ≥6 h "full-day" venue (theme park, etc.) sharing the day with ≥2 other substantial activities |
| 3 | `packed` | warning | ≥8 substantial activities in one day |
| 4 | `no_meal` | info | A ≥4 h day with ≥3 activities and no food stop |
| 5 | `past_midnight` | info | Last activity's estimated end crosses midnight |
| 6 | `early_start` | info | Non-transport activity before 6 AM |
| 8 | `multi_day_journey` | info | Transport whose `arriveTime` is earlier than departure → crosses midnight |
| 9 | `wake_time` | warning (late fams <9 AM) · info (regular <7 AM) | Activity scheduled before a family's wake window |
| 10 | `dietary_conflict` | warning | Food name implies meat/seafood vs a vegetarian/vegan family, or alcohol vs a no-alcohol family |
| 11 | `duplicate_activity` | warning | Same place added more than once on a day |
| 12 | `multi_city_day` | warning | Activities tagged with ≥2 different cities on one day |
| 13 | `closed_venue` | warning | **Hours-aware**: an attraction/restaurant scheduled while it's closed (its opening hours don't cover the time) |

### Trip-level rules

| Type | Sev | What it catches |
|---|-----|-----------------|
| `empty_day` | warning (interior) · info (first/last) | A day with nothing planned |
| `notes_only_day` | info | Notes but no real activities/transport |
| `unbooked_night` | warning | **Lodging gap**: an interior night with no accommodation (only when the trip uses hotels and isn't home-based) |
| `lastday_missing_checkout` | info | Last day has activities but no check-out / way home |
| `long_journey_conflict` | error | A ≥6 h transport leg sharing the day with other activities (each gets a "move to Day N" suggestion) |

> **Duration model.** `estimateDuration(activity)` is keyword-driven from industry tourism
> data (theme parks 6–8 h, museums 1.5–4 h, meals 45 min–2.5 h, transport by subtype +
> airport buffer). A manual `durationMins` always wins. This single function feeds both the
> checks and the arranger.

---

## 4. Skill: Auto-arrange (`scheduleDay`)

Re-times and re-orders one day's activities using a **per-type window model** + proximity
ordering. Pure function: returns sorted copies, never mutates, preserves notes/skipped.

**Anchored windows (minutes-of-day):**

| Type | Window | Notes |
|---|---|---|
| Hotel check-in | ~16:00 | Late afternoon — never morning. Day-1 arrival lands here |
| Hotel check-out | ~10:00 | On the departure day only |
| Breakfast | ~08:00 | |
| Lunch | ~12:30 | |
| Dinner | ~19:00 | |
| Nightlife / shows | ~20:30 | bars, concerts, theatre, casino |
| Sunrise | ~06:00 | sunrise activities by name |
| Sunset / viewpoint | ~18:30 | |
| Transport with a set time | anchors the day | departures/arrivals fixed |
| Everything else | flows from 09:00 | nearest-neighbour around the day's hotel |

**Hours-aware placement.** A daytime stop is never placed before it opens (or after it
closes): the slot search is bounded to the venue's open interval for that weekday, so a
10 AM–7 PM spot lands at 10:00, not 09:00 — and re-arranging keeps it there. Unknown hours
flow freely; closed-all-day falls back (the `closed_venue` check still flags it).

**Travel-aware spacing.** The gap after each daytime stop is the *estimated travel time* to
the next one (`geo.travelLeg`), so an arranged day already clears the `travel_time` rule
instead of tripping it. No coords → a plain 15-min buffer.

**After arranging, it re-checks.** The day view runs `validateTrip` on the arranged day and
prompts: *fix now · keep planning (fix later) · undo*. Same engine, honest feedback.

---

## 5. Skill: Meal intelligence

1. **Hours-of-operation assignment.** Each restaurant is slotted into a meal it is *actually
   open for* (breakfast/lunch/dinner windows checked against its hours for that weekday). A
   dinner-only steakhouse never lands at lunch; a 7 AM–2 PM cafe is a breakfast/lunch
   candidate. Among open candidates, the least-filled meal wins so two restaurants don't both
   pile onto dinner. Unknown hours → classic lunch-first-then-dinner.
2. **User pin wins.** An explicit `meal` (Auto · Breakfast · Lunch · Dinner picker in Add
   Activity) overrides the hours guess. "Same place for lunch *and* dinner" is allowed.
3. **Eat at the hotel (in-room dining).** For tired/unwell days, one-tap chips add
   *Breakfast/Lunch/Dinner at {hotel}* (free, in-room): breakfast uses last night's hotel
   (where you woke), lunch/dinner use tonight's hotel (where you sleep).

---

## 6. Skill: Distance & travel awareness

`geo.js` — the free engine. `travelLeg(a, b)` → `{ km, min, mode }`:

- Straight-line haversine × **1.3 road-detour** factor.
- ≤ 1 km → **walk** at 4.8 km/h; beyond → **drive** at 26 km/h (urban, door-to-door).
- Returns `null` when either stop lacks coordinates → callers fall back to a buffer.

Surfaces:
- Feeds the `travel_time` Trip Check rule and the travel-aware spacing in `scheduleDay`.
- **Inline leg connectors** between itinerary cards ("🚗 12 min · 4.2 km"), turning red with
  "only N min gap" / "overlaps" when there isn't time to travel — *the same call the rule
  makes, so the cue and the warning always agree*. Legs bridge across time-of-day sections.

> Phase 2: swap `travelLeg` for a real routing call (OSRM / Google Routes) without touching
> callers — same shape in, same shape out.

---

## 7. Skill: Opening hours

`hours.js` — `weekdayOf(date)`, `isOpenAt(openHours, wd, minute)`, `hoursLabel(openHours, wd)`.
Operates on a compact `openHours: [{ d, o, c }]` (weekday, open/close minutes) captured from
Google Places. `null` = unknown → stay silent rather than guess.

- **On activity cards & Discover cards:** a `🕒 9 AM–5 PM` badge for the relevant day; red
  `🕒 Closed` when shut that day; red badge when scheduled outside hours.
- **In Trip Check:** the `closed_venue` rule.

---

## 8. Skill: Lodging intelligence

`lodgingForNight(trip, dayIndex)` derives where the group sleeps each night from a **single**
check-in `stay` (carrying `nights`) — never duplicated per night, so the booking cost can't
double-bill. Returns the covering stay (with night number / is-check-in / is-last-night),
an `overnightTransit` (red-eye/sleeper → no hotel that night), or `null` (unbooked / home).

Drives: the per-day lodging footer ("Night 2 of 3 · Hotel"), the `unbooked_night` and
`lastday_missing_checkout` checks, and which hotel the in-room dining chips use.

---

## 9. Skill: Per-family budget split — **the moat**

`expenses.js` turns costed activities into per-family Splitwise expenses. The differentiator
no competitor has: **accommodation splits by rooms × nights, transit/meals/activities by
member count** — not a shared average. Invariants (never break):

- `participatingFamilies` is the source of truth for splitting.
- `estimatedAmount` is frozen at creation; only `amount` updates.
- `costPerPerson` is always per-person; all math multiplies by member count.
- At least one family must always participate.

---

## 10. Skill: Discover intelligence

| Behaviour | Rule |
|---|---|
| **Sort** | Results ranked by rating (and footfall via `userRatingCount`) — best first |
| **Map heat-zoom** | Fit to the **dense core**, not outliers: centre on the median point, fit the nearest ~75% within a ~15-mile cap, max zoom 16. A few far-flung results can't blow the view out to a county-wide blob |
| **Three states** | **Available** = colour pin + rating · **Seen on web** = grey + rating · **Added to plan** = grey + rating + ✓. Greying what's handled fades a busy map to just the options still worth a look |
| **Added = live** | "Added" is derived live from the trip's activities (by name), so it's always correct and reactive — never a stale snapshot |
| **Seen = persisted** | Opening a place's website marks it *seen*, stored per-trip (survives app restarts); a "↺ reset N seen" control clears it |
| **Toggle** | The ✓ is a real toggle — tap to add, tap again to remove from the plan (and its linked expense) |
| **Open on web** | A web button (🏨 for stays) opens the place's site to check rooms/menus/tickets |
| **Explore nearby** | From an activity's details, "🧭 Explore nearby places" opens Discover's map **centred on that stop** (a ★ anchor in the middle, zoomed to street level) biased ~5 mi around it, with a "Near {place} · Show all" banner |
| **Hours** | Each card shows its opening hours for the day being planned (red when closed) |
| **Per-day scope** | Discover is scoped to the day you're adding to; costs auto-flow into the per-family split |
| **Caching** | Session-wide Places cache (30-min TTL + in-flight dedupe) so day-by-day planning doesn't re-bill the same search; "See" paginates to ~60 results |

---

## 11. Invariants & conventions (carry-over from AGENTS.md)

- `participatingFamilies` is the split source of truth; `estimatedAmount` frozen;
  `costPerPerson` per-person; at-least-one-family.
- `trip.days[]` is not regenerated when dates change (destructive-change guard).
- Always use `effectiveMember(member, travelers)` — never read `tripMember.dietary` directly.
- Agents/rule modules are **pure functions** — no store access, no side effects.
- Theme tokens only (no hardcoded hex/px); no SVG; KeyboardAvoidingView for input modals.

---

## 12. Decisions log (from the June 2026 working sessions)

- **Same engine for arrange + check.** Auto-arrange re-runs Trip Check and prompts fix-now /
  later / undo. Non-negotiable: the placer and the checker share `estimateDuration` + windows.
- **Distance is a first-class check**, not just a display. "Far apart *and* the next starts
  too soon" is a real conflict the clock alone misses.
- **Hours drive meals and a closed-venue check**, captured free from Places.
- **Reset everywhere.** Per-day and all-days plan reset with undo; reset-seen for browsing.
- **Map must zoom to the heat**, never a county-wide view that hides the cluster.
- **Everything reversible:** swipe-delete, arrange, reset, add/remove all carry undo or a toggle.
- **Free-first:** haversine before routing APIs; degrade gracefully on missing data.

---

## 13. Testing posture & gap (known)

- **Well-covered:** the pure rule layer — `geo`, `hours`, `tripValidator` (travel-time,
  closed-venue), `autoArrange` (`scheduleDay` meal/window logic), `expenses`, `lodging`.
  These tests pin real behaviour and have caught regressions.
- **Gap:** the **component/state layer** (`DiscoverModal`, `ItineraryScreen`) has no automated
  tests, and the WebView/Leaflet map graying is effectively un-unit-testable. Every bug found
  by manual/on-device review this session lived in *this* layer (added-state wiping, dead
  toggle button, fit-token race).
- **Plan:** (1) extract Discover's added/seen/toggle logic into a pure, tested helper;
  (2) adopt the **product-tester** agent as a pre-commit habit for UI changes; (3) add React
  Native Testing Library only if Discover keeps churning.

---

## 14. Roadmap — future skills

| # | Skill | Why |
|---|-------|-----|
| 1 | **Real routing** (OSRM / Google Routes) behind `travelLeg` | Real drive/transit times vs haversine estimate |
| 2 | **Opening-hours-aware *ordering*** | Visit the place that closes first, first |
| 3 | **Weather-aware suggestions** | Indoor on rainy days, outdoor on clear |
| 4 | **Pace budgeting per day** | Active-hours ceiling tuned to relaxed/moderate/packed |
| 5 | **Group-fit scoring** | Rank Discover results by accessibility + age + dietary fit |
| 6 | **Closed-venue auto-fix** | Offer the nearest open alternative or a time that works |
| 7 | **Multi-city sequencing** | Order days so inter-city hops are minimised |
| 8 | **Gemini destination intelligence** | Replace mock activity DB with live "what's worth doing" |
| 9 | **LangGraph backend** | Streaming, resumable, server-side rule pipeline (keys off device) |

---

*Voyara · Intelligent Travel Planner · Skills, Rules & Checks · the planning engine's source of truth.*
