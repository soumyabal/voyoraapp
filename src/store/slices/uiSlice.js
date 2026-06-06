/**
 * uiSlice — session/navigation, the user account & subscription, per-trip chat
 * history, and user preferences setters.
 *
 * Part of the Zustand slices split: a `(set, get) => ({...actions})` factory
 * spread into the single persisted store in ../index.js. set/get operate on the
 * FULL merged store, so behaviour is identical to the former inline definitions.
 * The corresponding state (currentTripId/currentDay/planMode/account/subscription/
 * chatHistory/preferences/planDayNoteSeen) is declared in ../index.js.
 */
export const createUiSlice = (set, get) => ({
  // ── GETTERS (computed) ──────────────────────────────────
  getCurrentTrip: () => {
    const { trips, currentTripId } = get();
    return trips.find(t => t.id === currentTripId) || null;
  },

  // ── NAVIGATION ──────────────────────────────────────────
  // Phase-1 planner: always open a trip on Day 1 (no live "active day" tracking).
  setCurrentTrip: (tripId) => set({ currentTripId: tripId, currentDay: 0 }),
  setCurrentDay: (day) => set({ currentDay: day }),
  setPlanMode: (mode) => set({ planMode: mode }),
  markPlanDayNoteSeen: () => set({ planDayNoteSeen: true }),

  // ── USER PREFERENCES ────────────────────────────────────
  // distanceCheckEnabled: user-facing toggle (default off — has API cost).
  // Separate from RELEASE_FLAGS.distanceWarnings which is the dev master switch.
  setDistanceCheckEnabled: (enabled) => set(s => ({
    preferences: { ...s.preferences, distanceCheckEnabled: enabled },
  })),

  // ── ACCOUNT ───────────────────────────────────────────────
  signUp: (name, email) => {
    set({
      account: { loggedIn: true, name, email, aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
    });
  },

  signIn: (email) => {
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() || 'Traveler';
    set({
      account: { loggedIn: true, name, email, aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
    });
  },

  signOut: () => set({
    account: { loggedIn: false, name: '', email: '', aiPlannerUsed: false, aiReviewsUsed: 0, plan: 'free' },
  }),

  // Use the 1 free AI trip plan (called when creating a trip with AI mode)
  useAIPlannerCredit: () => set(s => ({
    account: { ...s.account, aiPlannerUsed: true },
  })),

  // Use one of the 3 free AI trip reviews (called when opening AI chat for a trip)
  useAIReview: () => set(s => ({
    account: { ...s.account, aiReviewsUsed: Math.min(s.account.aiReviewsUsed + 1, 99) },
  })),

  // ── SUBSCRIPTION ────────────────────────────────────────
  upgradeToPro: () => set(s => ({
    subscription: { ...s.subscription, plan: 'pro', upgradedAt: new Date().toISOString() },
    account: { ...s.account, plan: 'pro' },
  })),

  useFreeAIMessage: () => set(s => ({
    subscription: { ...s.subscription, aiMessagesUsed: s.subscription.aiMessagesUsed + 1 },
  })),

  resetToFree: () => set(s => ({
    subscription: { plan: 'free', aiMessagesUsed: 0, upgradedAt: null },
    account: { ...s.account, plan: 'free', aiPlannerUsed: false, aiReviewsUsed: 0 },
  })),

  // ── CHAT HISTORY ─────────────────────────────────────────
  addChatMessage: (tripId, message) => set(s => {
    const prev = s.chatHistory[tripId] || [];
    return { chatHistory: { ...s.chatHistory, [tripId]: [...prev, message] } };
  }),

  clearChatHistory: (tripId) => set(s => {
    const next = { ...s.chatHistory };
    delete next[tripId];
    return { chatHistory: next };
  }),
});
