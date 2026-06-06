# Voyara — rule engines, visualized

Two deterministic, pure engines power the planning experience. This doc is the **structure**
(how they're wired); for **behavior** (what actually fires for real trips) open the generated
**[`rule-report.html`](rule-report.html)** — run `npm run rule-report` to regenerate it from the
live `validateTrip()`. Together: the Mermaid below = the map, the report = the territory.

> Both diagrams render in GitHub and VS Code (Markdown Preview Mermaid Support) — all local, no
> external service.

---

## 1. Trip Check — `tripValidator.js`

A **rule registry**: `validateTrip(trip)` runs 14 per-day rules (each over a shared
`buildDayContext`) then 6 trip-level rules. Every rule is a pure `(ctx|trip) → warning[]`. The
output array is severity-tiered and consumed by the per-day pill, the trip badge, and the
Trip Check modal (which offers one-tap fixes like *Trim to N nights*).

```mermaid
flowchart TD
  trip["Trip<br/>days · activities · families · origin"]
  trip --> vt{{"validateTrip(trip)"}}

  vt -->|"for each day"| ctx["buildDayContext<br/>(shared per-day state, computed once)"]
  ctx --> dr["14 DAY_RULES<br/>overlap · travel_time · closed_venue<br/>empty_day · no_meal · packed · tiring_day<br/>dietary_conflict · duplicate · early_start<br/>past_midnight · wake_time · no_fit_hours · …"]

  vt -->|"once per trip"| tr["6 TRIP_RULES<br/>first_stop_unreachable · unbooked_night<br/>check_out_by · hotel_overlap<br/>lastday_missing_checkout · long_journey_conflict"]

  dr --> w["warning[]<br/>type · severity · title · message · hint · dayIndex · fix fields"]
  tr --> w

  w --> sev{"severity tier"}
  sev -->|error| e["provable conflict<br/>(closed venue, 6h+ journey)"]
  sev -->|warning| wn["data-backed, worth checking<br/>(unbooked night, hotel overlap, dietary)"]
  sev -->|info| i["soft tip<br/>(tight travel, packed, tiring)"]

  w --> hp["computeTripHealth<br/>per-day worst level"]
  hp --> pill["day pill + 3-state trip badge<br/>(green ✓ / neutral … / amber)"]
  w --> modal["Trip Check modal<br/>+ one-tap fixes (trim / move time / settle)"]
```

**Severity tiers** (deliberately calm — no wall of red):

| Tier | Means | Examples |
|---|---|---|
| `error` | a **provable** conflict | venue closed that day, a 6h+ journey collision |
| `warning` | a real, **data-backed** thing worth checking | unbooked night, hotel overlap, dietary clash, duplicate |
| `info` | a soft **tip** (estimate-based) | tight travel time, packed day, tiring day, early/late edges |

**Locked by:** `tripValidator.snapshot.test.js` (the FULL output of every rule, golden-snapshotted
— a dropped/renamed/re-tiered rule shows up as a diff), plus `hotelOverlap.test.js`.

---

## 2. Planner — `autoArrange.js`, and the plan ⇄ check loop

`planDay` schedules a day, then Trip Check validates the result. The two share one engine —
*"one engine PLACES, the same engine CHECKS"* — so the inline cue and the warning always agree.
The loop is **convergent**: once a re-tap produces no changes, it reports a calm "already arranged"
instead of re-alerting (the fix for the old endless-cycle feeling).

```mermaid
flowchart TD
  add["Add / Discover → day basket"] --> pd{{"planDay(day)"}}

  subgraph SD["scheduleDay"]
    direction LR
    ro["routeOrder<br/>distance nearest-neighbour<br/>(anchored at where you wake)"] --> cp["comfortClosePass<br/>pull early-closing stops earlier<br/>ONLY within a ~2km comfort budget"]
    cp --> to["2-opt<br/>bounded swap refinement"]
  end

  pd --> SD
  SD --> res["triage: { scheduled, changed, overflow, unresolved }"]
  res --> vt2{{"validateTrip(merged)"}}
  vt2 --> wn2["warnings (same rules as §1)"]

  wn2 --> q{"anything to resolve?"}
  q -->|"user trims / moves / marks done"| pd
  q -->|"changed = ∅ (convergent)"| done["calm: 'already arranged' ✓"]
```

**Honest triage** (`{ scheduled, changed, overflow, unresolved }`) is what keeps the loop from
nagging: `overflow`/`unresolved` surface as a decision card (move-to-day / keep / remove) rather
than a repeating alert.

**Locked by:** `scheduleDay.test.js`, `twoOpt.test.js`, `comfortPass.test.js`,
`comfortClose.test.js`, `returnJourney.test.js`.

---

## 3. Why a generated report (not just diagrams)

The rules are **pure + deterministic + fixture-backed**, so the most trustworthy view is one drawn
from the engine itself, not hand-drawn. `scripts/gen-rule-report.js` runs the real `validateTrip()`
over illustrative sample trips and emits `rule-report.html` — a rule catalog (every type seen, its
tier, a real example) + per-trip results, colour-coded by severity. It **can't drift** from the
code. The Mermaid here gives the wiring the report can't; the report gives the behaviour the wiring
can't. Re-run after any rule change: `npm run rule-report`.
