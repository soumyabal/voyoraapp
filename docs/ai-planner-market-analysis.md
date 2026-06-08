# "Plan with AI" — Market Analysis + Planner vs AI Side-by-Side

> Companion to `planner-market-analysis.md`. Sizes the **AI-generates-the-itinerary** vision and
> compares it head-to-head with the human-planner vision. Same method: estimate ranges from
> training-data industry knowledge (through early 2026), transparent assumptions, confidence flags
> (⬤ solid · ◐ directional · ○ speculative). No live web calls (honors confidentiality guardrails).

---

## 0. TL;DR — the uncomfortable truth

**"Plan with AI" is a feature, not a business.** The market looks enormous, but almost none of it
is *capturable* by a standalone AI-planner because:
1. **Free substitutes** — ChatGPT/Gemini already plan trips for free. Consumer willingness-to-pay
   for "AI that makes an itinerary" is **near zero**.
2. **Value accrues to the model owner + the booking owner**, not the planning UI — OpenAI/Google
   capture the model layer; Booking/Expedia/Trip.com capture the *booking* (where the money is).
3. **It's the most crowded, best-funded arena in travel** — Mindtrip, Layla, Wonderplan, Roam
   Around + every OTA's in-house AI (Expedia Romie, Booking AI Trip Planner, Trip.com TripGenie,
   Kayak, Google) + the frontier labs themselves.

**Your instinct was right.** The winning move is the one already in Voyara: **consume** AI output
(Smart Paste) and monetize **execution + the group/expense layer** — *not* compete on generation.

| | **Plan with AI** (generate) | **Plan with a Planner** (human + execution) |
|---|---|---|
| Apparent TAM | Huge (all trips) | Large (~$300–450B advisor GMV) |
| **Capturable** revenue | **Thin** (free substitutes, OTA/model owners take it) | **Real** (fees + take-rate, ~$5–12B SAM) |
| Competition | Brutal (frontier labs + OTAs + VC crowd) | Moderate (fragmented advisor tools) |
| Defensibility | ○ Low (commodity) | ◐ Medium (trust, relationships, the split moat) |
| Unit economics | ○ Poor (subsidized) | ◐ Good (high-margin SaaS + take-rate) |
| Voyara's right role | **Feature** (ingest via Smart Paste; thin assist) | **The business** |
| Realistic 5–7yr ARR if pursued *standalone* | **~$2–15M** (subsidized, fragile) | **~$40–250M** |

---

## 1. The market, in layers (and why the funnel collapses)

```
Leisure trips that *could* be AI-planned                         ~billions/yr   (vanity TAM)
  └─ "AI in travel" market (Statista/MMR-type reports)           ~$1–3B (2024) → ~$10–15B (2030) ◐
        ⚠ mostly ops: dynamic pricing, chatbots, fraud, ad-tech — NOT consumer planning revenue
  └─ Consumer AI trip-planning DIRECT revenue (today)            ~tens of $M, mostly VC-subsidised ○
        └─ Monetisable only two ways, both weak for a newcomer:
             • Subscription → WTP ≈ $0 (ChatGPT is free)         ○
             • Affiliate/booking commission → you become a thin OTA  ◐
                  (online travel ~$600–700B ⬤, but you're a tiny entrant vs Booking/Expedia/Google)
```

**The collapse:** a huge top funnel, ~$0 capturable at the bottom for a standalone app. The money
is in the **booking** (OTA economics) or the **model** (frontier labs) — neither of which a
planning UI owns.

---

## 2. Bottom-up: what a standalone "Plan with AI" could realistically make

```
Path 1 — Subscription
  Users who'd pay for AI planning (vs free LLM)   ~1–3% of triers      ○ (very low)
  Price                                           ~$5–10/mo            ○
  → 100k paying users × $8 × 12  ≈ $9.6M ARR  — but acquiring 100k payers against free is brutal + costly

Path 2 — Affiliate / booking commission (become a thin OTA)
  Trips you influence → actually booked through you (conversion)   ~2–8%   ◐ (planning ≠ booking intent)
  Commission on booked GMV                                         ~4–12%  ◐
  → 500k influenced trips × 5% booked × $3k × 8%  ≈ $6M  — needs huge top-funnel + you fight OTAs for the booking
```
Either path tops out single-digit to low-double-digit millions **and** is structurally fragile
(subsidy-dependent, no moat). This is why most consumer AI-planner startups are racing to either
(a) get acqui-hired, or (b) pivot to owning bookings (OTA) — capital-heavy, incumbent-dominated.

---

## 3. Regional note (brief — the conclusion is the same everywhere)
- **Americas / Europe:** free LLMs + OTA AI saturate; standalone paid AI planning has no oxygen.
- **Asia:** OTAs (Trip.com TripGenie, MakeMyTrip) are embedding AI into *booking* fast — they'll
  own AI planning as a funnel into their inventory. A standalone can't out-distribute them.
- Net: **no region rewards a standalone AI-planner**; every region rewards **execution + group +
  trust** layered on top of (free) AI generation.

---

## 4. So what SHOULD Voyara do with AI? (the feature, done right)
AI is a **cost center to delight users**, not a revenue line:
1. **Smart Paste (already built)** — ingest any AI/LLM/blog itinerary → a real Voyara trip. You
   ride the entire free-AI wave as *input* instead of competing. ★ the key move.
2. **Thin, optional "enhance" assists** (later, flag-gated, cost-controlled) — "fill this gap,"
   "suggest a dinner near here" — small, server-side, behind the Pro tier. Never the core promise.
3. **Never** try to be the destination for *generating* a plan from scratch — that's a race to the
   bottom against ChatGPT + OTAs you can't win.

**Strategic conclusion:** Put ~0% of the business model on AI generation; put ~100% of the AI
*effort* into ingestion + execution polish. The durable, defensible, monetisable business is
**Plan-with-a-Planner + group execution + the expense moat.**

---

## 5. Honest confidence
- "Free substitutes kill consumer WTP for AI planning" — ⬤ high confidence (structural).
- "AI value accrues to model owners + OTAs" — ⬤ high.
- Specific AI-market $ figures — ◐ directional (definitions blur ops vs consumer).
- The standalone-AI SOM math — ○ scenario, illustrative.
- Estimates from training knowledge (early 2026), not live-pulled.

*Voyara · "Plan with AI" analysis + Planner-vs-AI · 2026-06*
