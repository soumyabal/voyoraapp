# Voyara — Product Findings & Scope of Improvement

> Compiled from a working session: rebuilding the Discover map experience and
> driving a full end-to-end demo (create trip → plan → expense split) on the
> Android emulator for **Wisconsin Dells Weekend** (2 families, 6 travelers).
> Last updated: June 2026.

---

## TL;DR

The **core is strong** — the per-family expense engine is a genuine, defensible
differentiator and it works end-to-end (push itinerary → per-family split →
settlement "who pays whom"). The gaps are almost entirely **UX flow, friction,
and polish**, not logic. The app is built *feature-first*; nearly every feature
I touched needed a follow-up pass to make it feel finished. That pattern is the
single biggest opportunity — and it's exactly what a design function fixes.

**On the design-agent question: yes, add one** — see the last section for the
specific scope, because "a designer" is too vague to be useful.

---

## What's working well (don't break these)

- **Per-family expense splitting + settlement.** The moat. "By Group" vs "By
  Person", family head carries the balance, and the **Vikram → Raj $254**
  settlement read clearly. No competitor does this.
- **Discover is genuinely rich.** Layered See/Eat/Stay map, photos, ratings,
  accessibility badges, and the **dietary filter auto-applied from the family
  profile** (Sharma = vegetarian → Veg pre-selected). That last touch is the
  kind of "it just knows" moment that sells the product.
- **Visual identity** (Refined Warm, the Icon system, warm tokens) is coherent
  and distinctive vs. the cold-blue competitors.
- **Create wizard structure** — 4 clear steps with a good progress indicator;
  saved-groups ("Sharma Family", "Gupta Family") make traveler setup one tap.

---

## Findings & friction (by flow)

### 1. Create trip
- ⚠️ **Destination autocomplete fights the user.** Typing "Wisconsin Dells, WI"
  silently resolved to *"Wisconsin River"*; clearing the field (the ✕) didn't
  reliably wipe it, so retyping inserted text mid-string. This is the very first
  thing a new user does — it should be forgiving and obvious.
- ⚠️ **The headline feature is disabled at the one moment it's promised.**
  "Plan with AI" and "Plan with Expert" show **"Soon"** on the final wizard step,
  even though a 6-agent pipeline already exists in the codebase. New users meet
  the AI pitch as a greyed-out button.
- Minor: only "Plan Manually" is selectable, yet it's not pre-selected — the
  "Create Trip" CTA sits disabled until you tap the only live option.

### 2. Planning / Discover
- ⚠️ **Planning is high-friction by hand.** Each place is: tap + → slot sheet →
  pick day → pick slot → confirm. Building a 3-day trip is dozens of taps.
  "Build a day" + auto-arrange exists to solve this, but…
- ⚠️ **Auto-arrange doesn't create expenses** on a fresh trip (expenses only
  flow once the itinerary is "pushed"), so the slickest planning path bypasses
  the moat. The two best features don't compose.
- ⚠️ **Odd time suggestions.** When a slot already had an item, the picker
  offered **"Add at 00:00"** (pre-dawn) for the morning slot.
- ⚠️ **Map pin taps are unreliable** (also true on the emulator specifically —
  Leaflet marker hit targets are tiny). Needs a larger tap target + on-device
  verification.
- Nice: hotel **nightly-rate capture** ($189 × 2 = $378) is a smart bridge to
  real costs — but it's manual and easy to skip.

### 3. Expense splitting
- ✅ Works and impresses. The friction is one step earlier:
- ⚠️ **"Move Itinerary to Splitwise" is a manual gate.** Costs you entered while
  planning don't appear in Split until you find and press this button. Most
  users will wonder why their hotel isn't showing.

### 4. Cross-cutting / stability
- ⚠️ **Responsiveness.** The app threw an **ANR ("Expo Go isn't responding")**
  during rapid navigation. Some of this is Expo-Go dev overhead, but the trend
  across the session (iOS nested-modal blank screen, map zoom-out bugs, legend
  redundancy, a confusing pin-anchor that we removed) says the same thing:
  **features ship before their edge cases and interactions are polished.**
- ⚠️ **Concept overload.** Travelers vs. Families vs. Members is a 3-layer model
  surfaced to the user; combined with the manual push-to-split step and per-slot
  adds, there's a lot to learn for a "plan a weekend" job.

---

## Prioritized improvement backlog

**P0 — friction that blocks the core story**
1. Auto-flow itinerary costs into Split (remove or auto-trigger "Move to
   Splitwise"); make auto-arrange create expenses too.
2. Fix the destination autocomplete (forgiving entry, reliable clear, no silent
   replacement).
3. Wire "Plan with AI" into the create flow, or reframe the disabled state so it
   doesn't read as "the main feature is broken."

**P1 — polish that makes it feel finished**
4. Bigger map-pin hit targets + verify pin→card on a real device.
5. Fix slot-time suggestions (no 00:00); smarter default times around existing
   items.
6. A responsiveness/perf pass; profile the navigation that triggered the ANR.

**P2 — simplification**
7. Hide the 3-layer traveler model behind a "just my family" default; reveal
   complexity only for true multi-family trips.
8. Reduce taps-to-plan (multi-add, quick "add to day", lean harder on
   auto-arrange as the default path).

---

## Do you need a Product Design Agent?

**Short answer: yes — and here's the precise scope, because "a designer" is too
broad to act on.**

Why it fits *this* app right now:
- The problems above are **not** logic bugs — they're flow, information
  architecture, interaction, and state-design problems. That's literally the
  product-design job.
- The repeating pattern ("built, then needed a UX cleanup pass") means design
  is currently happening **reactively, after** engineering. A design function
  shifts it **before/alongside** — cheaper and more consistent.
- The app's wedge is *multi-family + accessibility*, which is an
  information-architecture and edge-case-heavy problem (per-traveler needs,
  per-family money) — exactly where experienced product design earns its keep.

What to scope the agent to (so it's useful, not decorative):
1. **Flow & friction audits** — count the taps for each core job; cut them.
2. **Information architecture** — the travelers/families/members model, the
   push-to-split gate, progressive disclosure of complexity.
3. **State design** — empty / loading / error / first-run states (the demo
   exposed several rough ones).
4. **Interaction & micro-UX** — hit targets, autocomplete behavior, time
   defaults, confirmations, undo.
5. **Accessibility** — not optional here; it's a *core value prop*. Contrast,
   tap targets, screen-reader labels, the wheelchair/dietary affordances.
6. **Consistency guardrails** — enforce the Refined-Warm tokens/Icon system so
   new screens don't drift.

What it does **not** replace:
- Real users. An agent gives expert heuristics and consistency; it cannot tell
  you what *your* multi-family travelers actually struggle with. Pair it with a
  handful of real test sessions.

**Recommendation:** add a dedicated **Product-Design reviewer agent** (a custom
`.claude/agents/` subagent) scoped to the six areas above, run it as a gate on
new UI work, and keep a lightweight design-decision log. If you want, I can
author that agent definition (system prompt + when-to-use) so it plugs into this
repo's workflow the same way the engineering agents do.

---

*Voyara · internal product review · generated during a build+demo session.*
