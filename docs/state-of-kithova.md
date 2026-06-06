# Kithova — State & Vision (the living doc)

> **This is the living source of truth for "where are we / where are we going."** Update it as
> things ship. The deeper references are [`product-roadmap.md`](product-roadmap.md) (GTM, phases,
> the §12 fundraising model) and [`rule-engine.md`](rule-engine.md) (how the engines work). When
> this doc and the roadmap disagree, **this doc wins** (the roadmap is older).
>
> Last updated: keep current. Stack: React Native 0.81 · Expo 54 · Zustand (local/persisted) ·
> deterministic engines · Google Places. No backend yet (by design — Phase 1 is local-only).

---

## 1. The vision (one paragraph)
**Kithova is the only app built for multi-family, multi-city trips: plan it together, split it
fairly, and keep it forever.** Three phases of one trip on one data spine —
**plan → split → remember** — so the lunch you log on day 2 flows into the settlement you send from
home, and the whole trip is still findable months later. The wedge is the **per-family split**
(nobody else models rooms-by-family / transit-by-size); the platform is the **whole lifecycle**.

---

## 2. Where we are right now (honest snapshot)

**Path-to-10 position: ~6.5 / 10 — Stage 0 (deterministic polish) essentially done; finishing the
gate to Stage 1 (free TestFlight).** Quality bar: **483 tests + 27 golden snapshots green**, 0 lint
errors, deterministic engines locked by fixtures.

| Area | Status | Notes |
|---|---|---|
| Multi-family / member model | ✅ Shipped | families × members, per-traveler needs, saved groups |
| **Split & settlement engine (THE MOAT)** | ✅ Shipped | per-family + per-person, even/uneven, minimal transfers; deterministic, **99% test coverage**; AI never touches it |
| Manual planning + Discover | ✅ Shipped | day planner; Discover via Google Places + free Leaflet/OSM map |
| **Trip Check** (rule engine) | ✅ Shipped | 25 warning types, tiered error/warning/info; golden-snapshot-locked |
| **Plan-my-day / auto-arrange** | ✅ Shipped | route + comfort pass + bounded 2-opt; convergent (no endless cycle) |
| Per-family budget → Split | ✅ Shipped | costed activities auto-flow into the split |
| Hotel-change / checkout handling | ✅ Shipped | over-booked-nights warning + one-tap trim; checkout-day anchor |
| Unconfirmed-spend guard (Split tab) | ✅ Shipped | flags past, unchecked, already-split activities before you settle |
| **Memories v0 — "Play My Trip"** | ✅ Shipped | recap reel from **cached** place photos + original music (no storage cost yet) |
| Brand = Kithova (visual) | ✅ Shipped | app icon, splash, wordmark; name/bundle set. Docs rebrand in progress |
| Privacy policy + App-Store answers | 🟡 Drafted | code-accurate draft; needs hosting + review |
| EAS dev-build prep | 🟡 Ready | expo-dev-client + key-free config hook; not yet built/distributed |
| Rule-engine visualization | ✅ Shipped | Mermaid + a live generated report over the real engines |
| **Backend (auth · keys server-side · collaboration · DB)** | 🔴 Not started | the one true ship-blocker for a *public* listing; Phase 2 |
| **Real memories (user photos/videos, multi-member upload)** | 🔴 Not started | needs the backend; do reference-based (see §6) |
| Affiliate / real hotel pricing | 🔴 Not started | the revenue engine; Phase 3 |
| Accounts / notifications (settle-up) | 🔴 Off / not started | flag-gated off for the free local TestFlight |

**Immediate path to TestFlight (Stage 1):** host the privacy policy → restrict the Google Places
key → Apple Developer enrollment → EAS build → TestFlight. (All non-code or near-code; tracked in
[`backlog.md`](backlog.md).)

---

## 3. Decision log — what changed since the old roadmap
- **❌ Live day-tracking is OUT (supersedes roadmap §11 steps 2–3).** The itinerary is now
  **phase-agnostic**: no "now/next," no day-locking, no live "today" view *inside* the plan. You can
  move any activity on any day, whether the trip is upcoming, active, or past. **Why:** a planner is
  for planning and re-planning freely; locking the screen to "today" fought how people actually use
  it (the user report that kicked this off: *"a not-started trip showed me Day 2"*). 
  **What we kept:** *trip-level* phase only — for (a) Home grouping (Active / Upcoming / Past) and
  (b) the eventual one-shot **settle-up** nudge after the trip ends. The per-activity live engine
  (`now/next`, today-chips, status pill inside the itinerary) is retired.
- **➕ Memories / lifecycle thesis added** — the "plan → split → **remember**" expansion is now the
  fundable story (see [`product-roadmap.md` §12](product-roadmap.md) + [`pitch-onepager.md`](pitch-onepager.md)).
  Memories are a **retention + switching-cost layer on the money/plan spine**, not a new wedge and
  not a Google-Photos competitor.
- **🔤 Rebrand Voyara → Kithova** in progress: app + visual identity done; doc/folder/storage-key
  sweep deferred (the `voyara-storage` key must never change — it would wipe users' data).

---

## 4. How far are we from the vision? (plan → split → remember)
| Pillar | Vision | Today | Gap |
|---|---|---|---|
| **Plan** | multi-family, multi-city, complex trips, made easy | ✅ strong (manual + Discover + deterministic Trip Check + plan-my-day) | AI assist (Phase 4); collaboration (Phase 2) |
| **Split** | fair, automatic, per-family — the moat | ✅ shipped & trustworthy | a *shareable* settlement link (Phase 1–2) = the viral loop |
| **Remember** | the durable home for the whole trip | 🟡 v0 (recap from cached photos) | real multi-member photos/videos + searchable archive (Phase 2 backend, reference-based) |

**One line:** the *hard, trustworthy* half (multi-family money + a deterministic planning spine) is
**built**. What's left is **shipping it**, adding a **share loop**, and turning on **real memories +
revenue** — each a known, sequenced step, not a research risk.

---

## 5. Market analysis — how big, and the pains we kill

### 5.1 How big (bottoms-up; full model in §12)
- **US group/multi-family leisure trips ≈ 20M/yr** *(assumption to validate)* → SAM (shared-lodging,
  organizer-led) ≈ **8M trips** → realistic Yr-3 SOM ≈ **0.3–0.5M trips**.
- Top-down sanity: US leisure travel is a **multi-hundred-billion-dollar** market `[source to add]`;
  group travel is a large, **under-tooled** slice — every incumbent serves the *solo/couple* traveler.
- The unit that matters is the **trip captain** (reunion / multi-family Disney·cabin·beach /
  destination-wedding / sports & church-group organizer). Each trip ≈ **3 families / 10–12 people** —
  so every captured trip is a multi-household beachhead.

### 5.2 The pains (how trips are *actually* run today)
1. **"We planned it in a spreadsheet."** The default tool for a serious group trip is **Excel /
   Google Sheets / a Notes doc + a group chat.** Tabs for the itinerary, a tab for who's paying, a
   tab for the rooming list — manually maintained, instantly stale, unshareable on a phone, and
   abandoned the moment the trip starts. *There is no purpose-built tool, so people reach for a
   spreadsheet.* That's the clearest signal the category is real and unserved.
2. **Going over budget.** Groups set a number, then lose track in real time — there's no running,
   per-family tally during the trip, so the **final bill is a surprise** and the "fair" split becomes
   an argument. Travelers routinely overspend because the cost is invisible until it's too late.
3. **The multi-family Airbnb money mess.** This is the sharpest pain:
   - **One person fronts a $3–6k house** on their card and becomes the group's unpaid bank.
   - **"Fair" is genuinely hard:** a family of 5 in the primary suite vs. a couple in a bunk room —
     splitting the house *per head* is unfair, *per room* is unfair, *per family* needs judgment.
     Every existing splitter (Splitwise, etc.) only divides **per person.**
   - **Chasing money for weeks** afterward — the awkward Venmo-reminder dance nobody wants to run.
   - Add transit (who rented the van), groceries, the cleaning fee, the kids' tickets… and the
     organizer is reconciling it all by hand.
4. **The trip evaporates.** After the trip, photos scatter across everyone's WhatsApp; months later
   the *only* recall is date/face-based phone "memories" that can't reconstruct *"the cabin trip with
   the Garcias — the plan, the photos, and who owed what."*

### 5.3 How Kithova solves each (pain → feature)
| Pain | Kithova's answer |
|---|---|
| Planned in a spreadsheet | A real **multi-family, multi-city day planner** on the phone — with Discover, deterministic Trip Check, and one-tap plan-my-day. The spreadsheet, replaced. |
| Going over budget | Costed activities **auto-flow into a live per-family tally**; the budget is visible *during* the trip, not discovered at the end. |
| Airbnb split is unfair / manual | **The moat:** lodging splits **by rooms × nights**, transit **by family size**, everything else per chosen mode — *per family, automatically*. Even/uneven custom splits supported; deterministic, trustworthy. |
| Fronting the house + chasing money | **Settlement** computes the minimal set of transfers ("the Garcias owe you $312") as a **shareable summary** — the organizer stops being the bank *and* the bill collector. |
| Trip evaporates | **Plan + money + memories on one spine**, kept in one place you can return to — searchable by *trip / people / money*, not just date/face. (v0 today; real multi-member memories at Phase 2.) |

### 5.4 Why now / why us (defensibility)
- **No one owns the multi-family unit.** Splitwise = money, no context, per-person only. Wanderlog/
  TripIt = plan, then silence, no real per-family money. Photos = pics, no trip, no money. Kithova =
  **all three on one model** + the per-family math none of them build.
- **Switching cost:** once a group's trips (plan + settlement + photos) live here, leaving loses the
  archive. Incumbents each hold one slice; we hold the whole trip.
- **Trust:** the money is **deterministic — AI never touches it** (golden-snapshot-locked). For a
  group-money product, that trust *is* the product.

---

## 6. The next 12–18 months (sequenced, low-research-risk)
1. **Ship Stage 1 (free TestFlight):** privacy policy hosted, key restricted, EAS build. Prove the
   wedge + the **shareable settlement link** (the viral loop) with real upcoming trips.
2. **Stage 2 (backend, one milestone):** auth + **keys server-side** + catalog DB + **collaboration**
   (every member contributes expenses & photos) + **reference-based memories** (tag library photos to
   a day/place; host only the *shared recap* → minimal storage COGS + privacy exposure).
3. **Stage 3 (revenue):** real hotel pricing → **affiliate "Book"** on the multi-room basket (free to
   the user; the basket is ~3× a solo booking).
4. **Stage 4 (growth + AI):** AI refine / fill-empty-day **re-validated through the deterministic
   spine** (never the money), dietary-aware discovery.

**Funding:** see [`product-roadmap.md` §12](product-roadmap.md) (full model) +
[`pitch-onepager.md`](pitch-onepager.md) (the cold-send cut). Seed ~$1.0–1.5M buys Stage 2–3 and the
traction gates to a Series A. *(All figures illustrative — validate before pitching.)*
