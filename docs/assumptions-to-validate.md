# Kithova — assumptions to validate (before pitching)

Every number in [`product-roadmap.md` §12](product-roadmap.md), [`pitch-onepager.md`](pitch-onepager.md),
and [`state-of-kithova.md` §5](state-of-kithova.md) is an **illustrative assumption**. This is the
list to harden — what each value is, **what it swings**, and **where to get a defensible figure.**

> ⚠️ **Honesty note:** the *source categories* below are real, credible places to look — but I
> haven't fetched live figures, so **verify each before quoting it.** Two buckets matter differently:
> **(A) market numbers** you source externally; **(B) behavioral numbers** (K-factor, retention,
> conversion, CAC) you **can only get by measuring a real cohort** — and investors weight (B) far
> more than any top-down (A). Get even a *tiny* real beta cohort before the raise.

---

## The "big four" — fix these first (they move the model most)
1. **TAM — US group/multi-family trips per year** (`~20M`) — scales the whole funnel.
2. **Avg multi-family lodging booking value** (`$2,500`) — drives affiliate revenue (the engine).
3. **Book-through rate** (`25%` book lodging via us once real pricing lands) — the other affiliate lever.
4. **Settlement rate + K-factor** (the viral loop) — *only knowable from the beta*; the number an
   investor will trust over any market-size slide.

A 2× swing in any one of these roughly 2×'s (or halves) the revenue line — so source these, not the
rounding-error assumptions.

---

## (A) Market & monetization assumptions — sourceable externally

| # | Assumption | Current value | What it drives | Where to source / how to validate |
|---|---|---|---|---|
| A1 | US leisure trips / yr (top-down sanity) | `$[X00]B` market | TAM credibility | **US Travel Association** (economic-impact stats); **NTTO**; **BTS National Household Travel Survey**; Statista; Phocuswright |
| A2 | **US group/multi-family trips / yr (TAM)** | `~20M trips` | whole funnel | derive: (US households × % that take a group/family-reunion trip/yr) — **MMGY "Portrait of American Travelers," Family Travel Association, AAA travel surveys, Vrbo/Airbnb trend reports**; cross-check w/ Census household counts |
| A3 | SAM = shared-lodging, organizer-led share of TAM | `~40%` (~8M) | serviceable market | vacation-rental trip share — **AirDNA, Vrbo/Airbnb annual trend reports, Skift Research** |
| A4 | SOM (yr-3 capture) | `0.3–0.5M trips` (4–6% of SAM) | revenue ceiling | bottoms-up from your funnel (channels × conversion), not a top-down % — defend with the channel math, not a guess |
| A5 | Avg families / people per trip | `~3 families / 10–12 ppl` | the CAC divisor | travel-party-size data (NHTS; industry surveys) + **your own beta trips** |
| A6 | **Avg group lodging booking value** | `$2,500` | affiliate revenue | **AirDNA** (ADR × nights × units); **Airbnb & Vrbo/Expedia 10-Ks / investor decks** (ADR, GBV, nights); Key Data Dashboard — then model a *multi-room* basket |
| A7 | Affiliate commission % | `4–6%` (use 5%) | affiliate revenue | **published terms:** Travelpayouts, Booking.com Affiliate Partner Program, Expedia TAAP tiers |
| A8 | Book-through rate (book lodging via us) | `25%` | affiliate revenue | **own beta** Book-tap → booking funnel (Phase 3); no external proxy |
| A9 | Per-trip Pro/AI price | `$6.99` | secondary rev | **own** price-sensitivity survey + paywall A/B in beta |
| A10 | Pro/AI attach rate | `10%` | secondary rev | **own** beta paywall conversion |
| A11 | Blended ARPU / completed trip | `$30–40` | revenue/trip | computed from A6–A10 — *output, not input*; recompute once those are real |

## (B) Behavioral assumptions — ONLY from measuring a real cohort

> These can't be sourced from a report. A 50–200-trip beta gives you real ones — and they're the
> numbers that actually de-risk the raise.

| # | Assumption | Current value | What it drives | How to get it |
|---|---|---|---|---|
| B1 | **Settlement rate** (trips reaching a settlement) | aspirational | the north-star; proves the wedge | instrument the beta: % of trips with ≥2 families that hit the settlement screen |
| B2 | **K-factor** (share-outs → new captains) | `~3 exposed/trip × [conv%]` | viral growth / CAC | instrument the share-link: recipients → installs → trips created |
| B3 | Repeat-captain rate (2nd trip) | `~1.5 trips/yr` | LTV | cohort retention in beta |
| B4 | Retention (W4 / 2nd-session) | `~2-yr` lifespan assumed | LTV | cohort analysis |
| B5 | LTV : CAC | target `>3:1` | fundability | derived from B2–B4 + channel CAC tests |
| B6 | CAC by channel | "near-zero" (communities/SEO) | growth efficiency | small paid + community tests; SEO ranking trajectory |
| B7 | Member-participation rate (non-captains contribute) | assumed strong | stickiness thesis | Phase-2 beta: % of invited members who add an expense/photo |

---

## Minimum viable evidence for a seed pitch
You don't need all of it — you need **the wedge proven + the loop showing signs of life**:
1. **A2 + A6 + A7** sourced (3 external figures) → a credible top-down + bottoms-up market slide.
2. **B1 (settlement rate)** from even ~20–50 real beta trips → proof people *split*, not just plan.
3. **B2 (early K signal)** → at least anecdotal "recipients became captains."
4. Everything else stays clearly labeled *projection*. Investors fund a **proven wedge + a believable
   loop**, not a perfect spreadsheet — so spend the validation energy on B1/B2, and *source* (don't
   guess) A2/A6/A7.

## How to keep this honest
- Replace each `[X]`/range in §12 + the one-pager with the sourced figure **and a footnote citation**.
- Keep the bottoms-up model (A6×A7×A8 …) — it's far more defensible than a top-down "1% of a huge
  TAM" claim.
- Re-run the numbers after the beta; update the living doc. Under-promise the projections; over-index
  on the real B1/B2 evidence.
