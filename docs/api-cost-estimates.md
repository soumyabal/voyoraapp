# API Cost Estimates — Claude + Google (Voyara COGS)

> Estimates from training-data pricing (through early 2026). **Not live-pulled** (no web calls —
> honors confidentiality guardrails). Prices change; Google Maps Platform changed its free-tier
> model in 2025. **Verify on the live pricing pages before budgeting.** All figures are ballpark
> ranges with the math shown.

---

## 0. The punchline
- **Claude is negligible. Google Places dominates (~95%+ of API COGS).**
- A paste/AI action costs **~1–4¢**; a trip's Discover usage costs **~$1–3** (Google).
- So: the AI features are cheap to run; the **map/places data is the real cost** — and you already
  blunt it (Leaflet+OSM map = free, Wikipedia hero = free, Places calls are cached).

---

## 1. Claude API (Anthropic) — extraction + AI assists

**Model pricing (per million tokens, MTok) — ballpark, verify:**
| Model | Input | Output |
|---|---|---|
| Haiku-class (`claude-haiku-4-5`, what Voyara configures) | ~$1 / MTok | ~$5 / MTok |
| Sonnet-class | ~$3 / MTok | ~$15 / MTok |
| Opus-class | ~$15 / MTok | ~$75 / MTok |
*(Prompt caching can cut repeated system-prompt input ~90% — worth using.)*

**Per-action cost (using Haiku):**
| Action | ~Input tok | ~Output tok | **Cost / call** |
|---|---|---|---|
| **Smart Paste extraction** (text → JSON) | ~2,500 | ~1,000 | **~$0.0075** (under 1¢) |
| **AI itinerary generation** (full plan) | ~6,000 | ~3,000 | **~$0.02** |
| **AI chat / review** (per message) | ~2,000 | ~800 | **~$0.006** |

Math: cost = in×$1/1e6 + out×$5/1e6. Even on Sonnet, Smart Paste ≈ **$0.02–0.03**. Tiny.

---

## 2. Google Maps Platform — the real cost (Discover/Places)

**Per-call pricing (per 1,000 requests) — ballpark, verify (2025 SKU changes!):**
| SKU (what Voyara uses) | ~Price / 1,000 | **/ call** |
|---|---|---|
| **Text Search (New)** — Discover search (with Pro fields: rating, types, accessibility…) | ~$32–40 | **~$0.032–0.040** |
| **Place Photos** — card/hero images | ~$7 | **~$0.007** |
| **Geocoding / reverse-geocode** — origin, address lookups | ~$5 | **~$0.005** |
| Place Details (New), if used | ~$17+ (Basic) | ~$0.017+ |
| **Map tiles** | **$0 — Leaflet + OpenStreetMap (not Google Maps SDK)** | free |

**Free tier:** historically a **$200/mo credit** (~6,000 Text Searches) ⚠ Google moved toward a
**per-SKU free monthly allotment** in 2025 (e.g. thousands of free calls/SKU/mo) — **verify the
current model**, it materially changes small-scale cost.

**Per actively-planned trip (rough, after caching):**
```
Text Searches (browse cities/areas/filters, cached per query×area)  ~25–40 × $0.035 ≈ $0.90–1.40
Place Photos (cards + heroes, lazy-loaded)                          ~30–60 × $0.007 ≈ $0.20–0.40
Geocoding (origin + a few addresses)                                ~3–8  × $0.005 ≈ $0.02–0.04
                                                            ──────────────────────────────────
                                            ≈ $1.10–1.85 / trip  (heavy planners up to ~$3)
```
The AI pipeline (StayAgent/ExperienceAgent, flag-OFF today) adds more Text Searches if enabled.

---

## 3. Blended cost per trip + at-scale

**Per actively-planned trip (AI features ON):**
| Component | Cost |
|---|---|
| Google Places (Discover) | ~$1.10–1.85 |
| Claude — 1 Smart Paste + ~3 chat msgs | ~$0.03 |
| Claude — 1 AI generation (if used) | ~$0.02 |
| **Total** | **~$1.15–1.90 / trip** (Google = ~97%) |

**At scale (actively-planned trips/mo, before free tiers):**
| Trips/mo | Google (~$1.50) | Claude (~$0.05) | **Total / mo** |
|---|---|---|---|
| 1,000 | ~$1,500 | ~$50 | **~$1,550** |
| 10,000 | ~$15,000 | ~$500 | **~$15,500** |
| 100,000 | ~$150,000 | ~$5,000 | **~$155,000** |

*(Free tiers offset the low end materially — at 1k/mo a chunk may be free; at 100k it's negligible
against the bill.)*

**Reading it for pricing:** a Pro tier needs to clear **~$1.50–3 of API COGS per active trip** plus
margin. At ~$1.90/trip COGS, a $5–10 Pro trip price or a modest subscription comfortably covers it.

---

## 4. Cost-control levers (most already in place)
- ✅ **Free map** — Leaflet + OSM (not Google Maps SDK) → the usually-biggest Maps cost is $0.
- ✅ **Cache Places** per query×area (already done) — don't defeat it.
- ✅ **Lazy photo loads** + the `refreshPhotoKey` cache.
- ✅ **AI flag-gated OFF** today — zero Claude spend until enabled.
- ▶ **Prompt caching** (Anthropic) for the extraction/system prompt — ~90% off repeat input.
- ▶ **Hash-cache Smart Paste** by text → re-imports free; near-duplicate pastes free.
- ▶ **Server-side proxy (Phase 2)** — keys off-device + central **rate limiting + quotas + per-user
  caps** so a runaway client can't run up the bill. Also enables a shared resolved-place cache.
- ▶ **Field-mask discipline** on Text Search — request only needed fields (Pro fields cost more).
- ▶ **Debounce/coalesce** Discover searches (already fires only on real input changes).

---

## 5. Honest confidence
- Claude per-token + per-action: ◐ directional (model prices shift; Haiku 4.5 exact price unverified).
- Google per-SKU: ◐ directional, and the **free-tier model changed in 2025** — ⚠ verify.
- Per-trip + at-scale: ○ scenario math — depends on real Discover-call volume per user (instrument
  it in-app to replace these guesses with measured numbers).

**Action:** add lightweight telemetry (count Places calls + Claude tokens per trip) so within a few
weeks of real use you replace every estimate here with measured COGS.

*Voyara · API cost estimates · estimates, verify live · 2026-06*
