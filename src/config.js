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
 *   2. Replace null below with your key: 'sk-ant-...'
 *   3. For production, move this to a backend — never ship API keys in a mobile app.
 */

export const CLAUDE_MODEL   = 'claude-haiku-4-5-20251001';
export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Free tier quotas
export const FREE_AI_PLANNER_USES = 1;   // AI itinerary generations on trip creation
export const FREE_AI_REVIEW_USES  = 3;   // AI chat / trip review sessions

// Pro plan pricing
export const PRO_MONTHLY_PRICE = '$4.99';
export const PRO_ANNUAL_PRICE  = '$39.99'; // ~$3.33/month

// Feature gates (flip to true to simulate Pro locally)
export const BYPASS_SUBSCRIPTION = false;
