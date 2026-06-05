/**
 * config.example.js — TEMPLATE for src/config.js (which is gitignored / never committed).
 *
 * On a fresh checkout, copy this file to `src/config.js` and fill in your real keys:
 *     cp src/config.example.js src/config.js      (jest does this automatically — see
 *                                                   scripts/ensure-config.js)
 * Keep real API keys ONLY in src/config.js (local). Never put a live key in this file.
 *
 * Billing model:
 *   Free account — 1 free AI Trip Plan, 3 free AI Trip Reviews
 *   Pro plan     — Unlimited ($4.99/month)
 */
// ─── App identity ───────────────────────────────────────────────────────────
// The product's display name. Updates everywhere it's shown to users + AI prompts.
// ⚠️ Does NOT change the native app name in app.json or the AsyncStorage persist
//    key 'voyara-storage' in src/store/index.js (changing that key wipes saved trips).
export const APP_NAME = 'Kithova';

export const CLAUDE_API_KEY          = null;
export const CLAUDE_MODEL            = 'claude-haiku-4-5-20251001';
export const GOOGLE_PLACES_API_KEY   = ''; // ← put your real key in src/config.js, not here

// ─── Release flags ────────────────────────────────────────────────────────────
export const RELEASE_FLAGS = {
  manualPlanner:    true,   // ✅ v1.0 — core launch feature
  aiPlanner:        false,  // 🔜 v2.0 — requires backend + Claude API server-side
  expertMode:       false,  // 🔜 v3.0 — requires consultant network
  aiReview:         false,  // 🔜 v2.0 — in-trip AI chat review
  distanceWarnings: true,   // ✅ feature ready — user toggle controls actual on/off
  accounts:         false,  // 🔜 freemium — OFF for the free/local TestFlight build
};
export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Free tier quotas
export const FREE_AI_PLANNER_USES = 1;
export const FREE_AI_REVIEW_USES  = 3;

// Pro plan pricing
export const PRO_MONTHLY_PRICE = '$4.99';
export const PRO_ANNUAL_PRICE  = '$39.99';

// ─── Booking deep-links (affiliate revenue) ──────────────────────────────────
// Drop the owner's real Booking Affiliate Partner ID into `aid` to attribute commissions.
export const BOOKING_AFFILIATE = { provider: 'booking', aid: null };

// Feature gates (flip to true to simulate Pro locally)
export const BYPASS_SUBSCRIPTION = false;
