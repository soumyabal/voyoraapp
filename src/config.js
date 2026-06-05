/**
 * config.js — Voyara AI & Billing Configuration
 *
 * Billing model:
 *   Free account — 1 free AI Trip Plan (AI-generated itinerary on creation)
 *                  3 free AI Trip Reviews (AI chat per trip)
 *   Pro plan     — Unlimited AI plans + reviews ($4.99/month)
 *
 * To enable real Claude AI:
 *   1. Get an API key at console.anthropic.com
 *   2. For development, provide it from a local safe source.
 *   3. For production, move API keys to a backend — never ship them in a mobile app.
 */
// ─── App identity ───────────────────────────────────────────────────────────
// The product's display name. Rename the app here (e.g. 'Voymiro') and it updates
// everywhere it's shown to users and used in AI prompts — one line, no code hunt.
// ⚠️ This does NOT (and must not) change two load-bearing identifiers:
//    · the native app name in app.json
//    · the AsyncStorage persist key 'voyara-storage' in src/store/index.js
//      (changing that key wipes every existing user's saved trips).
export const APP_NAME = 'Voyara';

export const CLAUDE_API_KEY          = null;
export const CLAUDE_MODEL            = 'claude-haiku-4-5-20251001';
export const GOOGLE_PLACES_API_KEY   = 'AIzaSyCSNyoh6JVdOi2GxZmvmhTnRTk5SZ0X0SA';

// ─── Release flags ────────────────────────────────────────────────────────────
// Controls which planning modes are available to users.
// v1.0 launch: Manual Planner + Family Splitwise only.
// Flip a flag to true to enable a feature in a future release.
export const RELEASE_FLAGS = {
  manualPlanner:    true,   // ✅ v1.0 — core launch feature
  aiPlanner:        false,  // 🔜 v2.0 — requires backend + Claude API server-side
  expertMode:       false,  // 🔜 v3.0 — requires consultant network
  aiReview:         false,  // 🔜 v2.0 — in-trip AI chat review
  distanceWarnings: true,   // ✅ feature ready — user-facing toggle controls actual on/off
                            //    (store.preferences.distanceCheckEnabled)
                            //    Set false here only to hide the feature entirely in a build.
  accounts:         false,  // 🔜 freemium — real sign-up/login + cloud sync. OFF for the
                            //    free/local TestFlight build (hides the demo Sign In UI so
                            //    there's no non-functional placeholder). Flip on with the
                            //    Phase-2 backend; the auth code stays in place meanwhile.
};
export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Free tier quotas
export const FREE_AI_PLANNER_USES = 1;   // AI itinerary generations on trip creation
export const FREE_AI_REVIEW_USES  = 3;   // AI chat / trip review sessions

// Pro plan pricing
export const PRO_MONTHLY_PRICE = '$4.99';
export const PRO_ANNUAL_PRICE  = '$39.99'; // ~$3.33/month

// ─── Booking deep-links (affiliate revenue) ──────────────────────────────────
// "Book" on a hotel card opens a Booking.com SEARCH for that specific hotel. Drop the
// owner's real Booking Affiliate Partner ID into `aid` to attribute commissions; with
// aid:null the link still works (an unattributed public search). ⚠️ The affiliate
// ACCOUNT + program approval is the owner's to set up (join.booking.com), and the
// "we may earn a commission" disclosure must be added to the app's terms before going
// live — this is only the link wiring.
export const BOOKING_AFFILIATE = { provider: 'booking', aid: null };

// Feature gates (flip to true to simulate Pro locally)
export const BYPASS_SUBSCRIPTION = false;
