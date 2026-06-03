# Plan one day at a time (simple, mindtrip-style)

> Replace the confusing whole-trip "+ Build a day" flow with one mental model:
> **you're always looking at one day, and everything you do lands on that day.**
> Mostly subtraction from today's screens. June 2026.

## The core loop — "plan Day 2" in 2 taps
```
Day 2 selected (you're already here)
 └ tap [Discover] (FAB)        → opens scoped to Day 2
    └ tap [+] on a place       → lands on Day 2 at a smart time (Discover stays open)
 └ tap [Done]                  → back to a filled Day 2
```
No mode switch, no basket, no arrange step, no whole-trip preview. (Today's "just
plan Tuesday" is 5+ taps and four new concepts.) The day + time are already known
(`dayIndex` is passed in; `getSuggestedTime` picks the time), so `+` adds directly.
**Hotels are the only exception** — a `stay` still opens the rate/nights sheet,
pre-pinned to the current day.

## Discover, scoped to the day
- Title becomes **"Add to Day 2 · Tue Jun 9"**; a slim day strip under it lets you
  hop Day 2→Day 3 without closing (re-scopes `dayIndex`).
- `+` on list cards AND carousel cards = **1-tap add to this day** (not "toggle
  basket"); an inline "9:00 ▾" chip retimes without a sheet.
- The map shows the search pins **plus this day's already-planned pins** (muted /
  "added") — the mindtrip "what's already on Tuesday" feel.
- "Already added" reads **"On Day 2 ✓"** (day-specific).
- Keep map, photo carousel, See/Eat/Stay layers, city picker, "search this area".

## Remove the confusing parts
Delete from Discover: the **Build a day** toggle, `selectMode`, the **basket**, the
basket bar, and the **whole-trip auto-arrange preview**. These four concepts are
the confusion.

## Keep the rule engine — but as ONE optional per-day button
Demote `autoArrange` to **"✨ Suggest a plan for this day"** on the day view (on a
thin/empty day, next to "+ Activity"). It runs the engine on a single-day view,
shows a small **inline** preview (this day only), and applies just that day. The
engine code is unchanged; only the caller is single-day.
- Trade-off: we lose the one-shot "plan my whole 7-day trip." That's acceptable —
  it's exactly the high-concept gesture that confuses. If wanted later, it belongs
  as one deliberate CTA on an **empty trip**, not a mode inside Discover.

## Day view — soften, don't rebuild
Keep Morning/Afternoon/Evening/Night, but as **non-collapsible dividers** over one
time-ordered list (drop the collapse toggles, the compact/expanded duality, the
trailing-empty logic). Keep the empty-day slot skeleton (it's the best part).
Collapse the three add affordances (header "+ Activity" + per-slot "+ Add" + FAB)
to **the Discover FAB as primary** + one "+ Activity" for manual.

## Per-day mini-map (the mindtrip signature)
A small, collapsed-by-default **"Day map" strip** at the top of the day view
showing only that day's pins; tap → opens Discover in Map view, scoped to the day.
One `DiscoverMap` component, two entry contexts. Keep it lazy so the day view
stays fast.

## Migration (smallest path — mostly subtraction)
1. Discover `+` adds to `dayIndex` in 1 tap (reuse `handleConfirmAdd` with
   `pickerDay = dayIndex`); sheet only for `stay` / behind long-press. Retitle
   "Add to {day.label}".
2. Delete basket mode (toggle, `selectMode`, `basket`, basket bar).
3. Move auto-arrange out of Discover; add the per-day "✨ Suggest a plan for this
   day" with a single-day `autoArrange` + inline preview.
4. **(separate, required)** Fix `applyArrangedActivities` to create expenses on a
   fresh trip (early-return at `store/index.js:851`) so the suggest path funds the
   per-family split — money invariants #1–4.
5. Seed the day's planned pins into Discover's map.
6. Soften slots to dividers; single add affordance.
7. Per-day mini-map strip.

## Build order
**P0 (the whole ask):** 1-tap add-to-current-day · remove Build-a-day/basket/
whole-trip preview · per-day "Suggest a plan" (single-day autoArrange) · fix
apply-creates-expenses.
**P1 (mindtrip feel):** day's pins on Discover map · per-day mini-map strip ·
soften slots.
**P2:** in-Discover day strip · inline time chip.

**Throughline: one day · one map · one add button · two taps.** Everything that
isn't that — modes, baskets, whole-trip arrange, collapsible slots — is removed or
demoted to a single optional per-day button.

*Voyara · day-by-day planning proposal · June 2026.*
