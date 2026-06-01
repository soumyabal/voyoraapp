/**
 * AgenticPlannerModal.js — Voyara Agentic Trip Planner
 *
 * Phases:
 *   dream   → Full-screen NL input: "Describe your dream trip..."
 *   agents  → Live card-per-agent visualization (pending → running → done)
 *   review  → Rich results: hotel card · budget card · transit card · itinerary
 *   applying → Writing to store
 *
 * Chat overlay (showChat): full-screen dark chat interface on top of review.
 *   - Same dark gradient as the dream input screen
 *   - Running message history: user bubbles + agent response bubbles
 *   - Trip context pills at the top (destination · days · travellers)
 *   - Agent greeting auto-generated after the first plan is ready
 *   - Each refinement adds a user bubble then an agent acknowledgement bubble
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Animated, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useStore, { showToast } from '../store';
import { callPlannerAPI, planSummary } from '../utils/plannerAPI';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import { fmt, fmtM, getAllMembers } from '../utils/helpers';

// ─── Natural language parser ──────────────────────────────────────────────────

function parseNaturalLanguage(text) {
  const lower = text.toLowerCase();

  // Pace
  let pace = 'moderate';
  if (/\b(relaxed|slow|easy|leisurely|laid.?back|chill|unhurried)\b/.test(lower)) pace = 'relaxed';
  else if (/\b(packed|busy|action.?packed|full|jam.?packed|intense|non.?stop|everything)\b/.test(lower)) pace = 'packed';

  // Budget
  let budget = 'mid-range';
  if (/\b(luxury|luxurious|premium|high.?end|splurge|5.?star|five.?star|lavish|indulge)\b/.test(lower)) budget = 'luxury';
  else if (/\b(budget|cheap|affordable|economical|backpack|frugal|low.?cost|inexpensive)\b/.test(lower)) budget = 'budget';

  // Focus
  const focus = [];
  if (/\b(beach|ocean|surf|swim|coastal|seaside|sand|snorkel)\b/.test(lower) && !focus.includes('outdoors')) focus.push('outdoors');
  if (/\b(food|eat|culinary|restaurant|cuisine|foodie|dining|gastro|taste|local food)\b/.test(lower)) focus.push('food');
  if (/\b(culture|museum|art|history|heritage|exhibit|gallery|architecture)\b/.test(lower)) focus.push('culture');
  if (/\b(shop|mall|boutique|market|souvenir|retail)\b/.test(lower)) focus.push('shopping');
  if (/\b(kid|child|children|family|toddler|infant|baby)\b/.test(lower) && !focus.includes('family')) focus.push('family');
  if (/\b(nightlife|bar|club|night|party|cocktail|evening)\b/.test(lower)) focus.push('nightlife');
  if (/\b(hike|hiking|nature|outdoor|park|trail|wildlife|camping|adventure)\b/.test(lower) && !focus.includes('outdoors')) focus.push('outdoors');

  return { pace, budget, focus, notes: text };
}

// ─── Agent config ─────────────────────────────────────────────────────────────

const AGENT_CONFIG = [
  {
    id: 'FamilyProfileAgent',
    emoji: '👨‍👩‍👧',
    label: 'Family Profiler',
    description: 'Analysing your group, accessibility needs & interests',
    doneLabel: (d) => d?.summary || 'Group profile built',
    parallel: false,
  },
  {
    id: 'StayAgent',
    emoji: '🏨',
    label: 'Stay Agent',
    description: 'Finding family-friendly hotels & accessible rooms',
    doneLabel: (d) => d?.summary || 'Hotels ranked',
    parallel: true,
  },
  {
    id: 'ExperienceAgent',
    emoji: '🎯',
    label: 'Experience Agent',
    description: 'Scoring activities by age, interests & accessibility',
    doneLabel: (d) => d?.summary || 'Experiences scored',
    parallel: true,
  },
  {
    id: 'TransitAgent',
    emoji: '🚗',
    label: 'Transit Agent',
    description: 'Planning transport, routes & multi-city logistics',
    doneLabel: (d) => d?.summary || 'Routes mapped',
    parallel: true,
  },
  {
    id: 'FamilyBudgetAgent',
    emoji: '💰',
    label: 'Budget Agent',
    description: 'Computing per-family costs with 12% buffer',
    doneLabel: (d) => d?.summary || 'Budget ready',
    parallel: false,
  },
  {
    id: 'ItineraryAgent',
    emoji: '✨',
    label: 'Itinerary Agent',
    description: 'Synthesising all agent data into your day-by-day plan',
    doneLabel: (d) => d?.summary || 'Itinerary built',
    parallel: false,
  },
];

// ─── PulsingDot ───────────────────────────────────────────────────────────────

function PulsingDot({ color = colors.primary }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: anim }} />
  );
}

// ─── TypingDots — animated indicator while agent is processing ────────────────

function TypingDots() {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    dots.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 4 }}>
      {dots.map((anim, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)', opacity: anim }} />
      ))}
    </View>
  );
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

function AgentCard({ config, state }) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (state.status !== 'pending') {
      Animated.parallel([
        Animated.timing(fadeIn,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideIn, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [state.status]);

  const isDone    = state.status === 'done';
  const isRunning = state.status === 'running';
  const isPending = state.status === 'pending';
  const isError   = state.status === 'error';

  return (
    <View style={[ag.card, isDone && ag.cardDone, isRunning && ag.cardRunning, isError && ag.cardError]}>
      <View style={ag.iconWrap}>
        <Text style={ag.emoji}>{config.emoji}</Text>
      </View>
      <View style={ag.body}>
        <Text style={[ag.label, isDone && { color: colors.green }, isRunning && { color: colors.primary }]}>
          {config.label}
        </Text>
        {isPending && <Text style={ag.sub}>{config.description}</Text>}
        {isRunning && <Text style={[ag.sub, { color: colors.primary }]}>{config.description}</Text>}
        {isDone && (
          <Animated.Text style={[ag.doneText, { opacity: fadeIn, transform: [{ translateY: slideIn }] }]}>
            {config.doneLabel(state.data)}
          </Animated.Text>
        )}
        {isError && <Text style={[ag.sub, { color: colors.red }]}>Fell back to local planner</Text>}
      </View>
      <View style={ag.status}>
        {isPending && <View style={ag.pendingDot} />}
        {isRunning && <PulsingDot color={colors.primary} />}
        {isDone    && <Text style={ag.checkmark}>✓</Text>}
        {isError   && <Text style={ag.errorMark}>!</Text>}
      </View>
    </View>
  );
}

const ag = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  cardRunning: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  cardDone:    { borderColor: '#b2dfdb', backgroundColor: colors.greenLight },
  cardError:   { borderColor: colors.red + '40', backgroundColor: colors.redLight },
  iconWrap:    { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  emoji:       { fontSize: 18 },
  body:        { flex: 1 },
  label:       { ...typography.smallBold, color: colors.text, marginBottom: 2 },
  sub:         { ...typography.caption, color: colors.muted, lineHeight: 15 },
  doneText:    { ...typography.caption, color: colors.green, fontWeight: '700', lineHeight: 15 },
  status:      { width: 22, alignItems: 'center' },
  pendingDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  checkmark:   { fontSize: 14, color: colors.green, fontWeight: '800' },
  errorMark:   { fontSize: 14, color: colors.red, fontWeight: '800' },
});

// ─── HotelCard ────────────────────────────────────────────────────────────────

function HotelCard({ hotel, roomsNeeded }) {
  if (!hotel) return null;
  return (
    <View style={rv.insightCard}>
      <View style={rv.insightHeader}>
        <Text style={rv.insightIcon}>🏨</Text>
        <Text style={rv.insightTitle}>Recommended Hotel</Text>
      </View>
      <Text style={rv.insightMain}>{hotel.name}</Text>
      <Text style={rv.insightSub}>${hotel.pricePerRoom}/room · {roomsNeeded} room{roomsNeeded !== 1 ? 's' : ''} needed</Text>
      {(hotel.fitReasons || []).length > 0 && (
        <View style={rv.tagRow}>
          {hotel.fitReasons.slice(0, 3).map((r, i) => (
            <View key={i} style={rv.tag}><Text style={rv.tagText}>✓ {r}</Text></View>
          ))}
        </View>
      )}
      {(hotel.amenities || []).length > 0 && (
        <Text style={rv.insightNote}>{hotel.amenities.slice(0, 3).join(' · ')}</Text>
      )}
    </View>
  );
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────

function BudgetCard({ budgetByFamily, totalBudget }) {
  if (!budgetByFamily?.length) return null;
  return (
    <View style={rv.insightCard}>
      <View style={rv.insightHeader}>
        <Text style={rv.insightIcon}>💰</Text>
        <Text style={rv.insightTitle}>Budget by Family</Text>
        <Text style={rv.insightTitleRight}>${(totalBudget || 0).toLocaleString()} total</Text>
      </View>
      {budgetByFamily.map(f => (
        <View key={f.familyId} style={rv.budgetRow}>
          <View style={[rv.famDot, { backgroundColor: f.familyColor || colors.primary }]} />
          <Text style={rv.budgetFamName}>{f.familyName}</Text>
          <View style={{ flex: 1 }} />
          <Text style={rv.budgetAmount}>${f.total.toLocaleString()}</Text>
        </View>
      ))}
      <Text style={rv.insightNote}>Includes accommodation, transport, meals, activities + 12% buffer</Text>
    </View>
  );
}

// ─── TransitCard ──────────────────────────────────────────────────────────────

function TransitCard({ transitResult }) {
  if (!transitResult) return null;
  const local = transitResult.local;
  return (
    <View style={rv.insightCard}>
      <View style={rv.insightHeader}>
        <Text style={rv.insightIcon}>🚗</Text>
        <Text style={rv.insightTitle}>Getting Around</Text>
      </View>
      {local?.recommended && <Text style={rv.insightMain}>{local.recommended}</Text>}
      {local?.note && <Text style={rv.insightSub} numberOfLines={2}>{local.note}</Text>}
      {transitResult.multiCity && (
        <View style={[rv.tag, { marginTop: spacing.sm, alignSelf: 'flex-start' }]}>
          <Text style={rv.tagText}>🗺️ Multi-city: {transitResult.multiCity.map(l => l.city).join(' → ')}</Text>
        </View>
      )}
      {(local?.accessNotes || []).length > 0 && (
        <Text style={[rv.insightNote, { color: colors.primary }]}>♿ {local.accessNotes[0]}</Text>
      )}
    </View>
  );
}

// ─── ExperiencePreview ────────────────────────────────────────────────────────

function ExperiencePreview({ experiences }) {
  if (!experiences?.length) return null;
  return (
    <View style={rv.insightCard}>
      <View style={rv.insightHeader}>
        <Text style={rv.insightIcon}>🎯</Text>
        <Text style={rv.insightTitle}>Top Experiences</Text>
      </View>
      {experiences.slice(0, 4).map((e, i) => (
        <View key={i} style={rv.expRow}>
          <Text style={rv.expName} numberOfLines={1}>{e.name}</Text>
          {e.cost > 0 && <Text style={rv.expCost}>${e.cost}/person</Text>}
        </View>
      ))}
    </View>
  );
}

// ─── Quick suggestion chips ───────────────────────────────────────────────────

const QUICK_SUGGESTIONS = [
  { emoji: '🏖️', label: 'Beach & relaxation' },
  { emoji: '🍽️', label: 'Foodie adventure' },
  { emoji: '👨‍👩‍👧', label: 'Kid-friendly everything' },
  { emoji: '♿', label: 'Full wheelchair access' },
  { emoji: '🏛️', label: 'Culture & history' },
  { emoji: '💰', label: 'Budget-conscious' },
  { emoji: '🌿', label: 'Outdoor & nature' },
  { emoji: '✨', label: 'Luxury experience' },
];

const PLACEHOLDER_EXAMPLES = [
  'A relaxed 5-day beach trip focused on local food and sunsets...',
  'Family trip with 2 kids (ages 5 & 8) and grandma who uses a wheelchair...',
  'Adventure-packed week: hiking, kayaking, local markets, mid-range budget...',
  'Romantic luxury getaway — spa, fine dining, zero crowds...',
  'Multi-city road trip: hit all the highlights, packed schedule...',
];

// ─── Main Modal ───────────────────────────────────────────────────────────────

const INITIAL_AGENT_STATES = () =>
  Object.fromEntries(AGENT_CONFIG.map(a => [a.id, { status: 'pending', data: null }]));

export default function AgenticPlannerModal({ visible, trip, travelers, onClose }) {
  const { applyPlannedActivities, updateTrip } = useStore();
  const insets    = useSafeAreaInsets();
  const inputRef  = useRef(null);
  const refineRef = useRef(null);
  const scrollRef = useRef(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [phase,          setPhase]        = useState('dream');
  const [dreamText,      setDreamText]    = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [agentStates,    setAgentStates]  = useState(INITIAL_AGENT_STATES());
  const [progress,       setProgress]     = useState('');
  const [planResult,     setPlanResult]   = useState(null);
  const [refineText,     setRefineText]   = useState('');
  const [isRefining,     setIsRefining]   = useState(false);
  const [refinements,    setRefinements]  = useState([]);
  const [parsedOpts,     setParsedOpts]   = useState(null);
  // Chat overlay state
  const [showChat,    setShowChat]    = useState(false);
  const [messages,    setMessages]    = useState([]); // { role, text, ts }
  const chatScrollRef = useRef(null);

  const allMembers = trip ? getAllMembers(trip) : [];
  const families   = trip?.families || [];
  const summary    = planResult?.dayActivities && trip
    ? planSummary(planResult.dayActivities, trip)
    : null;

  // Placeholder cycling
  useEffect(() => {
    if (!visible || phase !== 'dream') return;
    const t = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, [visible, phase]);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setPhase('dream');
      setDreamText('');
      setAgentStates(INITIAL_AGENT_STATES());
      setProgress('');
      setPlanResult(null);
      setRefineText('');
      setRefinements([]);
      setParsedOpts(null);
      setShowChat(false);
      setMessages([]);
    }
  }, [visible]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }), 120);
    }
  }, [messages]);

  // ── Agent event handler ───────────────────────────────────────────────────
  const handleAgentEvent = useCallback((agentName, status, data) => {
    setAgentStates(prev => ({ ...prev, [agentName]: { status, data } }));
    if (status === 'done') {
      // Auto-scroll agents list down to keep current agent in view
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    }
  }, []);

  // ── Run the pipeline ───────────────────────────────────────────────────────
  const runPipeline = useCallback(async (text, isRefinement = false, refinementText = null) => {
    if (!trip) return;

    const opts = parseNaturalLanguage(text);
    setParsedOpts(opts);

    if (!isRefinement) {
      setAgentStates(INITIAL_AGENT_STATES());
      setPhase('agents');
    } else {
      setIsRefining(true);
      setProgress('Updating plan…');
    }

    try {
      const dayActivities = await callPlannerAPI(
        trip,
        travelers || [],
        opts,
        msg => setProgress(msg),
        null,
        refinementText,
        handleAgentEvent,
      );

      // The pipeline attaches ._budget with all intermediate results
      const budget = dayActivities?._budget || {};

      const result = {
        dayActivities,
        budgetByFamily:  budget.budgetByFamily || [],
        stayResults:     budget.stayResults || [],
        topExperiences:  budget.topExperiences || [],
        transitResult:   budget.transitResult || null,
        groupProfile:    budget.groupProfile || null,
      };

      setPlanResult(result);

      if (!isRefinement) {
        // Agent greeting: auto-generated summary of the plan
        const actCount  = (result.dayActivities || []).flat().length;
        const topHotel  = result.stayResults?.[0];
        const totalBudget = (result.budgetByFamily || []).reduce((s, f) => s + f.total, 0);
        const mcCities  = result.transitResult?.multiCity?.map(l => l.city).join(' → ');
        let greeting = `✨ I've built your ${trip.days?.length}-day plan for ${trip.destination} with ${actCount} activities`;
        if (topHotel) greeting += `, staying at ${topHotel.name} ($${topHotel.pricePerRoom}/room)`;
        if (mcCities) greeting += `. Routing: ${mcCities}`;
        if (totalBudget > 0) greeting += `. Estimated group total: $${totalBudget.toLocaleString()}`;
        greeting += `.\n\nAsk me to change anything — activities, hotels, routing, pace, budget, or specific days.`;
        setMessages([{ role: 'agent', text: greeting, ts: Date.now() }]);
        setTimeout(() => setPhase('review'), 800);
      } else {
        setRefinements(prev => [...prev, refinementText]);
        // Agent acknowledgement bubble
        const actCount = (result.dayActivities || []).flat().length;
        const agentReply = `✅ Done — "${refinementText}" applied. Your plan now has ${actCount} activities across ${trip.days?.length} days.\n\nAnything else you'd like to adjust?`;
        setMessages(prev => [...prev, { role: 'agent', text: agentReply, ts: Date.now() }]);
      }
    } catch (err) {
      console.error('[AgenticPlannerModal]', err);
      if (!isRefinement) {
        setPhase('dream');
      } else {
        setMessages(prev => [...prev, { role: 'agent', text: '⚠️ Something went wrong. Please try again.', ts: Date.now() }]);
      }
      showToast('Planning failed. Please try again.', '⚠️');
    } finally {
      if (isRefinement) {
        setIsRefining(false);
        setProgress('');
      }
    }
  }, [trip, travelers, handleAgentEvent]);

  // ── Refine handler ─────────────────────────────────────────────────────────
  // Bypasses the multi-agent pipeline — calls the single-LLM refinement path
  // directly, passing the CURRENT plan as context so Claude knows what to modify.
  const handleRefine = useCallback(async () => {
    const text = refineText.trim();
    if (!text || isRefining || !trip) return;

    setRefineText('');
    setIsRefining(true);
    setProgress('Updating your plan…');

    // Show user bubble immediately
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);

    // Build accumulated notes so Claude has full context
    const currentNotes = parsedOpts?.notes || '';
    const combined     = currentNotes ? `${currentNotes}\n${text}` : text;
    const opts         = { ...parseNaturalLanguage(combined), notes: combined };
    setParsedOpts(opts);

    try {
      const dayActivities = await callPlannerAPI(
        trip,
        travelers || [],
        opts,
        msg => setProgress(msg),
        planResult?.dayActivities,  // ← current plan so Claude has context
        text,                        // ← the specific refinement instruction
        handleAgentEvent,
      );

      const budget = dayActivities?._budget || {};
      const result = {
        dayActivities,
        budgetByFamily:  budget.budgetByFamily || planResult?.budgetByFamily || [],
        stayResults:     budget.stayResults    || planResult?.stayResults    || [],
        topExperiences:  budget.topExperiences || planResult?.topExperiences || [],
        transitResult:   budget.transitResult  || planResult?.transitResult  || null,
        groupProfile:    budget.groupProfile   || planResult?.groupProfile   || null,
      };
      setPlanResult(result);
      setRefinements(prev => [...prev, text]);

      const actCount   = (dayActivities || []).flat().length;
      const agentReply = `✅ Done — applied: "${text}"\n\nYour plan now has ${actCount} activities across ${trip.days?.length} days. Anything else?`;
      setMessages(prev => [...prev, { role: 'agent', text: agentReply, ts: Date.now() }]);

    } catch (err) {
      console.error('[handleRefine]', err);
      setMessages(prev => [...prev, { role: 'agent', text: '⚠️ Something went wrong updating the plan. Try again.', ts: Date.now() }]);
    } finally {
      setIsRefining(false);
      setProgress('');
    }
  }, [refineText, isRefining, trip, travelers, parsedOpts, planResult, handleAgentEvent]);

  // ── Apply to store ─────────────────────────────────────────────────────────
  const handleApply = () => {
    if (!planResult?.dayActivities) return;
    setPhase('applying');
    setTimeout(() => {
      applyPlannedActivities(trip.id, planResult.dayActivities);
      showToast('Plan applied! ✅', '✈️');
      onClose();
    }, 400);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: DREAM
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'dream') return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* LinearGradient fills the screen as background */}
      <LinearGradient colors={['#1a1714', '#2d1e30', '#1a2a4a']} style={{ flex: 1 }}>

        {/* Close button floats above scroll content */}
        <TouchableOpacity
          style={[dr.closeBtn, { top: insets.top + 16 }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={dr.closeText}>✕</Text>
        </TouchableOpacity>

        {/* KAV + ScrollView: content scrolls above keyboard */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[dr.scrollContent, { paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* Title */}
            <View style={dr.titleBlock}>
              <Text style={dr.titleEmoji}>✨</Text>
              <Text style={dr.title}>Plan Your Dream Trip</Text>
              <Text style={dr.subtitle}>Tell the agents what you're looking for</Text>
            </View>

            {/* Trip context pills */}
            <View style={dr.contextRow}>
              <View style={dr.contextPill}>
                <Text style={dr.contextText}>📍 {trip?.destination || 'Your destination'}</Text>
              </View>
              <View style={dr.contextPill}>
                <Text style={dr.contextText}>📅 {trip?.days?.length || '?'} days</Text>
              </View>
              <View style={dr.contextPill}>
                <Text style={dr.contextText}>👥 {allMembers.length} travellers</Text>
              </View>
            </View>

            {/* Main input */}
            <View style={dr.inputWrap}>
              <TextInput
                ref={inputRef}
                style={dr.input}
                value={dreamText}
                onChangeText={setDreamText}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoFocus={false}
              />
            </View>

            {/* Quick chips — horizontal scroll inside vertical scroll */}
            <View style={dr.chipsBlock}>
              <Text style={dr.chipsLabel}>Quick add</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={dr.chipsContent}
              >
                {QUICK_SUGGESTIONS.map(s => (
                  <TouchableOpacity
                    key={s.label}
                    style={dr.chip}
                    onPress={() => setDreamText(prev => prev ? `${prev.trim()}, ${s.label.toLowerCase()}` : s.label)}
                    activeOpacity={0.75}
                  >
                    <Text style={dr.chipText}>{s.emoji} {s.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[dr.cta, !dreamText.trim() && dr.ctaDisabled]}
              onPress={() => dreamText.trim() && runPipeline(dreamText)}
              activeOpacity={0.85}
              disabled={!dreamText.trim()}
            >
              <Text style={dr.ctaText}>Start Planning</Text>
              <Text style={dr.ctaArrow}>→</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: AGENTS
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'agents') return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[base.container, { paddingBottom: insets.bottom }]}>

        {/* Header */}
        <LinearGradient colors={['#1a2a4a', '#2d1e30']} style={base.agentHeader}>
          <Text style={base.agentHeaderTitle}>🤖 Agents Working…</Text>
          <Text style={base.agentHeaderSub}>{progress || 'Building your personalised plan'}</Text>
        </LinearGradient>

        <ScrollView ref={scrollRef} style={base.scroll} contentContainerStyle={base.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Dream recap pill */}
          <View style={base.dreamRecap}>
            <Text style={base.dreamRecapText} numberOfLines={2}>💬 "{dreamText}"</Text>
          </View>

          {/* Parallel badge */}
          <View style={base.parallelBadge}>
            <Text style={base.parallelBadgeText}>⚡ PARALLEL — 3 agents running simultaneously</Text>
          </View>

          {/* Agent cards */}
          {AGENT_CONFIG.map(cfg => {
            const state = agentStates[cfg.id] || { status: 'pending', data: null };
            return <AgentCard key={cfg.id} config={cfg} state={state} />;
          })}

          {/* Progress note */}
          {!!progress && (
            <View style={base.progressNote}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={base.progressText}>{progress}</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: REVIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'review') {
    const topHotel       = planResult?.stayResults?.[0] || null;
    const topExperiences = planResult?.topExperiences  || [];
    const transitResult  = planResult?.transitResult   || null;
    const budgetByFamily = planResult?.budgetByFamily  || [];
    const totalBudget    = budgetByFamily.reduce((s, f) => s + f.total, 0);
    const groupProfile   = planResult?.groupProfile;

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[base.container, { paddingBottom: 0 }]}>

          {/* Header — fixed, outside KAV */}
          <View style={rv.header}>
            <TouchableOpacity onPress={() => setPhase('dream')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={rv.headerBack}>← Redo</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={rv.headerTitle}>✅ Plan Ready</Text>
              {summary && <Text style={rv.headerSub}>{summary.activityCount} activities · {fmtM(summary.totalCost)}/person</Text>}
            </View>
            <TouchableOpacity style={rv.applyBtn} onPress={handleApply}>
              <Text style={rv.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>

          {/* Refinement history bar — also fixed above KAV */}
          {refinements.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={rv.histBar} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' }}>
              {refinements.map((r, i) => (
                <View key={i} style={rv.histChip}>
                  <Text style={rv.histChipText} numberOfLines={1}>✓ {r}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/*
            ONE KeyboardAvoidingView wraps BOTH the scroll content AND the refine bar.
            When the keyboard opens, this entire block shrinks — the ScrollView gets
            shorter and the refine bar stays anchored just above the keyboard.
          */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >

          <ScrollView style={base.scroll} contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Dream recap */}
            <View style={rv.dreamBubble}>
              <Text style={rv.dreamBubbleLabel}>YOUR DESCRIPTION</Text>
              <Text style={rv.dreamBubbleText}>"{dreamText}"</Text>
              {parsedOpts && (
                <View style={rv.parsedRow}>
                  <View style={rv.parsedChip}><Text style={rv.parsedChipText}>{parsedOpts.pace}</Text></View>
                  <View style={rv.parsedChip}><Text style={rv.parsedChipText}>{parsedOpts.budget}</Text></View>
                  {parsedOpts.focus.map(f => <View key={f} style={rv.parsedChip}><Text style={rv.parsedChipText}>{f}</Text></View>)}
                </View>
              )}
            </View>

            {/* Agent insights row */}
            <Text style={rv.sectionLabel}>AGENT INSIGHTS</Text>

            {isRefining && (
              <View style={rv.refiningOverlay}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={rv.refiningText}>{progress || 'Updating plan…'}</Text>
              </View>
            )}

            <HotelCard hotel={topHotel} roomsNeeded={groupProfile?.totalRoomsNeeded || 1} />
            <BudgetCard budgetByFamily={budgetByFamily} totalBudget={totalBudget} />
            <TransitCard transitResult={transitResult} />
            <ExperiencePreview experiences={topExperiences} />

            {/* Summary strip */}
            {summary && (
              <View style={rv.summaryStrip}>
                <View style={rv.summaryItem}>
                  <Text style={rv.summaryVal}>{summary.activityCount}</Text>
                  <Text style={rv.summaryKey}>Activities</Text>
                </View>
                <View style={rv.summaryDivider} />
                <View style={rv.summaryItem}>
                  <Text style={rv.summaryVal}>{fmtM(summary.totalCost)}</Text>
                  <Text style={rv.summaryKey}>Per person</Text>
                </View>
                <View style={rv.summaryDivider} />
                <View style={rv.summaryItem}>
                  <Text style={rv.summaryVal}>{fmtM(totalBudget || summary.totalCost * allMembers.length)}</Text>
                  <Text style={rv.summaryKey}>Group total</Text>
                </View>
              </View>
            )}

            {/* Day-by-day */}
            <Text style={[rv.sectionLabel, { marginTop: spacing.xl }]}>YOUR ITINERARY</Text>
            {(summary?.dayBreakdowns || []).map((day, i) => {
              const isTransitDay = day.activities.some(a => a.type === 'transport' && a.name?.includes('→'));
              return (
                <View key={i} style={[rv.dayBlock, isTransitDay && rv.dayBlockTransit, isRefining && { opacity: 0.5 }]}>
                  <View style={[rv.dayHead, isTransitDay && rv.dayHeadTransit]}>
                    <Text style={[rv.dayLabel, isTransitDay && { color: colors.expert }]}>{day.label}</Text>
                    {isTransitDay && <View style={rv.transitBadge}><Text style={rv.transitBadgeText}>🚗 Travel Day</Text></View>}
                    {!!day.date && <Text style={rv.dayDate}>{fmt(day.date)}</Text>}
                    {day.cost > 0 && <View style={rv.dayCost}><Text style={rv.dayCostText}>{fmtM(day.cost)}/pp</Text></View>}
                  </View>
                  {day.activities.length === 0
                    ? <Text style={rv.emptyDay}>No activities planned</Text>
                    : day.activities.map((act, j) => (
                      <View key={j} style={[rv.actRow, { borderLeftColor: activityColors[act.type] || colors.muted }]}>
                        <Text style={rv.actTime}>{act.time}</Text>
                        <Text style={rv.actIcon}>{activityIcons[act.type] || '📌'}</Text>
                        <View style={rv.actBody}>
                          <Text style={rv.actName} numberOfLines={1}>{act.name}</Text>
                          {!!act.detail  && <Text style={rv.actDetail}  numberOfLines={1}>{act.detail}</Text>}
                          {!!act.note    && <Text style={rv.actNote}    numberOfLines={1}>💡 {act.note}</Text>}
                        </View>
                        {act.costPerPerson > 0 && <Text style={rv.actCost}>${act.costPerPerson}</Text>}
                      </View>
                    ))
                  }
                </View>
              );
            })}

            {/* Big apply button */}
            <TouchableOpacity style={rv.bigApply} onPress={handleApply} activeOpacity={0.85}>
              <Text style={rv.bigApplyText}>✅  Approve & Apply Plan</Text>
              {summary && <Text style={rv.bigApplySub}>{summary.activityCount} activities · Splitwise auto-populated</Text>}
            </TouchableOpacity>

          </ScrollView>

          {/* Chat CTA — bottom of KAV */}
          <LinearGradient
            colors={['rgba(247,245,242,0)', '#1a1426']}
            style={rv.refineFade}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['#1a1426', '#1a2040']}
            style={[rv.refineBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          >
            {refinements.length > 0 && (
              <Text style={rv.refineLabel}>
                {refinements.length} refinement{refinements.length !== 1 ? 's' : ''} applied
              </Text>
            )}
            <TouchableOpacity
              style={rv.chatCtaBtn}
              onPress={() => setShowChat(true)}
              activeOpacity={0.85}
            >
              <Text style={rv.chatCtaIcon}>💬</Text>
              <Text style={rv.chatCtaText}>Chat with agent to refine</Text>
              <Text style={rv.chatCtaArrow}>→</Text>
            </TouchableOpacity>
          </LinearGradient>

          </KeyboardAvoidingView>{/* closes the single outer KAV */}

          {/* ── CHAT OVERLAY ─────────────────────────────────────────────── */}
          {showChat && (
            <Modal visible={showChat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChat(false)}>
              <LinearGradient colors={['#1a1714', '#2d1e30', '#1a2a4a']} style={{ flex: 1 }}>

                {/* Header */}
                <View style={[ch.header, { paddingTop: insets.top + 12 }]}>
                  <TouchableOpacity onPress={() => setShowChat(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={ch.backBtn}>← Plan</Text>
                  </TouchableOpacity>
                  <Text style={ch.headerTitle}>Chat with Agent</Text>
                  <TouchableOpacity style={ch.applyBtn} onPress={() => { setShowChat(false); handleApply(); }}>
                    <Text style={ch.applyBtnText}>Apply ✓</Text>
                  </TouchableOpacity>
                </View>

                {/* Trip context pills */}
                <View style={ch.contextRow}>
                  <View style={ch.pill}><Text style={ch.pillText}>📍 {trip?.destination}</Text></View>
                  <View style={ch.pill}><Text style={ch.pillText}>📅 {trip?.days?.length} days</Text></View>
                  <View style={ch.pill}><Text style={ch.pillText}>👥 {allMembers.length} travellers</Text></View>
                </View>

                {/*
                  Single KAV wraps BOTH messages and input.
                  When keyboard opens → KAV shrinks → ScrollView gets shorter
                  → input stays pinned above keyboard. Same fix as review phase.
                */}
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  keyboardVerticalOffset={0}
                >
                  {/* Messages */}
                  <ScrollView
                    ref={chatScrollRef}
                    style={ch.messages}
                    contentContainerStyle={ch.messagesContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {messages.map((msg, i) => (
                      <View key={i} style={[ch.bubble, msg.role === 'user' ? ch.bubbleUser : ch.bubbleAgent]}>
                        {msg.role === 'agent' && (
                          <View style={ch.agentAvatar}>
                            <Text style={ch.agentAvatarText}>✨</Text>
                          </View>
                        )}
                        <View style={[ch.bubbleInner, msg.role === 'user' ? ch.bubbleInnerUser : ch.bubbleInnerAgent]}>
                          <Text style={[ch.bubbleText, msg.role === 'user' ? ch.bubbleTextUser : ch.bubbleTextAgent]}>
                            {msg.text}
                          </Text>
                        </View>
                      </View>
                    ))}
                    {isRefining && (
                      <View style={[ch.bubble, ch.bubbleAgent]}>
                        <View style={ch.agentAvatar}><Text style={ch.agentAvatarText}>✨</Text></View>
                        <View style={ch.bubbleInnerTyping}>
                          <TypingDots />
                          {!!progress && <Text style={ch.typingProgress}>{progress}</Text>}
                        </View>
                      </View>
                    )}
                  </ScrollView>

                  {/* Chat input — pinned below messages, above keyboard */}
                  <View style={[ch.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
                    <View style={[ch.inputWrap, isRefining && ch.inputWrapActive]}>
                      <TextInput
                        ref={refineRef}
                        style={ch.input}
                        value={refineText}
                        onChangeText={setRefineText}
                        placeholder="Ask to change anything…"
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        returnKeyType="send"
                        onSubmitEditing={handleRefine}
                        editable={!isRefining}
                        multiline={false}
                      />
                    </View>
                    <TouchableOpacity
                      style={[ch.sendBtn, (!refineText.trim() || isRefining) && ch.sendBtnOff]}
                      onPress={handleRefine}
                      disabled={!refineText.trim() || isRefining}
                      activeOpacity={0.8}
                    >
                      {isRefining
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={ch.sendBtnIcon}>↑</Text>
                      }
                    </TouchableOpacity>
                  </View>

                </KeyboardAvoidingView>{/* closes single KAV for chat */}

              </LinearGradient>
            </Modal>
          )}

        </View>
      </Modal>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: APPLYING
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[base.container, { paddingBottom: insets.bottom }]}>
        <LinearGradient colors={['#1a2a4a', '#1a3a2a']} style={base.applyingScreen}>
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={base.applyingTitle}>Applying your plan…</Text>
          <Text style={base.applyingSub}>Populating itinerary and Splitwise</Text>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ─── Shared base styles ───────────────────────────────────────────────────────

const base = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.bg },
  scroll:         { flex: 1 },
  scrollContent:  { padding: spacing.xxl, paddingBottom: 80 },
  agentHeader: {
    paddingHorizontal: spacing.xxl, paddingTop: spacing.xl + 12,
    paddingBottom: spacing.xl,
  },
  agentHeaderTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  agentHeaderSub:   { ...typography.small, color: 'rgba(255,255,255,0.6)' },
  dreamRecap: {
    backgroundColor: 'rgba(108,92,231,0.1)', borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: 'rgba(108,92,231,0.2)',
  },
  dreamRecapText: { ...typography.small, color: colors.ai, fontStyle: 'italic', lineHeight: 18 },
  parallelBadge: {
    backgroundColor: colors.primaryLight, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    marginBottom: spacing.sm, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: colors.primary + '40',
  },
  parallelBadgeText: { ...typography.caption, color: colors.primary, fontWeight: '800', fontSize: 10 },
  progressNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
  },
  progressText: { ...typography.smallBold, color: colors.primary, flex: 1 },
  applyingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  applyingTitle:  { ...typography.h3, color: '#fff' },
  applyingSub:    { ...typography.small, color: 'rgba(255,255,255,0.6)' },
});

// ─── Dream phase styles ───────────────────────────────────────────────────────

const dr = StyleSheet.create({
  // Close button: absolute, floats above scroll content
  closeBtn: {
    position: 'absolute', right: spacing.xxl, zIndex: 10,
    padding: spacing.sm,
  },
  closeText: { fontSize: 18, color: 'rgba(255,255,255,0.5)' },

  // Vertical scroll container
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 72, // space for the floating close button
  },

  titleBlock: { alignItems: 'center', marginBottom: spacing.xxl },
  titleEmoji: { fontSize: 40, marginBottom: spacing.md },
  title:      { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5, textAlign: 'center' },
  subtitle:   { ...typography.body, color: 'rgba(255,255,255,0.5)', marginTop: spacing.sm, textAlign: 'center' },

  contextRow: {
    flexDirection: 'row', gap: spacing.sm, justifyContent: 'center',
    marginBottom: spacing.xl, flexWrap: 'wrap',
  },
  contextPill: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  contextText: { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  inputWrap: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: spacing.xl, padding: spacing.lg,
  },
  input: { fontSize: 16, color: '#fff', lineHeight: 24, minHeight: 110, textAlignVertical: 'top' },

  chipsBlock:   { marginBottom: spacing.xl },
  chipsLabel:   { ...typography.caption, color: 'rgba(255,255,255,0.35)', fontWeight: '700', textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.6, marginBottom: spacing.sm },
  chipsContent: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  chipText: { ...typography.caption, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },

  cta: {
    backgroundColor: colors.primary, borderRadius: radius.xl,
    paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: spacing.md, ...shadow.lg,
  },
  ctaDisabled: { backgroundColor: 'rgba(255,255,255,0.12)' },
  ctaText:     { fontSize: 18, fontWeight: '800', color: '#fff' },
  ctaArrow:    { fontSize: 22, color: '#fff' },
});

// ─── Review phase styles ──────────────────────────────────────────────────────

const rv = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#fff',
  },
  headerBack:  { ...typography.body, color: colors.primary },
  headerTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  headerSub:   { ...typography.caption, color: colors.muted, marginTop: 1 },
  applyBtn:    { backgroundColor: colors.green, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  applyBtnText:{ ...typography.smallBold, color: '#fff' },

  histBar:     { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm, maxHeight: 44 },
  histChip:    { backgroundColor: colors.greenLight, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 3, borderWidth: 1, borderColor: '#b2dfdb' },
  histChipText:{ ...typography.caption, color: colors.green, fontWeight: '700' },

  sectionLabel:{ fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md },

  dreamBubble: { backgroundColor: colors.aiLight, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: 'rgba(108,92,231,0.2)' },
  dreamBubbleLabel: { fontSize: 9, fontWeight: '800', color: colors.ai, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.xs },
  dreamBubbleText:  { ...typography.body, color: colors.ai, fontStyle: 'italic', lineHeight: 20, marginBottom: spacing.sm },
  parsedRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  parsedChip:       { backgroundColor: 'rgba(108,92,231,0.1)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  parsedChipText:   { ...typography.caption, color: colors.ai, fontWeight: '700', fontSize: 10 },

  insightCard: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  insightIcon:   { fontSize: 18 },
  insightTitle:  { ...typography.bodyBold, color: colors.text, flex: 1 },
  insightTitleRight: { ...typography.smallBold, color: colors.green },
  insightMain:   { ...typography.h4, color: colors.text, marginBottom: spacing.xs },
  insightSub:    { ...typography.caption, color: colors.muted, lineHeight: 17, marginBottom: spacing.xs },
  insightNote:   { ...typography.caption, color: colors.muted, fontStyle: 'italic', marginTop: spacing.sm },
  tagRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tag:           { backgroundColor: colors.greenLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText:       { ...typography.caption, color: colors.green, fontWeight: '600', fontSize: 10 },

  budgetRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  famDot:        { width: 10, height: 10, borderRadius: 5 },
  budgetFamName: { ...typography.smallBold, color: colors.text },
  budgetAmount:  { ...typography.bodyBold, color: colors.text },

  expRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  expName:   { ...typography.small, color: colors.text, flex: 1 },
  expCost:   { ...typography.caption, color: colors.muted, fontWeight: '700' },

  summaryStrip:   { flexDirection: 'row', backgroundColor: colors.text, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryVal:     { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  summaryKey:     { ...typography.caption, color: 'rgba(255,255,255,0.5)', marginTop: 2, fontSize: 10 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: spacing.xs },

  dayBlock:        { backgroundColor: '#fff', borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  dayBlockTransit: { borderColor: colors.expert, borderWidth: 1.5 },
  dayHead:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayHeadTransit:  { backgroundColor: colors.expertLight },
  dayLabel:        { ...typography.bodyBold, color: colors.text, flex: 1 },
  dayDate:         { ...typography.caption, color: colors.muted, fontSize: 11 },
  dayCost:         { backgroundColor: colors.greenLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: '#b2dfdb' },
  dayCostText:     { ...typography.caption, color: colors.green, fontWeight: '700', fontSize: 10 },
  transitBadge:    { backgroundColor: colors.expert, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  transitBadgeText:{ ...typography.caption, color: '#fff', fontWeight: '700', fontSize: 10 },
  emptyDay:        { ...typography.caption, color: colors.muted, padding: spacing.lg },

  actRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  actTime:   { ...typography.caption, color: colors.muted, fontWeight: '700', fontSize: 10, width: 38, paddingTop: 2 },
  actIcon:   { fontSize: 14, paddingTop: 1 },
  actBody:   { flex: 1 },
  actName:   { ...typography.smallBold, color: colors.text },
  actDetail: { ...typography.caption, color: colors.muted, fontSize: 11, marginTop: 1 },
  actNote:   { ...typography.caption, color: '#9b6e00', fontSize: 10, marginTop: 1, fontStyle: 'italic' },
  actCost:   { ...typography.caption, color: '#9b6e00', fontWeight: '700', fontSize: 11, paddingTop: 2 },

  bigApply:    { backgroundColor: colors.green, borderRadius: radius.xl, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.xl, ...shadow.md },
  bigApplyText:{ ...typography.bodyBold, color: '#fff', fontSize: 16 },
  bigApplySub: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  refiningOverlay: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#fff', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primary, ...shadow.sm },
  refiningText:    { ...typography.smallBold, color: colors.primary, flex: 1 },

  refineFade: { height: 44, position: 'absolute', top: -44, left: 0, right: 0, zIndex: 2 },
  refineBar:  { paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  refineLabel:{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 0.4, marginBottom: spacing.sm, textTransform: 'uppercase' },
  chatCtaBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: radius.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  chatCtaIcon:  { fontSize: 20 },
  chatCtaText:  { flex: 1, fontSize: 15, fontWeight: '700', color: '#fff' },
  chatCtaArrow: { fontSize: 18, color: 'rgba(255,255,255,0.5)' },
});

// ─── Chat overlay styles ──────────────────────────────────────────────────────

const ch = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xxl, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  backBtn:      { ...typography.bodyBold, color: colors.primary },
  headerTitle:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  applyBtn:     { backgroundColor: colors.green, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  applyBtnText: { ...typography.smallBold, color: '#fff' },

  contextRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, flexWrap: 'wrap' },
  pill:        { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  pillText:    { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  messages:        { flex: 1 },
  messagesContent: { padding: spacing.xxl, gap: spacing.lg },

  bubble:      { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleUser:  { flexDirection: 'row-reverse' },
  bubbleAgent: { flexDirection: 'row' },

  agentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(232,108,58,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(232,108,58,0.3)', flexShrink: 0 },
  agentAvatarText: { fontSize: 14 },

  bubbleInner:      { maxWidth: '78%', borderRadius: radius.xl, padding: spacing.lg },
  bubbleInnerUser:  { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleInnerAgent: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  bubbleText:       { fontSize: 14, lineHeight: 21 },
  bubbleTextUser:   { color: '#fff', fontWeight: '500' },
  bubbleTextAgent:  { color: 'rgba(255,255,255,0.9)' },

  bubbleInnerTyping: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.xl, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: spacing.lg, gap: spacing.xs },
  typingDots:  { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  dot1: {}, dot2: { opacity: 0.6 }, dot3: { opacity: 0.3 },
  typingProgress: { ...typography.caption, color: 'rgba(255,255,255,0.45)', marginTop: 4 },

  inputBar:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  inputBar:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  inputWrap:      { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 },
  inputWrapActive:{ borderColor: '#e86c3a' },
  input:          { fontSize: 15, color: '#fff', padding: 0, margin: 0 },
  sendBtn:        { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e86c3a', alignItems: 'center', justifyContent: 'center' },
  sendBtnOff:     { backgroundColor: 'rgba(255,255,255,0.12)' },
  sendBtnIcon:    { fontSize: 18, color: '#fff', fontWeight: '800' },
});
