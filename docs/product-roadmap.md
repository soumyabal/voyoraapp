# Voyara — Product Roadmap, GTM & Path to 10

> The single source of truth for *where the product stands*, *where it's going*, and *what to ship when*.
> Synthesized from a multi-panel review (product strategist · staff engineer · travel-itinerary architect · growth/GTM).
> Pairs with [`engine-architecture.md`](./engine-architecture.md) (the *how it's built*) and
> [`intelligent-planner.md`](./intelligent-planner.md) (the rule catalog). Living document.

---

## 1. Where we stand — the honest score (~6/10)

| Lens | Score |
|---|:--:|
| Product / market | 6.0 |
| Engineering / production-readiness | 6.8 |
| Planning depth / completeness | 6.0 |
| **Blended** | **~6.3 / 10** |

It's a **spike, not a plateau** — two world-class dimensions dragging up four at table-stakes.

| Dimension | /10 | Read |
|---|:--:|---|
| **Per-family splitting (the moat)** | **9** | Genuinely unique — nobody splits rooms×nights + by family size *inside* an itinerary |
| Day-building / sequencing | 8 | Plan-my-day + auto-arrange are more disciplined than funded competitors |
| Personalization (group profiles) | 8 | ages/♿/dietary/interests/wake-time — competitors barely model accessibility |
| Trustworthiness / correctness | 7.5 | "One engine places + checks," deterministic, 116 tests, golden snapshots |
| Lodging modeling | 7.5 | Night-plan/anchor model is cleaner than most apps |
| Discovery | 6.5 | Places + map + group-fit ranking; missing curated lists / fill-empty-day |
| AI leverage | 4 | A 6-agent pipeline + best-in-class safety doctrine — switched **off** |
| Real-world data (pricing/transit) | 3.5 | Hotel prices **mock**, transit **straight-line** — quietly undercuts the moat |
| Routing realism | 3 | Haversine + a Google Maps *URL*, no real drive times |
| Production / ship-readiness | 3 | No backend, keys in bundle, not on TestFlight |
| **Collaboration (multi-user)** | **1** | Existential gap — *named* multi-family but only one person can edit |

**The 5 gaps costing the most score:** (1) not shipped, (2) data is mock, (3) no collaboration, (4) AI off, (5) security/polish debt — *almost all delivery, not invention.* The hard, trustworthy 80% nobody else builds is already built.

> Engineer's correction: the scary "~420–462 lint errors" is mostly a **jest-globals misconfig** in the eslint flat config — real code debt is ~10 findings. The codebase is healthier than the headline suggests; the real blocker is **keys in the bundle**.

---

## 2. Positioning & ICP

**Positioning (one line):**
> **Voyara is the trip planner for when more than one family travels together — it plans the days *and* settles the money, per family, automatically.**

**The wedge:** *Splitwise can't plan your trip. Wanderlog can't split it the way families actually pay. Voyara does both — the only planner that splits a hotel by **rooms** and a road trip by **family size**.*

**ICP — the "Trip Captain":** the one type-A organizer (32–50) who runs 1–3 group trips/year for **2–4 families / 8–18 people**, mixed ages + diets, sharing **one rented house or a block of hotel rooms** that has to be split unfairly-but-fairly. Today they cobble together a Google Doc (plan) + a WhatsApp thread (chaos) + **Splitwise (money — which gets the split wrong** because it doesn't understand rooms or family size). Press that wound.

**Beachhead use-case to win FIRST:** **2–4 families renting one house/cabin for a long weekend, splitting the cost** (national parks, lake/beach houses, ski weekends). Perfect because: shared lodging is exactly where even-split tools fail and the moat shines; a weekend = a complete trip in one sitting (fast feedback); recurring + social (the *other* families are your next captains); and it needs **zero real-time hotel pricing** — captains type in the Airbnb price they already know. **Winnable on today's deterministic engine.**

---

## 3. The viral loop — the one mechanic to build

Multi-family is inherently multiplayer: the organizer can't get the payoff (a clean per-family split) unless the other families show up. **The moat is also the loop.**

**Build this ONE thing: a web-viewable, no-install, shareable per-family settlement summary.**

```
Organizer plans trip (solo, no account)
   └─ "Share with the group" → a LINK (opens in any mobile browser, no app)
        └─ each family sees the whole trip + "Your family's share: $1,240"
             (itemized: rooms×nights, transit×your N, meals×your N — the trust moment)
             └─ "Claim your family" → lightweight account (to adjust headcount / mark paid)
                  └─ post-trip: "Plan your own trip?" → each family becomes a NEW captain
```

Money is the forcing function — every family opens the link to verify *their* number. Non-negotiables: **(1) viewable with NO app install** (a parent won't download an app to learn what they owe), **(2) screenshot-worthy** (the artifact they paste into the group thread = your distribution), **(3) "claim" converts viewer→user.** Real-time co-edit is **NOT** required — a read-only shared link + "claim + adjust your own family" gets ~80% of the viral value at ~20% of the build.

> Build-once-win-thrice: this same surface is the **viral loop**, the **free SEO tool** (a web "Group Trip Cost Splitter"), and the **retention artifact** (the post-trip settlement).

---

## 4. The Minimum Lovable Product (launch scope)

| Capability | Launch-criticality | Verdict |
|---|:--:|---|
| Per-family split + settlement (moat) | 10 | Non-negotiable, must be flawless |
| Manual day planner + fast add | 9 | The substrate the moat sits on |
| Family roster + needs tags | 9 | *The* multi-family signal |
| Per-family share/export | 9 (perceived) | The cheapest "multiplayer" — every family sees their share |
| Trip Check + plan-my-day | 7 | The free "smart" wow (no API) |
| Lodging / per-night model | 7 | Makes the per-night split honest |
| 2-family demo trip (first-run) | 8 | Beta users churn on an empty screen |
| Discover (Places) · routing URL | 6 | Keep — high value-per-byte |
| Real pricing · real transit | 5 / 4 | Defer **if** UI is honest (see below) |
| Collaboration (real-time co-edit) | — | **Fast-follow, NOT v1** |
| AI planner · import · offline · web | 3/2 | Defer |

**Collaboration verdict (unanimous): launch single-captain.** Separate *multi-family the model* (already done — one captain models all families, app splits per family) from *multi-user the infrastructure* (needs the full backend = the biggest scope trap). Ship the **share-out** (extends `exportPlan.js`) as the cheapest multiplayer; real co-edit arrives *with* the backend as the "Voyara 1.5" headline. **Market "fair splits everyone can see," not "plan together."**

**Data-honesty bar:** launch with **estimated inputs** (hotel rate, drive time) **only if every estimate is labeled + one-tap editable** (*"Est. $180/night — tap to set actual"*, *"~25 min (estimate)"*). The **split math + settlement must be 100% exact** on whatever numbers are present. Honesty on *inputs* protects the moat; never fudge the *division*. Real pricing is a post-launch trust-upgrade, not a blocker.

**First-run (aha < 5 min):** open → a gorgeous **pre-built 2-family demo trip with a populated split** → "Make it yours" (NewTrip pre-seeded with 2 families, never a single-family empty state) → fast-add one hotel + activity → **live per-family split surfaces** → one-tap "Plan my day." *Never land a new captain on an empty single-family trip.*

---

## 5. The ship timeline — what to ship, when

Timing = elapsed weeks for a small team; deliberately conservative. Maps onto the Stage 0→5 path-to-10.

| Phase | Ship what | When | Gate to advance |
|---|---|---|---|
| **0 · Deterministic polish + de-risk the demo** | Fix destination autocomplete · **auto-flow itinerary costs → Split** (the two best features must compose) · reframe greyed "AI Soon" · close-first + 2-opt · rule-registry · **eslint/CI fix** · restrict Google key (non-code) | now → ~wk 3 | Clean end-to-end demo: create → drop places → plan-my-day → push → **correct per-family settlement**, no dead-ends / no 00:00 |
| **1 · Free TestFlight beta** | Phase-0 build on TestFlight · **no accounts/IAP** · **build the shareable settlement link** (to test virality) | ~wk 3–10 | ≥8 captains plan a *real upcoming* trip **and** reach a settlement; ≥3 unprompted "is this on the App Store / can I show my group?" |
| **2 · App Store v1 (free)** | Hardened v1 + **web-viewable share-out** · **backend = auth + keys server-side + catalog DB** (one milestone) · keys off-device before public listing | ~wk 10–22 | App Store live + working share loop (recipient outside the trip received it) + healthy D7 |
| **3 · Monetization ON** | Real hotel pricing (affiliate API) → **affiliate "Book"** on the multi-room basket (free to user) | ~wk 22–34 | Measurable Book-tap rate + first commission events |
| **4 · Growth + AI** | AI **NL-refine** → AI **fill-empty-day** (re-validated through the deterministic spine) · dietary-aware discovery · **collaboration fast-follow** (with the backend) | ~wk 34+ | Activation + retention lift vs. Phase-2 baseline |

**The single most important thing to get right:** the wedge-completing chain — **plan a shared-lodging trip → the per-family split comes out correct & obvious → the captain shares it → other families see their share.** Everything defensible lives in that chain. Never let AI touch the money inside it.

---

## 6. Monetization

- **Affiliate hotel booking — turn on at Phase 3, the moment real pricing lands, never before.** Free to the user; commission ~4–6% of booking value; the multi-room basket is worth ~3× a solo app's. Affiliate APIs (Booking.com / Expedia TAAP / Travelpayouts) are **free to access** (they pay you) — gated by *approval* (needs a shipped app + traffic), not money. Affiliate on *mock* prices is dishonest → tie it strictly to real pricing.
- **Real ongoing API cost is the data side** (Google Places/Routes — pay per call), which is why the **server-side cache** matters. Photon geocode + OSRM routing are free/open-source alternatives.
- **Freemium/subscription: not before Phase 4, and only if retention proves out.** Low-frequency usage (1–3 trips/yr) favors **per-trip pricing (~$6.99)** over an annual sub. If you ever charge, gate **AI planning + AI discovery + advanced reports**.
- **NEVER charge for the core:** manual planning, family/member profiles, **the split + settlement**, and Trip Check. The split is *the reason people tell their other families* — it must be free forever.
- **Sequencing rule:** revenue is downstream of *shipped + users + a working share loop.* Ship → grow → affiliate → (maybe) freemium.

---

## 7. Acquisition & retention

**Top 3 channels (small team, in order):**
1. **Community infiltration of organizers** — Facebook Groups (family reunions, large-group Disney/cabin trips, destination weddings), subreddits (r/travel, r/weddingplanning, r/familytravel), youth-sports/church WhatsApp threads. Show up as the *helpful tool* answering "how do we split the Airbnb fairly?" Near-zero CAC; where pre-launch betas get their first 100 fans.
2. **Content/SEO anchored by a free web "Group Trip Cost Splitter"** — own "**how to split group travel costs**" (under-served, high-intent) instead of the unwinnable "trip planner" keyword. The free splitter = same surface as the share link. Cluster posts ("how to fairly split a multi-family Airbnb," and the contrarian manifesto **"per-person splitting is unfair for group travel"**). Compounds; near-zero marginal CAC. Start now (3–6 mo SEO lag).
3. **Family-travel micro-influencers (10k–80k)** — comp with early access/affiliate, not cash. Activate in the launch window.

ASO = hygiene at App Store launch (keywords: "group trip planner," "split travel costs," "trip cost splitter"). **Paid = last**, only into a *proven* loop (your effective CAC divides by families-per-trip — the unfair advantage).

**Retention loop (settlement is the hook):** pre-trip ("3 days out — your family's share") → mid-trip ("add today's lunch?" keeps the tally live) → **post-trip ("Final split: the Garcias owe you $312 — send the summary")** = the highest-emotion re-activation, pulling back *every* family. Between trips: "3 of 4 families from the Smoky Mountains trip are free — plan round 2?" You *know the group travels together* — a retention superpower no generic planner has.

**Launch motion:** Product Hunt (lead with the *splitting* angle) + the community wave + the contrarian content piece + activate seeded influencers + ask beta captains for day-one reviews.

---

## 8. North-star + metrics

**North-star: Completed multi-family trips** = a trip with **≥2 families that reached a settlement screen.** It forces the whole moat to fire (families modeled + days planned + money split) and is the exact artifact a captain shows their group.

| Phase | Activation | Core value | Moat / retention | Virality |
|---|---|---|---|---|
| 1 TestFlight | % captains reaching a planned day | % trips with ≥2 families | **% trips reaching settlement** | unprompted "App Store?" asks |
| 2 App Store | D1→D7 second-session | trips completed/wk | settlement rate per trip | **share-outs sent; recipients→new captains (K)** |
| 3 Affiliate | plans with ≥1 priced room | trips completed/wk | repeat captains (2nd trip) | **Book taps/trip; commission** |
| 4 AI/Growth | planned-day rate (AI lift) | trips completed/wk | W4 retention; trips/captain | referral conversion |

Watch **settlement-screen rate** above all early — if people plan but never split, you built a planner, not Voyara, and the word-of-mouth never fires.

---

## 9. Engineering / production-readiness checklist (gates the ship)

Ordered by ROI; each gated by the existing golden snapshots where it touches the engine.

1. **eslint flat-config fix** (jest + RN globals) + **CI gate** (jest + eslint on PR) — sub-hour, highest ROI; collapses "462 errors" to ~10 and protects every refactor below.
2. **Restrict the Google Places key** to bundle-ID + Places API (interim) — non-code, do now.
3. **Backend = move keys server-side** (FastAPI/edge proxy) — the one true ship-blocker for a *public* listing; same milestone as auth + catalog DB + collaboration.
4. **Rule-registry refactor** of `tripValidator.js` (snapshot-guarded) · **store-slice split** (shape-guard-protected).
5. **Decompose `ItineraryScreen.js`** (~2.6k lines) into subcomponents + add render tests (`@testing-library/react-native`).
6. **Coverage threshold** (≥80% on costs/expenses/tripValidator/store) + **crash reporting** (Sentry) + selector-level Zustand subscriptions (cut re-renders).

---

## 10. The path-to-10 (capability deltas, for reference)

`6.0` → **0:** deterministic wins (placeScore ✓, close-first+2-opt, rule-registry, lint/CI) → `6.5`
→ **1:** ship free TestFlight (privacy policy, key restriction, EAS) → `7.0`
→ **2:** backend (auth + keys server-side + catalog DB + collaboration) → `8.0`
→ **3:** real data (routing via OSRM/Routes behind `travelLeg`; real hotel pricing) → `8.7`
→ **4:** AI on (NL-refine → fill-empty-day → seasonal) → `9.3`
→ **5:** import (flight/hotel) + per-family split-nights + polish (offline, packing) → `~10`

**One-line verdict:** *Voyara has already built the hard, trustworthy moat nobody else builds — its score is gated almost entirely on **shipping it**, **feeding it real data**, **turning on the AI it has safely designed**, and **making the "multi-family" name true with a shareable, per-family settlement** that is simultaneously the product, the viral loop, and the revenue path.*
