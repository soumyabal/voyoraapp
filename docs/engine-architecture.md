# Voyara — Day-Planning Engine Architecture (with & without AI)

> **What this is.** The north-star architecture for Voyara's planning engine, in **two modes**:
> a fully deterministic spine (the app today, fully realized) and an optional AI layer bolted
> to the side. Companion to [`intelligent-planner.md`](./intelligent-planner.md) (the rule/check
> catalog) — this doc is the *shape* of the engine and the AI boundary.
>
> Source: a 3-agent design panel (staff engineer · travel-itinerary architect · AI/ML strategist),
> synthesized June 2026. Living document.

---

## The one principle that governs everything

> **The deterministic engine PROPOSES nothing wrong, so it's the only thing allowed to say "yes."
> AI proposes candidates and prose; the rules dispose.**

A trip planner is **~80% deterministic logistics, ~20% taste/knowledge.** Voyara already owns the
hard 80% (hours + travel + pace + anchors + honest overflow + per-family cost) — the part
competitors *fake*. AI fills exactly two structural blind spots and never touches the spine:
**open-world knowledge** (it can't invent good places or know seasonal truth) and **natural
language** (it can't parse "make day 2 chiller").

A corollary, learned from the "park at 00:00" bug: that was a **deterministic rule bug** (the
Morning slot's placement window started at midnight), fixed once, forever, for every user, locked
by a test. An LLM would have "fixed" it non-deterministically, per-plan, at cost, with a fresh
chance to regress. **Logistics bugs are rule bugs, not intelligence gaps.**

---

## Mode 1 — Without AI (the spine, fully realized)

Six layers, each feeding the one below. This is the app today plus its highest-value gaps.

```
L0  DATA          Google Places → name, lat/lng, openHours[{d,o,c}], businessStatus,
                  types, rating, priceLevel, ♿accessibility, photo  ·  Photon geocode → origin
                  (null = unknown, NEVER 0 — the rule the 00:00 bug violated)
        │
L1  RANK          placeScore = rating + popularity        ← today (DiscoverModal)
                  + groupFit(place, profile)  ♿/age/diet  ← GAP #1 (logic already in ExperienceAgent)
        │
L2  RULES         validateTrip — ~18 rules, severity-tiered (red only when provable)
   (the CHECKER)  closed-venue is seasonal-aware → "verify hours", not false-red
        │
L3  PLACEMENT     scheduleDay (1 day) · planDay (one-tap, convergent) · autoArrange (multi-day)
   (the PLACER)   hours + travel + pace, clamped to 09:00–22:00, anchored wake→sleep
                  + 2-opt route refine · close-first ordering · day load-balance  ← GAPs #2-4
        │
L4  ROUTING       travelLeg(a,b)→{km,min} haversine×1.3  →  swap body for OSRM/Routes  ← GAP (backend)
                  dayRoutePoints → Google Maps directions URL (free, live today)
        │
L5  COST/SPLIT    rooms×nights + per-member; participatingFamilies = truth; estimates frozen
   (THE MOAT)     100% deterministic, forever — never an estimate, never AI
```

**Why this is the spine:** L2 (check) and L3 (place) share L4's `travelLeg` and the same
`estimateDuration`/`WINDOWS` model — so an arranged day *clears* the checks instead of tripping
them. "One engine places, the same engine checks." That structural fact is what makes it
trustworthy and unit-testable. Drafts are previewed before commit (`autoArrange` returns drafts;
`planDay` never writes).

### Deterministic gaps that make it feel "awesome" (AI-free, no backend)

| # | Gap | Where | Value · Reliability |
|---|---|---|---|
| 1 | **Extract `groupFit` → shared `placeScore.js`** — Discover ranks by ♿/age/dietary; reuse the logic that already lives inside `ExperienceAgent.scoreExperience` | `src/utils/` (new) + `DiscoverModal` | 8 · 9 · cheap |
| 2 | **Close-time-first ordering** — among near-equal stops, visit the one that shuts first; kills `closed_venue` warnings pre-emptively | `scheduleDay` | 6 · 9 |
| 3 | **2-opt route refine** after nearest-neighbour (bounded iters, plain JS — docs reject a heavy TSP solver; 2-opt stays in Expo Go) | `scheduleDay` | 6 · 8 |
| 4 | **Per-day load-balance + `tiring_day` check** — level active-minutes; don't stack a hike + a theme park | `autoArrange` + `tripValidator` | 7 · 7 |
| 5 | **Rule-registry refactor** (golden-snapshot gated) — pure `(ctx)→warning[]` rules; precondition for adding #2–4 cleanly | `tripValidator` | 5 · 9 |
| 6 | **Real routing behind `travelLeg`** (OSRM/Google Routes) — biggest accuracy unlock; same shape in/out, callers untouched | `geo.js` | 9 · 8 · **needs backend** |

Until the backend exists, haversine `travelLeg` is directionally correct at ~5 stops, and its
swap-in interface is already correct — so there is **zero rework cost in waiting.**

---

## Mode 2 — With AI (bolted to the side, never in the spine)

AI plugs into the two blind spots only. Everything it emits **re-flows through L1→L5** before it
touches the trip.

```
   ┌──────────── AI LAYER (optional · swappable · OFF-capable) ────────────┐
   │  fill-empty-day  ·  NL refine ("relax day 2")  ·  seasonal-hours nudge │
   │  group-aware synthesis (the existing flag-gated src/agents/pipeline.js)│
   └───────────────────────────┬───────────────────────────────────────────┘
                               │  emits ONLY: Place[] / draft[]  (NO times, NO costs)
                               ▼
   ┌──────────── DETERMINISTIC SPINE (Mode 1, unchanged) ──────────────────┐
   │  L1 rank → L2 rules → L3 scheduleDay → L4 route → L5 cost              │
   └───────────────────────────────────────────────────────────────────────┘
                               ▲   AI may NEVER cross this line:
                       opening hours as truth · cost/split math · capacity ·
                       ♿ hard-filter · anything that raises a RED badge
```

### The boundary contract — the one shape AI is allowed to produce

```js
// AI → engine. The ONLY shape crossing the boundary (the Discover "Place" shape).
Place = {
  name, lat, lng,              // to route & place; null lat/lng → degrades gracefully
  activityType, types, rating, // feed placeScore
  openHours: [{d,o,c}] | null, // null = unknown; engine stays silent, never guesses
  businessStatus, wheelchairOk,// feed hard filters at L1/L2
  costPerPerson,               // ADVISORY ONLY — L5 recomputes the real split
  placeId,                     // grounding: must resolve to a real, linkable venue
  _hint: { pinDay?, dayCount?, meal? } | undefined,  // user intent passthrough
  // FORBIDDEN from AI: time, final split amounts, estimatedAmount, participatingFamilies
}
```

**Three invariants that make AI safe AND optional:**
1. **`time` is assigned by `scheduleDay`/`autoArrange`, never by AI.** (Today `ItineraryAgent`
   emits a `time` — the hardening is to drop/ignore it and re-run `scheduleDay`.)
2. **Cost/split is L5 only.** `costPerPerson` from AI is an estimate input; the split math is
   deterministic — `estimatedAmount` frozen, `participatingFamilies` the source of truth.
3. **Hard constraints run AFTER AI.** A suggestion that violates hours/capacity/♿ surfaces as a
   Trip-Check nudge the user disposes — never silently honored.

Because the contract is "emit a Place, the engine ranks + places + checks + costs," **AI is
swappable** (Claude ↔ Gemini ↔ **off**) behind the existing `callPlannerAPI` flag, and **the app
is 100% functional with AI off** — the current shipping state.

---

## Where AI earns its keep vs. where it's a trap

| AI use-case | Value over rules | Safe? | Backend | Verdict |
|---|:--:|:--:|:--:|---|
| **NL refinement** ("make day 2 relaxed") | 8 | 8 | yes | **Turn on FIRST** — parses words → knobs you already trust; touches nothing in the moat |
| **Fill an empty day** (grounded in Places) | 9 | 6→safe* | yes | **Second** — cures the blank page; safe *only because* every pick is re-validated & re-costed |
| **Summarize / explain** ("why is day 3 light?") | 5 | 9 | no* | **Alongside** — read-only narration of facts the engine computed; cheapest trust win |
| **Seasonal hours** ("open in July?") | 4 | **3** | yes | **Verify-nudge ONLY** — AI may phrase the nudge, **never assert an hour** |
| Schedule / route / cost / hours-as-truth | — | **trap** | — | **Never** — provable problems; AI turns a correct answer into a confident guess |

\* "safe" = the deterministic engine catches a bad output downstream.

### What "Plan my day / trip" feels like in each mode

- **Without AI** — *non-planner:* "I dropped 5 bookmarked places, hit Plan my day, it just
  **worked** — moved the 4pm spot because it closes at 5, told me the last one won't fit." Fast,
  free, trustworthy — **but the page starts blank** (the cold-start problem).
- **With AI** — *non-planner:* "I typed *'chill 3 days in San Diego with my parents and a toddler'*
  and it **filled the days** — short, stroller-friendly, a veg dinner — then I tweaked in plain
  English." The magic is the blank page disappearing, with the deterministic engine still owning
  every number.
- **Power user (both):** AI seeds and suggests; the deterministic engine owns the truth. Override
  anything and the numbers stay exact. AI is co-pilot, never autopilot on logistics.

---

## The hard boundary — what must NEVER be AI-driven

| Stays deterministic | Why AI is a liability |
|---|---|
| **Opening hours as truth** | Real-world consequence (showing up to a closed venue). The cached-snapshot + seasonal-soften logic is *more honest* than an LLM, which has no knowledge of *this* venue on *this* date. AI may display or verify-nudge, never assert. |
| **Cost & split math (THE MOAT)** | Families settle real money on it; must be exact, reproducible, unit-tested. An LLM doing arithmetic is the worst trade in the app — infinite downside, zero upside. |
| **Capacity / rooms / member counts** | Structured facts; any "creativity" is a bug. |
| **Hard scheduling constraints** | Provable conflicts → `error` severity. AI output that violates them must re-flow through the validator, never ship raw. |
| **Anything that raises a RED badge** | The error badge is the deterministic engine's sacred space. AI is never provable, so AI lives in `info`/suggestion severity only. |

---

## Build order (what makes it "awesome" fastest)

**Bank the deterministic wins first** — no backend, no AI, high trust, compounding:
1. **`groupFit` → shared `placeScore.js`** — reused by Discover *and* the future AI pipeline.
2. **Close-first ordering + 2-opt** in `scheduleDay`.
3. **Per-day load-balance + `tiring_day` check.**
4. **Rule-registry refactor** (golden-snapshot gated) — so #2–3 are entries, not 40 more lines.

**Then, behind the Phase-2 backend (keys server-side):**
5. **Real routing behind `travelLeg`** (OSRM/Routes) — biggest accuracy jump, zero caller changes.
6. **AI NL-refine**, then **AI fill-empty-day** (grounded + re-validated), then **near-trip hours
   refresh** (`currentOpeningHours` upgrades soft "verify" → hard error).

**Verdict (unanimous panel):** Voyara already owns the trustworthy deterministic core competitors
fake — so **don't AI-ify logistics.** Spend effort on real routing + group-fit ranking now, then
bolt a *thin, grounded* AI layer on the edges for discovery and natural language, where **AI
proposes and the rules always dispose.** First concrete step: `placeScore.js` — it makes today's
Discover smarter with zero AI and hands the future AI the exact same function to call, cementing
the spine before any AI lands.

---

## Data tiers — what stays bundled, what moves to a database, when

Two recurring questions, with the boundaries written down so we don't move data prematurely (or
too late).

### `placeScore.js` is a kernel, not a store — keep it ~250 lines forever

It's stateless math: `score(place, groupProfile, context)` + a handful of tiny pure sub-scorers
(`qualityScore`, `accessFilter` ♿ hard-filter, `ageFit`, `dietaryFit`, `interestMatch`,
`distancePenalty`, `hoursFit`, `budgetFit`, `noveltyPenalty`). It stays small because it **holds no
data** — data arrives as the `place`/`profile` arguments.

- **The one rule that keeps it small:** never put *data* inside it (POI lists, per-city tips,
  curated dwell-times, a big taxonomy). The only inline data allowed is a small code-cadence
  taxonomy (interest keywords, `types→activityType` map) — put that in
  `placeScore.constants.js`, not in the scorer.
- **Signal you've crossed the line:** a change to `placeScore.js` adds *a place* or *a fact about a
  place* rather than *a rule about scoring*. That belongs in data/DB, not the kernel.
- **Payoff:** because it takes data as input and holds none, the scorer is **identical** whether
  the data comes from the mock today or a Postgres+PostGIS catalog later — you never rewrite it
  when the data moves.

### Three data stores, three different triggers — don't conflate them

| Store | Today | Move to a DB when… |
|---|---|---|
| **Trip state** | Zustand → AsyncStorage (versioned + `migrate`, invariant #7) | Cross-device **sync**, multi-family **collaboration** on one trip, or survive-reinstall is promised. *Not* a size problem (trips are ~1–10 KB; thousands fit). Gated on the **accounts / Phase-2** feature, not on data growth. |
| **POI / activity catalog** | Live Google Places + the `itineraryPlanner.js` mock (SD/LA/SF) | The **real "move to DB" moment**: when a curated catalog is *queried by geo + category + rating* rather than fetched-by-id. AsyncStorage is a key-value blob — no geo/full-text query — so a server DB with a geo index (Postgres+PostGIS / SQLite+R-tree) is required the instant the catalog is *queryable*. |
| **Places API cache** | In-memory + per-call cache in `places.js` | API **cost / rate-limits** bite at scale → a shared **server-side** cache (1,000 users searching "Niagara" = 1 upstream call). Pairs with moving the key off the bundle. |

### The decision rule (whichever fires first)

> **Bundle/embed data while it's small, static, and release-cadence-fresh. Move it to a DB the
> moment it must be (a) _queried_ by the server, (b) _updated faster than you ship a release_,
> (c) _shared/synced_ across users or devices, or (d) _too big for the bundle_.**

- **(b) usually fires first** — bundled data (`itineraryPlanner.js`) can only change on a new build.
  The day seasonal hours / prices / "what's new" must update *between* releases, that data must be
  server-side. Static facts (a museum's normal hours) can stay bundled longer.
- **(d) bundle size** — one curated city as JSON is fine (that's `itineraryPlanner.js`). Tens of
  cities with hours/photo refs = tens of MB of bloat → DB. A national catalog is GB → never bundle.
- **AsyncStorage's ~few-MB ceiling is NOT the pressure point** — trips are tiny. Move trip data for
  **sync/collaboration**, never for size.

### Sequence for Voyara

`placeScore.js` (kernel — now, no backend) → **backend + catalog DB + AI keys (one Phase-2
milestone — they arrive together, not separately)** → trip-sync DB (later, gated on `accounts`).
"Move data to a DB" and "stand up the FastAPI backend" are the **same milestone**, triggered by the
first feature that needs a *queryable, between-release-fresh* catalog (generative fill) — which is
also the feature that needs server-side AI keys.
