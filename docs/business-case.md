# Kithova — Business Case & Revenue Model

*Self-contained investor brief. Status/vision detail lives in
[`state-of-kithova.md`](state-of-kithova.md); the numbers here are derived in **Appendix A** and
the figures to source are tracked in [`assumptions-to-validate.md`](assumptions-to-validate.md).*

> ⚠️ **All figures are illustrative assumptions, shown with their math (Appendix A).** Validate /
> source before pitching. The *structure* (multiple revenue streams + a viral CAC divisor) is the
> durable part; the inputs are yours to harden.

---

## 1. The opportunity
A serious multi-family, multi-city trip is run today across **four apps that don't talk** — WhatsApp
(chat), a **spreadsheet** (plan + who-pays), Splitwise (split), Photos (remember). The result:
groups plan in Excel, **go over budget** because there's no live tally, fight over an unfair
**per-person** split of a shared Airbnb, chase each other for money for weeks, and then watch the
whole trip **evaporate** into a dead group chat. *People reach for a spreadsheet because no
purpose-built multi-family tool exists* — the clearest sign the category is real and unserved.

## 2. The product & the moat
**Kithova is the only app built for multi-family trips: plan together, split fairly, keep forever —
on one data spine (`families × days × places × money × photos`).**
- **The wedge:** the per-family split (lodging by rooms×nights, transit by family size) — *no one
  else models the family unit; every splitter divides per person.* Deterministic; **AI never touches
  the money** (test-locked). For a group-money product, that trust *is* the product.
- **The lock-in:** once a group's whole trip lives here, leaving loses the archive. Incumbents each
  hold one slice; Kithova holds the whole trip.

---

## 3. Revenue streams (the core)
**Four** independent streams, layered so **the core is always free** (free = the viral loop) and
money arrives *downstream of value*: subscriptions (§3.1), affiliate booking (§3.1), and — at scale —
a human-planner **marketplace** (§3.5):

### 3.1 The tiers
| Tier | Price *(illustrative)* | What you get | Turns on |
|---|---|---|---|
| **Free — "Plan & Split"** | $0 forever | Manual multi-family planning · Discover · Trip Check · **the per-family split + settlement** | **Phase 1 (now)** |
| **Pro — "Plan with AI"** | ~$6.99/trip · or $7.99/mo · or $39.99/yr | AI itinerary generate + refine · AI discovery · advanced per-family reports — **the AI plan lands as checkable daily steps that feed budgeting + the split** | **Phase 2** (needs backend + server-side keys) |
| **Premium — "Plan, Split & Keep"** | ~$12.99/mo · or $59.99/yr | Everything in Pro **+ trip photo/video storage & the shared, searchable archive** (the cross-platform memory home) | **Phase 2→3** (storage) |
| **Affiliate booking** *(not a tier — free to the user)* | commission ~4–6% | One-tap "Book" on the **multi-room** lodging basket | **Phase 3** (needs real pricing) |

> **Never charge for the core** — manual planning, profiles, **the split + settlement**, Trip Check.
> The split is the reason families tell their *other* families; it must be free forever.

### 3.2 Why the AI tier wins (mindtrip.ai, but better)
Generic AI planners (e.g. mindtrip.ai) hand you a pretty itinerary and stop. Kithova's AI plan is
**actionable and wired to money**:
- Each AI-suggested stop is a **checkbox daily step** — tick it as you go.
- Each costed step **flows into the live per-family budget and the split** — so the AI plan *helps
  you not overspend* and *settles automatically*, instead of being a doc you abandon at the gate.
- It's **multi-family-aware** (accessibility, dietary, pace per traveler; cost per family) — context
  no general planner has.
- And it's **safe**: AI proposes the *plan*; the deterministic engine still owns the *money*.

*Differentiator in one line: others generate a plan; we generate a plan that budgets and splits
itself.*

### 3.3 Why Premium storage is a real need (not a nice-to-have)
Group trips are **mixed iOS + Android**. Apple Memories and Google Photos **don't cross platforms**,
so a mixed-OS group has **no shared home** for the trip's pics/videos — they scatter in WhatsApp and
are unfindable months later. Premium gives the group **one cross-platform archive**, tied to the
plan and the money (searchable by *trip / people / who-owed-what*, not just date/face). This is the
**switching cost** that makes Kithova sticky.

### 3.4 Revenue × phase × timeline
| Phase (elapsed wks) | Ships | Revenue streams live | Goal |
|---|---|---|---|
| **1 — Free TestFlight** (now→~wk3) | wedge + shareable settlement link | none (prove the loop) | settlement rate + early virality |
| **2 — App Store + backend** (~wk10–22) | auth · keys server-side · collaboration · AI planning · storage | **Pro + Premium subscriptions ON** | first recurring revenue; member participation |
| **3 — Monetization** (~wk22–34) | real hotel/Airbnb pricing | **+ Affiliate booking ON** (the big lever) | Book-tap rate + first commissions |
| **4 — Growth + AI + WhatsApp** (~wk34+) | AI depth · **WhatsApp companion (§5)** | all three + new acquisition surface | K-factor lift; cross-platform reach |
| **5 — Marketplace** (scale-gated) | **"Kithova for Pros"** → human planner / guide marketplace (§3.5) | **+ marketplace take-rate** | done-for-you families; planner supply |

Sequencing logic: subscriptions need the **backend** (Phase 2); affiliate needs **real pricing**
(Phase 3). Revenue trails adoption *by design* — Phase 1 proves the wedge for free.

### 3.5 Marketplace — human trip planners & guided tours *(Phase 5, scale-gated)*
For families with **no time or energy to DIY**: a two-sided marketplace where **vetted human trip
planners and local guides quote** custom plans + guided tours **inside Kithova**, and Kithova takes a
**take-rate** (planning fee + tour commission). *Why it fits us specifically:* a planner doing
*group* trips needs exactly what Kithova already has — multi-family structure, per-family budget +
split, and the day-plan as a shareable artifact. The planner builds in Kithova; the plan flows
straight into the family's split and booking. No other tool gives a pro a **group-travel** workspace.
- **Smart on-ramp — "Kithova for Pros" first.** Before a consumer marketplace, let existing
  independent travel advisors use Kithova as their **planning tool / CRM**. They bring *their own*
  clients → this **seeds the supply side** and proves the workflow *without* the cold-start.
- **Honest gating.** A marketplace is the **hardest** model (two-sided chicken-and-egg). It needs
  **demand-side scale first — realistically *thousands* of active trips, not "hundreds"** — before a
  planner can earn from leads. Turn on *only after* the core loop + subscriptions + affiliate prove out.
- **Take-rate (illustrative):** ~15–20% of a $150–500 planning fee (≈ **$25–100 / booking**) + a cut
  of guided-tour bookings.
- **⚠️ Flags (get professional counsel — not a legal opinion):** selling travel services triggers
  **payments + escrow + payouts + 1099 tax**, **trust & safety** (vetting, reviews, disputes,
  refunds, no-shows), **liability / insurance**, and **"seller of travel" registration/bonding** in
  some US states (e.g. CA / FL / WA). Design against **disintermediation** — keep payments, the plan,
  and comms in-platform.

---

## 4. The numbers (summary; derived in Appendix A)
- **Market (bottoms-up):** TAM ≈ **20M** US group/multi-family trips/yr → SAM ≈ **8M** (shared-lodging,
  organizer-led) → Yr-3 SOM ≈ **0.3–0.5M** trips.
- **Per completed trip (transactional):** blended ARPU ≈ **$30–40**, affiliate-dominated.
- **Subscriptions (recurring):** a paid layer on repeat captains (illustratively ~5–10% to Pro,
  ~2–3% to Premium) → growing MRR independent of any single trip.
- **Illustrative trajectory:** Y1 ~10K trips/~$0 (prove loop) → Y2 ~120K/**~$1.8M** → Y3 ~400K/**~$14M**.
- **Unit economics:** LTV ≈ **$100+**/captain; **CAC divided by families-per-trip** via the share
  loop → target **LTV:CAC > 3:1**.

## 5. A novel acquisition idea — the WhatsApp / **@kithova** companion *(explore + IP clearance)*
*Full mechanics + the premium "import your WhatsApp trip" feature → [`design-whatsapp-ingest.md`](design-whatsapp-ingest.md).*

**The barrier to memories + member participation is behavior change:** "install our app and upload
your photos." Groups already live in **WhatsApp**, cross-platform, every trip.

**The idea:** a WhatsApp-native companion so families contribute with **zero new behavior** — share a
photo (or log an expense) to the trip by sending/mentioning **@kithova** (e.g., a per-trip Kithova
contact/bot), and Kithova **auto-ingests it into the right trip + day** (EXIF date → day; sender →
family) and into the structured plan/split/archive. They keep using WhatsApp; the trip quietly
assembles itself in Kithova. *"Kithova, log $40 dinner, I paid"* → a per-family expense. Photos →
the shared archive. **This collapses the cross-platform + behavior-change barriers at once and feeds
both the memories moat and the live split.**

**Honest flags (do not skip):**
- **Novelty / patent:** the *mechanism* — bridging an ephemeral group chat into a structured,
  per-family money+plan+memory record via chat-native ingest (mention/forward → auto-classified to
  day/place/family) — **may** be novel, but chat bots, shared albums, email-to-album, and travel
  chatbots exist. **A real prior-art / patentability search (USPTO, Google Patents, a patent
  attorney) is required before claiming novelty** — *I'm not a lawyer; this is a flag to get
  professional clearance, not an opinion that it's patentable.*
- **Feasibility:** the **WhatsApp Business API** has policy + technical limits (bots can't silently
  read arbitrary group messages; opt-in/templated interactions; per-message pricing). Validate what's
  actually permitted before committing — this likely works as an opt-in per-trip contact/bot, not a
  passive group listener.
- **Sequencing:** Phase 4 exploration, *after* the core loop is proven — high upside, real unknowns.

## 6. The ask & use of funds
**Seed ~$1.0–1.5M, 18–24 months.** Buys: **Phase-2 backend** (auth · keys server-side · catalog DB ·
collaboration), **reference-based memories storage**, **AI planning** behind the Pro tier, and
**affiliate integration** (Phase 3) — i.e. it turns on *all three* revenue streams and reaches the
traction gates (settlement rate · K-factor · repeat captains · Book-tap rate) that unlock a Series A.

---

## Appendix A — how each number was derived
*Each line = the formula + the input assumptions. Replace inputs with sourced figures (Appendix B).*

**Market**
- **TAM (20M trips):** `US households (~130M) × % taking a group/multi-family trip/yr (~15%)` ≈ 20M.
  *(Both inputs are assumptions — validate the group-trip rate; it's the single biggest swing.)*
- **SAM (8M):** `TAM × shared-lodging, organizer-led share (~40%)` = 8M.
- **SOM yr-3 (0.3–0.5M):** bottoms-up from the acquisition funnel (community + SEO + share loop),
  ≈ 4–6% of SAM — defended by channel math, *not* a top-down "1% of a huge market" claim.

**Affiliate revenue / completed trip**
- `avg group lodging booking $2,500 × commission 5% = $125 per booked trip`
- `× book-through 25% (share of trips that book via us once real pricing lands) = ~$31 / completed trip`

**Subscription revenue**
- **Per-trip Pro:** `$6.99 × 10% attach = ~$0.70 / completed trip` (transactional view), **or**
- **Recurring:** `active captains × conversion (Pro ~8% @ $7.99/mo; Premium ~3% @ $12.99/mo) = MRR`.
  *(Recurring view is the better story once retention is real; conversion % must come from the beta.)*

**Blended ARPU / completed trip (~$30–40):** `affiliate ~$31 + per-trip Pro ~$0.70 + Premium attach`
→ rounded to a $30–40 band (affiliate-dominated). Recompute once $2,500 / 5% / 25% are sourced.

**Marketplace take-rate (Phase 5, scale-gated):** `planning fee $150–500 × take-rate ~15–20% ≈
$25–100 / booking` + a cut of guided-tour bookings. Two-sided cold-start → volume-gated on
*thousands* of active trips; not in the Yr-1–3 base case.

**Trajectory** *(adoption × ramping ARPU; affiliate only from Phase 3, so ARPU ramps)*
- Y1: `~10K trips × ~$0` (pre-monetization) = ~$0
- Y2: `~120K trips × ~$15 (ramping)` ≈ **$1.8M**
- Y3: `~400K trips × ~$35` ≈ **$14M**
- *Maturity scenarios:* `50K×$20≈$1M` / `300K×$40≈$12M` / `1M×$50≈$50M`.

**Unit economics**
- **LTV (~$100+):** `1.5 trips/yr × ~$35 ARPU × ~2-yr retention`.
- **CAC divisor:** each completed trip's settlement recap reaches **~3 other households** → effective
  CAC ÷ families-per-trip; combined with near-zero-CAC channels (communities + SEO).
- **LTV:CAC > 3:1** target — derived from the above + channel CAC tests.

**Why bottoms-up:** `$2,500 × 5% × 25% …` is defensible and pressure-testable; a top-down
"X% of a $Y00B market" is not. Lead with the bottoms-up build.

## Appendix B — where to source the inputs
See **[`assumptions-to-validate.md`](assumptions-to-validate.md)** for each assumption mapped to a
real source category (US Travel Association · MMGY · AirDNA · Airbnb/Vrbo 10-Ks · affiliate program
terms) — and the behavioral numbers (settlement rate, K-factor, retention, CAC) that **can only come
from measuring a beta cohort**, which investors weight above any top-down slide.
