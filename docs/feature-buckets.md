# Feature Buckets — Before / During / After the Trip

> All feature work going forward, organized by the **trip lifecycle**. This is the
> canonical forward backlog; `docs/product-roadmap.md` holds the score/GTM/ship plan and
> `docs/autonomous-log.md` the running ship-log. Status: ✓ done · ▶ queued (no backend) ·
> 🔒 gated on the user (accounts/backend/$). Each bucket leads with its #1 job.

The trip phase is date-derived (`tripPhase`): **before** = today < startDate · **during** =
within dates · **after** = today > endDate. Most value here needs **no backend**.

---

## 🗺️ BEFORE — Planning the trip
**#1 job:** turn the plan into *confirmed bookings* — assign **who-books-what** across families.

**Shipped ✓**
- Add Activity redesign (4-type selector, WHEN pill row, progressive disclosure, no keyboard pop)
- Discover (Google Places) + group-fit ranking (`placeScore`) + drop-pin off-Places stops
- Lodging model (one check-in carries nights) · "How's tonight handled?" night-plan resolver · optional night address → anchors next morning · overnight-arrival anchor
- Trip Check rules incl. `unbooked_night`, `tiring_day` · per-family lodging split + "adjust if rooms differ" + balance-guard
- Planner engine: `scheduleDay`/auto-arrange · **2-opt** route refinement · phase-correct day landing
- **"Plan my day" comfort pass** — makes a day TIME-feasible (clears the meal→far-sight travel leg) + a **preview-diff** you Apply/Discard; honest "won't fit in one day" when stops are too far apart

- **`timeLocked` (lock what's booked)** — a time you set or pin survives "Plan my day" untouched (lock-on-exact-time + a 🔒 pin); the engine treats it as a fixed anchor
- **Real hotel check-in / check-out** — the planner won't schedule the room before check-in (default 3pm/11am, "tap if yours differs"); a calm "check out by X this morning" tip

**Queued ▶ (no backend)**
- Late check-in → a "share your ETA" checklist reminder (panel: NOT a scary warning) · hotel-breakfast quiet tip
- Close-time-first ordering (visit what closes first) · per-day load-balance · rule-registry refactor
- **Who-books-what**: `assignedFamilyId` + `bookingStatus` on stay/transit items (the multi-family-specific gap)
- **Pre-trip checklist** (packing/docs) seeded from the group profile (infant → stroller/formula; ♿ → confirm accessible room)
- **Readiness meter** ("70% ready: itinerary done, lodging unbooked, 2 packing items") + countdown framing (status pill ✓)
- Pre-trip **local notifications**: "3 days out — book the hotel", "starts tomorrow"

**Gated 🔒**
- AI **fill-an-empty-day** (grounded, re-validated) · seasonal hours · real hotel **pricing** (affiliate API)

---

## 🟢 DURING — Trip in progress  *(the strategic gap: 1/10 coverage, 10/10 opportunity)*
**#1 job:** keep the per-family split **LIVE** by logging real spend in-the-moment, anchored to "today".

**Shipped ✓**
- Status pill (`🟢 Day 2 of 3 · today`) + phase-aware day chips
- "Today" lens: now/next banner + "jump to today" *(active visuals pending an on-device eyeball)*

**Queued ▶ (no backend)**
- **The "Today" screen** — opens to today, current activity highlighted, next stop + travel time
- **Per-family running tally** ("you've fronted $940 · the Garcias owe you ~$210") — read-only, from `costs.js`
- **One-tap "log who paid"** — pre-fills the current activity + payer + families → the moat-builder
- Navigate the day (wire `googleMapsDayUrl` to the live day) · re-plan today (scope auto-arrange to today) · offline access to today's plan
- In-trip **local notifications**: morning "today's plan" · "log who paid" nudge · "next stop in 30 min"

**Gated 🔒**
- Real-time geo "you've arrived" nudges · live destination suggestions (backend/AI)

---

## 🧾 AFTER — Post-trip
**#1 job:** deliver the **itemized, shareable settlement** — "the Garcias owe you $312, here's why".

**Shipped ✓**
- Settlement engine (`costs.js` `calcSettlements`) · Splitwise tab · per-family balances + settlement

**Queued ▶ (no backend)**
- **The post-trip "settle up" moment** — when a trip ends, the dominant CTA shifts to the settlement
- **Trip recap / summary** (total · per-family · days · distance) via `exportPlan.js`
- **Shareable per-family settlement** (PDF/export now; web-viewable link with the backend) — *the viral loop + the retention artifact*
- "Plan the next trip" prompt (strike while the group glow is warm)
- After **local notification (SHIP FIRST)**: "Trip wrapped — settle up" (morning after `endDate`, deep-links to the settlement) — tests the whole money-owed retention thesis

**Gated 🔒**
- **Collaboration**: other families *claim* + view their share (the web-link viral loop) — needs the backend
- Server push: "the Patels logged a $90 dinner — your tally updated"

---

## 🔌 Cross-cutting enablers (unlock multiple buckets)
🔒 **Ship the free TestFlight** (the single highest-leverage move) · **Backend** (auth + keys server-side + catalog DB + sync/collaboration) · **Real data** (OSRM/Routes behind `travelLeg`; Booking.com affiliate pricing) · **EAS dev build** (required for push notifications) · ✓ CI + honest lint baseline.

---

## How the buckets map to the score (see product-roadmap.md §10)
- BEFORE is strong today (8/10 coverage) — polish + who-books-what.
- DURING + AFTER are the **score-moving** buckets (1/10 and 3/10 coverage) and the **moat's unassailable middle**: the lunch logged *during* flows into the settlement shared *after* — same data, three phases.
- The headline 0.5 jumps (→7.0 and up) are gated on **shipping + backend**; the no-backend During/After work makes those jumps *real the moment you ship*.
