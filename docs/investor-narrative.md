# Voyara — Investor Narrative (one-pager)

> A current, self-contained pitch narrative drawing on the product as-built + the market analyses
> (`planner-market-analysis.md`, `ai-planner-market-analysis.md`). Supersedes the older
> `docs/pitch-onepager.md` for messaging. Figures are estimate ranges (see the analyses for the
> assumptions + confidence) — verify before any external deck.

---

**Voyara — the operating system for group travel.**

### The problem
When **multiple families or friends travel together**, the trip is run across **WhatsApp,
Splitwise, Google Docs, OTA confirmation emails, and a group chat** — and the money is a mess,
because costs **don't split equally**: hotels split by *rooms × nights*, transit by *family size*.
No tool plans the trip, runs it day-of, *and* settles the money fairly. Group travel is one of the
fastest-growing leisure segments — and the worst-served.

### The insight
Don't compete on *generating* itineraries (AI does that for free; OTAs + frontier labs own it).
**Own the execution + the group/money layer** — the part that's painful, defensible, and that no
advisor tool, OTA, or AI planner does.

### The product (built, working, test-gated)
- **The expense moat** — automatic per-family / per-room splitting + settlement. Nobody else has it.
- **A deterministic planning engine** — Trip Check, auto-arrange, route + opening-hours aware (no
  LLM cost, fully unit-tested).
- **Timezone-aware live trip** — per-stop zones, cross-zone flight labels, "open to now," auto-locks
  the past — keeps the group on track without cross-checking five apps.
- **Smart Packing, Trip Wrapped recap** — anticipatory, delightful touches.
- **AI-agnostic by design** — *Smart Paste* ingests any ChatGPT/Gemini/blog plan into a real trip,
  so we ride the AI wave as **input**, not a competitor.
- ~680 automated tests; iOS-first (Expo); privacy-forward (an asset for EU/GDPR).

### Why now
Post-COVID surge in **multi-gen / group travel**; free AI made *generation* a commodity (so the
value moved to execution); the human **travel-advisor channel rebounded** and runs on PDFs +
spreadsheets — ripe for a modern, group-native tool.

### Market (see analyses for math + confidence)
- **Plan-with-a-Planner** (the business): advisor-booked travel **TAM ~$300–450B GMV**; monetizable
  planning layer **~$35–60B**; independent-advisor + group/family **SAM ~$5–12B**; **obtainable SOM
  ~$40–250M ARR** at scale (lever = trip liquidity, not price).
- **Plan-with-AI**: large but **not capturable standalone** (free substitutes; value to model
  owners + OTAs) → we treat it as a **feature, not a line of business**.
- **Untapped?** ~6.5/10 white space — the *human planner + execution + multi-family split + on-trip*
  intersection is unowned (TravelJoy/Tern/Fora miss the group+money+traveler layer; OTAs only book;
  AI planners only generate; Splitwise/WhatsApp don't plan).

### Business model
1. **Advisor SaaS** (beachhead) — $40–70/advisor/mo for the group-execution tool their clients love.
2. **Marketplace take-rate** (the prize) — ~1.5–3% of group-trip GMV once supply+demand liquid.
3. Consumer **Pro** tier (recap/memories, premium assists) — secondary.
> Built-in CAC advantage: the **settlement recap is shared to the other families on the trip.**

### GTM (regional priority)
**Americas (US) #1** (deepest advisor culture, highest WTP, one English market) → **Europe #2**
(group/family + GDPR-fit; package-heavy, so enter via multi-family) → **Asia #3 / long game**
(India first — multi-gen family culture makes the split moat acute; OTA-dominant, volume play).

### Status & ask
- **Status:** product core built + tested; pre-TestFlight (free + local); no backend yet (Phase 2
  moves keys server-side, adds auth/sync).
- **Validation next (cheap, pre-scale):** 15–20 US advisor interviews on WTP; pre-sell 5–10 real
  group trips through Voyara to prove take-rate economics.
- **The ask / posture:** SaaS-only is bootstrappable to ~$5–10M ARR; the marketplace prize
  ($50–250M) is venture-scale — raise sized to the liquidity build, not the tool.

### The honest one-liner
**Voyara turns any trip plan — human or AI — into a trip a group can actually run together, and
settles the money fairly. We don't fight AI on planning; we own what happens after.**

*Estimate ranges; see the market-analysis docs for assumptions + confidence. 2026-06.*
