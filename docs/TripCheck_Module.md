# Trip Check Module

> **Living document.** Updated every session. Reflects current implementation as of 1 Jun 2026.

---

## Overview

Trip Check is Voyara's schedule validation engine. It analyses a trip's day-by-day itinerary and surfaces conflicts, warnings, and suggestions the planner may have missed. It runs on demand (user taps the Check Trip FAB) and also powers the FAB's colour/badge in ItineraryScreen.

**Entry points:**
- `src/utils/tripValidator.js` — pure validation logic, no UI
- `src/modals/TripValidationModal.js` — full-screen modal displaying results

**How it's triggered:**
- `validateTrip(trip)` called in ItineraryScreen FAB (live badge) and TripValidationModal (full results)
- FAB colour: 🔴 red = errors, 🟠 amber = warnings, 🔵 blue = info only, ✅ green = all clear

---

## Files

| File | Role |
|------|------|
| `src/utils/tripValidator.js` | All rules, duration estimation, warning data model |
| `src/modals/TripValidationModal.js` | Display, filter chips, Ignore, Apply Fix, per-activity actions |
| `src/screens/ItineraryScreen.js` | Hosts Check Trip FAB, passes `onCheckTrip` + `onNavigate` callbacks |

---

## Warning Data Model

Each warning object returned by `validateTrip`:

```js
{
  type:     string,          // rule identifier (e.g. 'overlap', 'long_journey_conflict')
  severity: 'error' | 'warning' | 'info',
  icon:     string,          // emoji shown on card
  title:    string,          // short heading
  message:  string,          // full explanation
  hint:     string,          // suggested action (shown as 💡 text)
  dayIndex: number | null,   // which day the warning applies to

  // Overlap warnings only
  suggestedTime:  string,    // HH:MM to move conflicting activity to
  moveActId:      string,    // activity ID to move
  moveActName:    string,    // activity name (for display)

  // Multi-activity warnings (overlap + long_journey_conflict)
  impactedActivities: [
    {
      id:                string,
      name:              string,
      time:              string,       // current time on card
      suggestedTime:     string|null,  // for overlap — new HH:MM
      suggestedDayIndex: number|null,  // for journey — day index to move to
      suggestedDayLabel: string|null,  // for journey — "Day 3" label
    }
  ],

  actIds: string[],          // all activity IDs involved (for highlighting)
}
```

---

## Validation Rules

### Day-level rules (run per day in `validateDay`)

Rules fire per-day. `validateDay(day, dayIndex, families[])` receives the trip's families array so dietary and wake-time rules can reference group profile data.

---

#### Rule 1 — Schedule Overlap
**Severity:** error (≥ 90 min overlap) / warning (< 90 min)
**Trigger:** Activity B starts before estimated end of Activity A.
**Duration source:** `estimateDuration(act)` — uses `act.durationMins` if manually set, otherwise keyword-based estimate.
**Data attached:** `suggestedTime`, `moveActId`, `moveActName`, `impactedActivities[0]`
**Fix in modal:** `→ Move to HH:MM` button calls `updateActivity(tripId, moveActId, { time: suggestedTime })`

---

#### Rule 2 — Full-Day Venue
**Severity:** warning
**Trigger:** Non-transport activity with estimated duration ≥ 6h (theme parks, safaris, etc.) AND 2+ other non-note/non-food activities on the same day.
**Note:** Transport activities are explicitly excluded — long flights are handled by the trip-level `long_journey_conflict` rule.

---

#### Rule 3 — Overpacked Day
**Severity:** warning
**Trigger:** 8+ non-note, non-stay activities in a single day.

---

#### Rule 4 — No Meal on Long Day
**Severity:** info
**Trigger:** Day spans ≥ 4h, has ≥ 3 activities, and no food activity.

---

#### Rule 5 — Runs Past Midnight
**Severity:** info
**Trigger:** Last activity + estimated duration extends past 24:00.

---

#### Rule 6 — Very Early Start
**Severity:** info
**Trigger:** First non-transport activity starts before 06:00.

---

#### Rule 8 — Overnight Journey
**Severity:** info
**Trigger:** Transport activity has `arriveTime` set AND `arriveTime < time` (i.e. departure is later in the clock than arrival — crosses midnight).
**Fix in modal:** "Jump to Day X →" — navigate to the day to add an arrival activity.

---

#### Rule 9 — Wake Time Conflict
**Severity:** warning (late families before 9am) / info (regular families before 7am)
**Trigger:** Non-transport activity starts too early for families whose `wakeTime` is `'late'` or `'regular'`.
- `late` families: flag anything before 09:00
- `regular` families: flag anything before 07:00
- `early` families: no restriction

---

#### Rule 10 — Dietary Conflict
**Severity:** warning
**Trigger:** Food activity name/detail contains meat or alcohol keywords AND group has vegetarian/vegan/no-alcohol families.
- `MEAT_RE`: beef, pork, lamb, chicken, mutton, fish, prawn, shrimp, seafood, lobster, crab, sashimi, sushi, steak, burger, bbq, barbecue, bacon, ham, meat, non-veg
- `ALCO_RE`: beer, wine, cocktail, whisky, whiskey, vodka, rum, gin, spirits, alcohol, brewery, pub, bar, tavern, champagne, prosecco, sake

---

### Trip-level rules (run in `validateTrip` with access to full `trip.days[]`)

---

#### Trip Rule A — Empty / Notes-Only Day
**Severity:** warning (middle days) / info (first/last day)
**Trigger:** Day has no activities, or has only note-type activities.
**Extra context:** On trips ≥ 7 days, message notes this is a common AI planner miss.

---

#### Trip Rule B — Long Journey Conflict *(new — 1 Jun 2026)*
**Severity:** warning
**Trigger:** Transport activity with estimated duration ≥ 6h AND other non-note activities exist on the same day.
**Rationale:** A 20h flight cannot be combined with sightseeing. This replaces the old Rule 2 "full-day venue" warning which was incorrectly firing for flights.
**Data attached:** `impactedActivities[]` — each affected activity with `suggestedDayIndex` pointing to the next day (or previous if on the last day).
**Fix in modal:** Per-activity `→ Day N` buttons call `moveActivity(tripId, fromDay, toDay, actId)`.

---

## Duration Estimation

`estimateDuration(activity)` in `tripValidator.js`:

1. **Manual override first** — if `activity.durationMins > 0`, that value is used as-is. Set in AddActivityModal.
2. **Keyword matching** — name + detail fields are scanned against a rule table (ordered most-specific to least).
3. **Type defaults** — transport subtypes have fixed defaults:

| Subtype | Default |
|---------|---------|
| flight  | 180 min (3h incl. airport buffer) |
| car     | 120 min |
| train   | 90 min |
| ship    | 240 min |
| pitstop | 15 min |

> For long-haul flights (14h, 20h, etc.) the user must set duration manually in Add/Edit Activity. The DURATION picker is shown on all activity types.

---

## TripValidationModal UI

### Severity filter chips
- Summary row shows 🔴 / 🟠 / 🔵 pills with counts.
- **Tappable** — tap a pill to filter the list to that severity only. Active pill shows `✕`. Tap again to clear.
- Counts always reflect the full unfiltered set.

### Warning cards
Each card shows: icon + title + message + 💡 hint.

**Footer actions:**
| Warning type | Left | Right |
|---|---|---|
| Overlap (has `impactedActivities`) | Ignore | Jump to Day X → |
| Long journey (has `impactedActivities`) | Ignore | Jump to Day X → |
| All others | Ignore | Jump to Day X → |

**Impacted activities list** (shown when `impactedActivities.length > 0`):
- Rendered between hint and footer as a bordered list.
- Each row: `[time]  [activity name]  [→ HH:MM or → Day N button]`
- Tapping a fix button calls `updateActivity` (time change) or `moveActivity` (day change).

### Ignore
- Per-trip. Stored in `trip.ignoredWarnings[]` as `"type:dayIndex"` keys.
- Ignored count shown at bottom as "N warnings hidden · Reset →".
- `handleApplyFix` also calls `handleIgnore` so fixed overlaps don't re-appear.

---

## Known Limitations

| # | Issue | Status |
|---|-------|--------|
| 1 | Rule 2 (full-day venue) only fires when 2+ other activities exist — a single conflicting activity is missed | Low priority |
| 2 | Dietary conflict (Rule 10) is keyword-based — may miss menu items not in the name field | By design — conservative to avoid false positives |
| 3 | Wake time rule (Rule 9) fires per-activity — if a day has 3 early activities, 3 separate warnings appear | Low priority |
| 4 | Long journey rule doesn't deduplicate when a day has two long transport legs | Edge case — rare |

---

## Changelog

### 1 Jun 2026 — Session 1

**Initial implementation**
- `validateTrip` / `validateDay` / `groupWarningsByDay` / `summariseWarnings` — core structure
- Rules 1–7 (overlap, full-day venue, packed day, no meal, past midnight, early start, empty day)
- `estimateDuration` — keyword-based estimates for 40+ activity types
- `TripValidationModal` — warning cards grouped by day, Ignore per trip, Jump to Day navigation

---

### 1 Jun 2026 — Session 2

**Wake time + dietary rules**
- Rule 9: wake time conflict — flags early activities for `late`/`regular` families using group profile data
- Rule 10: dietary conflict — `MEAT_RE` / `ALCO_RE` patterns vs family `dietary[]` array
- `validateDay` now accepts `families[]` parameter; `validateTrip` passes `trip.families`

**Per-day PDF export**
- `exportDayAsPDF` in `exportPlan.js` — triggered from ⓘ detail sheet

---

### 1 Jun 2026 — Session 3

**Overnight journey detection**
- Rule 8: `arriveTime < time` on transport activities → "Overnight journey" info warning
- `arriveTime` field added to transport activities in `AddActivityModal` (DEPARTS/ARRIVES pickers)

**Manual duration override**
- `estimateDuration` checks `activity.durationMins` first before keyword matching
- Duration picker added to `AddActivityModal` for all activity types — presets up to 48h
- Pitstop subtype defaults to 15 min

---

### 1 Jun 2026 — Session 4

**Severity filter chips**
- Summary pills in `TripValidationModal` are now tappable — filter list to one severity
- `activeFilter` state with toggle behaviour

**Overlap fix button**
- `suggestedTime`, `moveActId`, `moveActName` added to overlap warning objects
- `impactedActivities[]` attached to overlap warnings
- Modal: `→ Move to HH:MM` button calls `updateActivity`; also ignores the warning

**Long journey rule (replaces Rule 2 for transport)**
- Rule 2 now excludes transport activities
- New trip-level rule `long_journey_conflict`: fires when transport ≥ 6h has other activities on the same day
- `impactedActivities[]` with `suggestedDayIndex` / `suggestedDayLabel` per affected activity
- Modal: per-activity `→ Day N` buttons call `moveActivity`

---

*Trip Check Module · Voyara · Started 1 Jun 2026*
