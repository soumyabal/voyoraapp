# Timezone Model — Design (proposed)

> Status: **DESIGN ONLY — not implemented.** Written 2026-06-07 at the owner's request before
> any code. Decides how Voyara handles trips that cross timezones (a 3pm flight that lands "5
> hours later" in another zone) and how every time is stored + displayed. Supersedes the single
> line in `geo.js` ("Timezone handling is deferred").

---

## 1. The core decision: floating wall-time, not absolute instants

The owner's first instinct was the textbook DB pattern: **store UTC + a timezone delta, show the
local time in the UI.** That's exactly right for *absolute instants* — a single moment that every
observer agrees on (a flight's wheels-up). But a travel itinerary is mostly **not** made of
instants, and treating it as such is the classic calendar bug:

> "Dinner at 7:00 PM" means 7 PM **wherever you are standing**. If we store it as a UTC instant
> and the phone's timezone changes (you land in a new zone, or you plan from home for a trip
> abroad), a UTC-backed time *visibly shifts* — your 7 PM dinner becomes 10 PM. That is wrong.

So the model splits times into two kinds:

| Kind | Examples | Stored as | Shifts if device tz changes? |
|---|---|---|---|
| **Floating / wall-clock** | activity `time` (sights, meals, check-in) | local `HH:MM` + the **place's** IANA tz | **No** (correct) |
| **Absolute instant** | flight/train/ferry **departure & arrival** | derived UTC from `(date, wall, tz)` at each endpoint | the *label* changes zone, the moment doesn't |

Almost everything in `trip.days[].activities[]` is **floating**. Only **travel legs that cross
zones** are genuine instants, and even those we *store* as wall-time-per-endpoint and *derive*
the UTC/duration — see §3.

### Why IANA tz name, not a numeric delta

Store `'America/Los_Angeles'`, **never** `-420` (minutes) or `'UTC-7'`:

- A numeric delta is only valid **on one date**. `America/New_York` is −5h in January and −4h in
  July (DST). A delta captured in July is wrong in November. An IANA name encodes the *rules*, so
  the correct offset for any date is derived on demand.
- `(wall-time, date, IANA-tz) → UTC` is always computable and lossless. The reverse
  (`UTC + frozen delta → original wall intent`) loses information across a DST boundary.
- We can usually **infer** the IANA tz for free from data we already hold (destination string or a
  stop's `lat`/`lng`) — see §5.

The delta is then a **derived display value** (`PDT`, `GMT+8`), never the source of truth.

---

## 2. What's true in the code today (the starting point)

- `activity.time` is a naive `'HH:MM'` wall-clock **string** with no date and no zone
  ([slots.js](../src/utils/slots.js) `timeToMin`/`minToTime` are the only parsers).
- `trip.startDate` / `endDate` and `day.date` are `'YYYY-MM-DD'` **date-only** strings.
- Date math is *already* DST/zone-careful in the right places:
  `helpers.fmt` parses `new Date(dateStr + 'T00:00:00')` (local midnight, avoids the
  `new Date('YYYY-MM-DD')`-is-UTC off-by-one), and `daysBetweenISO` uses `new Date(y, m-1, d)`
  (local). **Any tz work must preserve this discipline** and audit every other `new Date(...)`
  call (`grep` found ~376 date touch-points across 61 files — most are date-only and fine; the
  audit is to confirm none silently parse a bare ISO date as UTC).
- The persisted store is at **`version: 5`** ([store/index.js](../src/store/index.js)). Any schema
  change here is an Invariant-#7 event: **bump to `version: 6` + add a migrate case**, and
  **never** change the persist `name` `'voyara-storage'` (that wipes every user's trips). The
  `store.test.js` shape guard will go red until the bump is done.
- The whole app is **local-only / no backend** (Phase 1). So "store in DB as UTC" becomes "store
  in AsyncStorage"; the *model* is what matters now, the server move is Phase 2.

---

## 3. Proposed schema (store v5 → v6)

Additive and read-time-defaulted, so **no data backfill** is required and old trips keep working.

### Trip / Day
```js
// Trip — gains a home + default zone
{
  ...,
  homeTz:    'America/Chicago' | null,   // traveler's home zone (for "now" + pre-trip planning)
  defaultTz: 'America/Los_Angeles',      // the destination's zone; the fallback for every day
}

// Day — gains its own zone (a day can differ from the trip default on a move day)
{
  ...,
  tz: 'America/New_York' | undefined,    // absent → inherit trip.defaultTz
}
```

### Activity (floating — unchanged on disk, reinterpreted)
```js
{
  ...,
  time: '19:00',     // STILL a wall-clock string. Interpreted in the day's tz. No change.
  // (no per-activity tz — it inherits its day. A stop is where its day is.)
}
```

### Travel leg (the only instant-aware shape)
A transport activity that crosses zones carries both endpoints' wall-times **and** zones, so we can
show "lands 2:00 PM EDT" and compute true duration / red-eye correctly:
```js
{
  type: 'transport',
  time: '09:00',                 // departure wall-time, in fromTz
  fromTz: 'America/Los_Angeles',
  toTz:   'America/New_York',
  arriveTime: '17:00',           // arrival wall-time, in toTz (optional; if known)
  arriveDayOffset: 0,            // +1 if it lands the next calendar day (red-eye)
  // derived, never stored: depart_utc, arrive_utc, true_minutes
}
```
> **Invariant:** the **stored** values stay wall-clock-per-endpoint. UTC and duration are *always
> derived* via the tz engine (§4), never frozen — so DST and edits can't rot them. This mirrors how
> `estimatedAmount` is frozen but `amount` is derived in the expense model: pick one source of
> truth and compute the rest.

### Migration v5 → v6
Pure backfill, no behavior change:
- `trip.defaultTz` ← inferred from destination/first-stop coords (§5); `null` if unknowable
  (then UI falls back to device-local, today's behavior).
- `trip.homeTz` ← device tz at migration time (best guess; user-editable).
- `day.tz`, leg `fromTz`/`toTz` ← left `undefined` (inherit). Existing single-zone trips render
  **identically** to today.

---

## 4. The gating unknown — Hermes `Intl` (spike BEFORE building)

Everything above needs one capability: **convert `(wall-time, date, IANA-tz) ↔ UTC` on-device.**
The clean way is `Intl.DateTimeFormat(..., { timeZone })`. Whether that works in **Expo Go's
Hermes** (SDK 54) is the **single fact that decides library-vs-pure-JS**, and I will **not assume
it** — it gets spiked first:

```js
// The probe (jest + an on-device log). PASS → pure JS, no new dep.
const f = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', timeZoneName: 'short', hour: '2-digit', minute: '2-digit',
});
// Expect: a formatted string carrying "EST"/"EDT", and a different offset in Jan vs Jul.
```

- **Probe PASS** → implement the tz engine in **pure JS** on top of `Intl` (a thin
  `utils/tz.js`: `zonedToUtc`, `utcToZoned`, `tzAbbr`, `offsetMinutes`). No new package → no EAS
  concern. Preferred.
- **Probe FAIL / partial** → need a library. `luxon` and `date-fns-tz` are **pure-JS** (Expo-Go
  safe, no native build) **but they still lean on `Intl` for zone data** — so if Hermes lacks the
  zone data entirely, the real fallback is a tz-data package (`@formatjs/intl-*` polyfill, which
  Expo already pulls for some Intl features). This path adds an `npm install` → **flag to owner
  before adding** (per AGENTS.md package rule).

> Owner-relevant: this spike is **cheap, safe, and reversible** — a jest test + one device log
> line, zero schema change. It's the right "first real step" even though the owner chose
> "design doc first" — the doc *names* it as step 1 of implementation.

---

## 5. Inferring the timezone (so the user rarely types one)

Priority order, first hit wins:
1. **Stop coordinates** — we already store `lat`/`lng` on located activities. A lat/lng → IANA tz
   lookup gives the day's zone for free. Options: a tiny offline `tz-lookup`/`tzlookup` table
   (pure JS, ~bundle cost — evaluate), or Google's **Time Zone API** (has a per-call cost; we
   already use Google Places, but this adds a billed surface — prefer offline).
2. **Destination geocode** — `places.geocodeAddress` already returns coords for the destination;
   feed (1).
3. **Manual** — a small "Timezone" control on Edit Trip / the Day chip for the rare unknowable
   case or an override (camping with no Places hit).
4. **Fallback** — `defaultTz = null` → render in **device-local** time exactly as today. The
   feature degrades to current behavior, never breaks.

---

## 6. UI surface

- **Show the zone whenever it differs** from the day before (or from home, pre-trip): `7:00 PM
  PDT`. Same-zone consecutive days don't repeat the badge — quiet by default, explicit only at the
  seams (mirrors the soft time-of-day dividers in the new timeline layout).
- **Travel legs**: "Depart 9:00 AM PDT → Land 5:00 PM EDT · 5h" and a **+1 day** / 🌙 red-eye
  marker when `arriveDayOffset > 0`.
- **Multi-zone day badge**: when a single day spans two zones (the flight day), the day header
  notes it — this already has a precedent: commit `3d40121` "flag multi-city days in Trip Check".
- **"Now"-aware features** (is-venue-open, the Today lens) compute against the **day's tz**, not the
  device's, so "open now" is correct while you're mid-flight or planning from home.

---

## 7. Trip-Check / engine implications

- `slots.js` stays **wall-clock** and tz-agnostic — a slot is "morning *there*." No change to the
  placement engine. This is deliberate: the engine never needs UTC.
- `geo.travelLeg` gains nothing required, but a tz-aware **arrival-time** check becomes possible
  ("you land at 11 PM local — too late for the 9 PM dinner you planned").
- New Trip-Check tips (soft `info`, per the re-tiered severity model): **jet-lag / red-eye**
  ("this leg crosses 3 zones and lands after midnight local"), **DST shift during the trip**
  (rare, but real for spring/fall US/EU trips).
- All of `costs.js` (the money moat) is **clock-free and stays clock-free** — timezones never
  touch split/settlement math.

---

## 8. Phasing (each phase is independently shippable + testable)

| Phase | Scope | Verifiable by |
|---|---|---|
| **0 — Spike** | `Intl` Hermes probe (§4); pick pure-JS vs lib | jest + 1 device log |
| **1 — Model** | store v6 schema + migrate (§3); `utils/tz.js` engine; tz inference (§5) | jest (pure), shape guard |
| **2 — Display** | zone badges, derived offsets, travel-leg arrival labels (§6) | **device** (UI) |
| **3 — Intelligence** | red-eye / jet-lag / DST Trip-Check tips (§7); multi-zone day badge | jest (rules) + device |
| **4 — Backend** | the same model serializes to the Phase-2 API as UTC + IANA name | Phase 2 |

Phases 0–1 are **pure-JS, fully unit-testable, zero UI risk**. Phase 2+ is UI → unverified until a
device pass (the established rule).

---

## 9. Open questions for the owner

1. **Offline tz-lookup table vs Google Time Zone API** — bundle size vs per-call cost. Lean
   offline (no new billed surface), pending the table's actual bundle weight.
2. **How aggressive is "now"?** Should the Today lens follow the *device* (where you physically
   are) or the *current day's planned tz* (where the itinerary says you should be)? They differ if
   plans slip. Proposed: device for "now", day-tz for "is this stop open."
3. **Pre-trip framing** — planning from home (Chicago) a Bali trip: show Bali time only, or
   "9:00 AM WITA (8:00 PM your time)"? Proposed: destination-time primary, home-time secondary only
   on the flight legs.

---

*Voyara · timezone model · design only · 2026-06-07*
