/**
 * AIChatModal.js
 *
 * AI trip review chat — per trip, aware of the full itinerary & traveler profiles.
 *
 * How it works:
 *  1. buildTripContext() constructs a rich system prompt with every detail.
 *  2. analyzeItinerary() runs locally (free) to seed the first AI message.
 *  3. User types; messages are sent to Claude API (or smart simulation if no key).
 *  4. Subscription gate: 5 free messages → soft upgrade prompt (not a hard block).
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { analyzeItinerary, buildTripContext } from '../utils/aiAssist';
import { CLAUDE_API_KEY, CLAUDE_MODEL, CLAUDE_API_URL, FREE_AI_REVIEW_USES, PRO_MONTHLY_PRICE, BYPASS_SUBSCRIPTION } from '../config';
import { uid } from '../utils/helpers';

// ─── Quick prompts ────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: '🔍 Review my plan',        text: 'Review my itinerary. What looks good, what might be missing, and what would you change?' },
  { label: '🚗 Add a side trip',        text: 'I want to add a side trip from here — maybe drive to a nearby city for a couple of days and come back. What do you recommend?' },
  { label: '🏨 Hotel advice',           text: 'What neighbourhood should we stay in, and what should we look for in a hotel for our group? Any specific recommendations?' },
  { label: '♿ Accessibility check',   text: 'Check if all our planned activities work for everyone in the group, especially anyone with mobility or accessibility needs.' },
  { label: '👨‍👩‍👧 Family logistics',     text: 'Any tips for managing this trip with the kids? Things I might not have thought of — timing, nap breaks, booking ahead, that sort of thing.' },
  { label: '💡 Local tips',             text: 'What local tips should I know for this destination? Best times to visit attractions, what to avoid, hidden gems for families.' },
];

// ─── Smart simulation (no API key needed) ────────────────────────────────────
function buildSmartResponse(userText, trip, profiles) {
  const suggestions = analyzeItinerary(trip, profiles);
  const msg = userText.toLowerCase();
  const allMembers = trip.families.flatMap(f => f.members);
  const warnings = suggestions.filter(s => s.severity !== 'info');
  const errors   = suggestions.filter(s => s.severity === 'error');

  // Conversational "yes / fix it / do all / apply all" — acknowledge and prompt action buttons
  if (
    msg.match(/^(yes|yep|yeah|sure|ok|okay|do it|fix it|fix them|fix all|apply|go ahead|sounds good|please|yes please|all of them|add them all)[\s!.]*$/)
    || msg.includes('fix all') || msg.includes('apply all') || msg.includes('do all')
    || msg.includes('add them all') || msg.includes('fix everything')
  ) {
    const fixable = suggestions.filter(s => ['meal-breakfast', 'meal-dinner', 'meal-lunch', 'no-accommodation', 'no-day1-transport'].includes(s.id));
    if (fixable.length > 0) {
      const lines = fixable.map(s => `${s.icon} ${s.title}`).join('\n');
      return `Got it! Tap the action button${fixable.length > 1 ? 's' : ''} below to apply the fix${fixable.length > 1 ? 'es' : ''} all at once:\n\n${lines}\n\nEverything will be added to the itinerary in one go — no need to go one by one.`;
    }
    return `Everything in **${trip.name}** already looks good — nothing specific to fix right now. Want me to check something in particular?`;
  }

  // Traveler preference update trigger
  if (msg.includes('updated') && (msg.includes('preference') || msg.includes('traveler') || msg.includes('removed'))) {
    const accessNeeds = allMembers.filter(m => (m.needs || []).length > 0);
    const base = `Got it — I've noted the traveler changes for **${trip.name}**.\n\n`;
    const checks = [
      accessNeeds.length > 0 ? `♿ **Accessibility:** ${accessNeeds.map(m => m.name).join(', ')} have special needs — double-check all activities still accommodate them.` : null,
      `💰 **Budget:** Re-run the budget estimate in the Split tab if the group size changed.`,
      `📅 **Pace:** Some activities may need re-evaluating for the updated group composition.`,
    ].filter(Boolean).join('\n');
    return base + checks + `\n\nWould you like me to do a full review of the updated plan?`;
  }

  // Review / missing
  if (msg.includes('review') || msg.includes('missing') || msg.includes('look')) {
    if (suggestions.length === 0) {
      return `**${trip.name}** looks solid! ✅\n\n${trip.days.length} days planned for ${trip.destination} with ${allMembers.length} traveler${allMembers.length !== 1 ? 's' : ''}. All key meal slots and accommodation look covered — nothing critical missing.\n\nAnything specific you'd like me to dig into?`;
    }
    const top = suggestions.slice(0, 4);
    const fixable = suggestions.filter(s => ['meal-breakfast', 'meal-dinner', 'meal-lunch', 'no-accommodation', 'no-day1-transport'].includes(s.id));
    const reviewText = `I've reviewed **${trip.name}** — here's what I found:\n\n` +
      top.map(s => `${s.icon} **${s.title}**\n${s.body}`).join('\n\n') +
      (suggestions.length > 4 ? `\n\n...and ${suggestions.length - 4} more.` : '');
    return fixable.length > 0
      ? reviewText + `\n\nTap the button${fixable.length > 1 ? 's' : ''} below to fix ${fixable.length > 1 ? 'all of these at once' : 'this'} — or just say "fix all" and I'll apply everything in one go.`
      : reviewText;
  }

  // Evening / dinner
  if (msg.includes('evening') || msg.includes('dinner') || msg.includes('night')) {
    const missingDinners = suggestions.filter(s => s.id?.startsWith('meal-') && s.id?.includes('dinner'));
    if (missingDinners.length > 0) {
      const dayCount = missingDinners[0]?.days?.length || 1;
      return `**${dayCount} evening${dayCount !== 1 ? 's' : ''}** without dinner planned in **${trip.name}**:\n\n` +
        missingDinners.map(s => `🍽️ ${s.title}`).join('\n') +
        `\n\nFor **${trip.destination}**, book restaurants ahead for large groups — weekends fill up fast. Tap below to add dinner to all affected days at once.`;
    }
    return `All evenings have dinner planned in **${trip.name}**. Consider mixing local street food with at least one sit-down group dinner — great for bonding!`;
  }

  // Accessibility
  if (msg.includes('access') || msg.includes('wheelchair') || msg.includes('mobility')) {
    const accessIssues = suggestions.filter(s => s.type === 'needs' && s.icon === '♿');
    if (accessIssues.length > 0) {
      return `Accessibility check for **${trip.name}**:\n\n` +
        accessIssues.map(s => `${s.icon} **${s.title}**\n${s.body}`).join('\n\n') +
        `\n\n**My advice:** Call venues directly before booking — online accessibility information is often outdated. Ask specifically about step-free access, lift dimensions, and accessible restrooms.`;
    }
    const mobilityMembers = allMembers.filter(m => (m.needs || []).some(n => n.toLowerCase().includes('wheel') || n.toLowerCase().includes('mobil')));
    if (mobilityMembers.length > 0) {
      return `Good news — no accessibility conflicts detected for ${mobilityMembers.map(m => m.name).join(', ')}. All activities either have accessibility notes or don't need them.\n\nI'd still recommend confirming with each venue before the trip.`;
    }
    return `No travelers in this group have flagged accessibility needs, so no specific checks are required. If this changes, update traveler profiles and I'll flag any conflicts.`;
  }

  // Pace
  if (msg.includes('pace') || msg.includes('busy') || msg.includes('relax') || msg.includes('tired')) {
    const paceIssues = suggestions.filter(s => s.type === 'pace');
    const vulnerableMembers = allMembers.filter(m => (m.needs || []).some(n => n.toLowerCase().includes('infant') || n.toLowerCase().includes('elderly')) || (m.age && m.age >= 75));
    if (paceIssues.length > 0) {
      return `Pace check:\n\n` +
        paceIssues.map(s => `${s.icon} **${s.title}**\n${s.body}`).join('\n\n') +
        `\n\n**Tip:** Add a "Free time / Rest" activity block on busy days — it gives everyone breathing room and lets people opt out without feeling left out.`;
    }
    if (vulnerableMembers.length > 0) {
      return `The pace looks manageable for **${vulnerableMembers.map(m => m.name).join(', ')}** — no days are currently over 5 activities. Keep an eye on total walking distance per day, which isn't tracked here but matters for comfort.`;
    }
    return `The pace looks well-balanced for your group — no days are overly packed. Great planning!`;
  }

  // Budget
  if (msg.includes('budget') || msg.includes('cost') || msg.includes('money') || msg.includes('spend')) {
    const costIssues = suggestions.filter(s => s.type === 'cost');
    const totalBudget = trip.days.flatMap(d => d.activities).reduce((s, a) => s + (a.costPerPerson || 0), 0) * allMembers.length;
    if (costIssues.length > 0) {
      return `Budget analysis for **${trip.name}**:\n\n` +
        costIssues.map(s => `${s.icon} **${s.title}**\n${s.body}`).join('\n\n') +
        `\n\nEstimated total: **$${totalBudget.toFixed(0)}** across ${allMembers.length} travelers ($${(totalBudget / allMembers.length).toFixed(0)}/person).`;
    }
    return `Budget looks well distributed across the trip.\n\nEstimated total: **$${totalBudget.toFixed(0)}** for ${allMembers.length} travelers — that's **$${(totalBudget / allMembers.length).toFixed(0)} per person** for ${trip.days.length} days. Looks reasonable!`;
  }

  // Meal gaps
  if (msg.includes('meal') || msg.includes('breakfast') || msg.includes('lunch') || msg.includes('food')) {
    const mealIssues = suggestions.filter(s => s.type === 'gap' && s.id?.startsWith('meal-'));
    if (mealIssues.length > 0) {
      return `Meal gaps in **${trip.name}**:\n\n` +
        mealIssues.map(s => `${s.icon} **${s.title}**\n${s.body}`).join('\n\n') +
        `\n\nTap the fix button${mealIssues.length > 1 ? 's' : ''} below to add the missing meal${mealIssues.length > 1 ? 's' : ''} across all days at once, or say "fix all".`;
    }
    return `All meal slots (breakfast, lunch, dinner) look covered across the trip. Well planned!`;
  }

  // Default friendly response
  const openIssues = suggestions.filter(s => s.severity !== 'info');
  if (openIssues.length > 0) {
    return `I'm on it! For **${trip.name}**, I can see **${openIssues.length} thing${openIssues.length !== 1 ? 's' : ''}** worth fixing:\n\n` +
      openIssues.slice(0, 3).map(s => `${s.icon} ${s.title}`).join('\n') +
      (openIssues.length > 3 ? `\n...and ${openIssues.length - 3} more.` : '') +
      `\n\nSay "fix all" or tap the review button to see everything with one-tap fixes.`;
  }
  return `**${trip.name}** looks good from what I can see! Ask me to review meals, budget, accessibility, or pace — or just say what you want to change and I'll help you update the itinerary directly.`;
}

// ─── Action generator — bulk-first, all affected days at once ────────────────
function buildSmartActions(msgLower, trip, suggestions) {
  const totalActivities = trip.days.flatMap(d => d.activities).length;

  // Mostly-empty trip — full inject is the only useful action
  if (totalActivities < trip.days.length) {
    return [{ label: '🤖 Generate full AI itinerary', type: 'inject', payload: {} }];
  }

  const individual = [];

  // Missing breakfast — ALL affected days at once
  const missingBreakfast = suggestions.find(s => s.id === 'meal-breakfast');
  if (missingBreakfast) {
    const days = missingBreakfast.days?.length > 0 ? missingBreakfast.days : [missingBreakfast.day].filter(d => d !== undefined);
    if (days.length > 0) {
      individual.push({
        label: days.length === 1 ? `☕ Add breakfast to ${trip.days[days[0]]?.label}` : `☕ Add breakfast to all ${days.length} days`,
        type: 'addActivityBulk',
        payload: { days, activity: { type: 'food', time: '08:00', name: 'Breakfast', detail: 'Morning meal', costPerPerson: 12 } },
      });
    }
  }

  // Missing dinner — ALL affected days at once
  const missingDinner = suggestions.find(s => s.id === 'meal-dinner');
  if (missingDinner) {
    const days = missingDinner.days?.length > 0 ? missingDinner.days : [missingDinner.day].filter(d => d !== undefined);
    if (days.length > 0) {
      individual.push({
        label: days.length === 1 ? `🍽️ Add dinner to ${trip.days[days[0]]?.label}` : `🍽️ Add dinner to all ${days.length} days`,
        type: 'addActivityBulk',
        payload: { days, activity: { type: 'food', time: '19:30', name: 'Dinner', detail: 'Evening meal — book ahead for groups', costPerPerson: 30 } },
      });
    }
  }

  // Missing lunch — ALL affected days at once
  const missingLunch = suggestions.find(s => s.id === 'meal-lunch');
  if (missingLunch) {
    const days = missingLunch.days?.length > 0 ? missingLunch.days : [missingLunch.day].filter(d => d !== undefined);
    if (days.length > 0) {
      individual.push({
        label: days.length === 1 ? `🥗 Add lunch to ${trip.days[days[0]]?.label}` : `🥗 Add lunch to all ${days.length} days`,
        type: 'addActivityBulk',
        payload: { days, activity: { type: 'food', time: '12:30', name: 'Lunch', detail: 'Midday meal', costPerPerson: 18 } },
      });
    }
  }

  // No accommodation
  if (suggestions.find(s => s.id === 'no-accommodation') && trip.days.length > 0) {
    individual.push({
      label: '🏨 Add hotel check-in to Day 1',
      type: 'addActivity',
      payload: { dayIndex: 0, activity: { type: 'stay', time: '13:00', name: 'Hotel check-in', detail: 'Drop bags, freshen up', access: 'Accessible room on request', costPerPerson: 80 } },
    });
  }

  // No Day 1 transport
  if (suggestions.find(s => s.id === 'no-day1-transport')) {
    individual.push({
      label: '✈️ Add arrival transfer to Day 1',
      type: 'addActivity',
      payload: { dayIndex: 0, activity: { type: 'transport', time: '08:00', name: 'Airport transfer', detail: 'Private taxi or shuttle', access: 'Accessible vehicle on request', costPerPerson: 20 } },
    });
  }

  if (individual.length === 0) return [];

  // With 2+ fixable types, lead with a "Fix all" composite button
  if (individual.length >= 2) {
    const fixAll = {
      label: `🔧 Fix all ${individual.length} issues at once`,
      type: 'fixAll',
      payload: { actions: individual },
    };
    return [fixAll, ...individual].slice(0, 4);
  }

  return individual;
}

// ─── Claude API call ──────────────────────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
  if (!CLAUDE_API_KEY) return null;
  try {
    const resp = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await resp.json();
    return data.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

// ─── Simple markdown-ish bold rendering ──────────────────────────────────────
function BoldText({ text, style }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <Text key={i} style={{ fontWeight: '800' }}>{part}</Text>
          : part
      )}
    </Text>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function AIChatModal({ visible, trip, onClose, initialMessage }) {
  const { account, chatHistory, addChatMessage, useAIReview, upgradeToPro, travelers, addActivity, injectAIActivities } = useStore();
  const scrollRef = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [executedActions, setExecutedActions] = useState(new Set());

  const isPro = BYPASS_SUBSCRIPTION || account.plan === 'pro';
  const reviewsUsed = account.aiReviewsUsed || 0;
  const trialLeft = Math.max(0, FREE_AI_REVIEW_USES - reviewsUsed);
  const history = (chatHistory[trip?.id] || []);

  const systemPrompt = trip ? buildTripContext(trip, travelers) : '';
  const suggestions  = trip ? analyzeItinerary(trip, travelers) : [];

  // Seed a greeting if chat is empty
  useEffect(() => {
    if (visible && trip && history.length === 0) {
      const greeting = suggestions.length > 0
        ? `Hi! I've analysed **${trip.name}** and found **${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}** — ${suggestions.filter(s => s.severity !== 'info').length} need attention. Ask me anything or tap a quick prompt to get started!`
        : `Hi! **${trip.name}** looks well-planned — no major issues found. I'm here to help refine it further. What would you like to explore?`;

      addChatMessage(trip.id, { id: uid(), role: 'assistant', content: greeting, ts: Date.now() });
    }
  }, [visible, trip?.id]);

  useEffect(() => {
    if (visible) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [history.length, visible]);

  // Auto-send a triggered message (e.g. from traveler change in People tab)
  useEffect(() => {
    if (visible && initialMessage) {
      const timer = setTimeout(() => send(initialMessage), 800);
      return () => clearTimeout(timer);
    }
  }, [visible, initialMessage]);

  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');

    // Check subscription
    if (!isPro && trialLeft <= 0) {
      setShowUpgrade(true);
      return;
    }

    // Add user message
    const userMsg = { id: uid(), role: 'user', content, ts: Date.now() };
    addChatMessage(trip.id, userMsg);
    if (!isPro) useAIReview();

    setLoading(true);
    try {
      // Try real API first, fall back to simulation
      const apiHistory = [...history, userMsg].filter(m => m.role === 'user' || m.role === 'assistant');
      const aiText = await callClaude(systemPrompt, apiHistory)
        ?? buildSmartResponse(content, trip, travelers);

      const aiActions = buildSmartActions(content.toLowerCase(), trip, suggestions);
      addChatMessage(trip.id, { id: uid(), role: 'assistant', content: aiText, actions: aiActions, ts: Date.now() });
    } catch {
      addChatMessage(trip.id, { id: uid(), role: 'assistant', content: 'Sorry, I ran into an issue. Please try again.', ts: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const executeAction = (action, actionKey) => {
    if (executedActions.has(actionKey)) return;
    setExecutedActions(prev => new Set([...prev, actionKey]));

    if (action.type === 'inject') {
      injectAIActivities(trip.id);
      addChatMessage(trip.id, {
        id: uid(), role: 'assistant', ts: Date.now(),
        content: `✅ Done! I've generated a full itinerary for **${trip.name}**. Head to the Itinerary tab to see all the days planned out — let me know if you'd like to adjust anything!`,
      });
      showToast('AI itinerary generated! 🗓️');

    } else if (action.type === 'addActivity') {
      const { dayIndex, activity } = action.payload;
      const dayLabel = trip.days[dayIndex]?.label || `Day ${dayIndex + 1}`;
      addActivity(trip.id, dayIndex, { ...activity, id: uid() });
      addChatMessage(trip.id, {
        id: uid(), role: 'assistant', ts: Date.now(),
        content: `✅ Added **${activity.name}** to **${dayLabel}**. Check the Itinerary tab to see it!`,
      });
      showToast(`${activity.name} added ✅`);

    } else if (action.type === 'addActivityBulk') {
      const { days, activity } = action.payload;
      days.forEach(dayIndex => addActivity(trip.id, dayIndex, { ...activity, id: uid() }));
      const dayLabels = days.map(i => trip.days[i]?.label || `Day ${i + 1}`);
      const preview = dayLabels.length <= 3
        ? dayLabels.join(', ')
        : `${dayLabels.slice(0, 3).join(', ')} +${dayLabels.length - 3} more`;
      addChatMessage(trip.id, {
        id: uid(), role: 'assistant', ts: Date.now(),
        content: `✅ Added **${activity.name}** to **${days.length} day${days.length !== 1 ? 's' : ''}** (${preview}). Check the Itinerary tab to see them all!`,
      });
      showToast(`${activity.name} added to ${days.length} days ✅`);

    } else if (action.type === 'fixAll') {
      const { actions: subActions } = action.payload;
      const summary = [];
      subActions.forEach(sub => {
        if (sub.type === 'addActivityBulk') {
          const { days, activity } = sub.payload;
          days.forEach(dayIndex => addActivity(trip.id, dayIndex, { ...activity, id: uid() }));
          summary.push(`${activity.name} added to ${days.length} day${days.length !== 1 ? 's' : ''}`);
        } else if (sub.type === 'addActivity') {
          const { dayIndex, activity } = sub.payload;
          addActivity(trip.id, dayIndex, { ...activity, id: uid() });
          summary.push(`${activity.name} added to ${trip.days[dayIndex]?.label || `Day ${dayIndex + 1}`}`);
        }
      });
      addChatMessage(trip.id, {
        id: uid(), role: 'assistant', ts: Date.now(),
        content: `✅ All done! Here's what I applied:\n\n${summary.map(s => `• ${s}`).join('\n')}\n\nHead to the Itinerary tab to review everything. Want me to check anything else?`,
      });
      showToast(`${subActions.length} fixes applied ✅`);
    }
  };

  if (!trip) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={s.container}>

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text style={s.headerTitle}>🤖 AI Review</Text>
              <Text style={s.headerSub} numberOfLines={1}>{trip.name}</Text>
            </View>
            <View style={s.headerRight}>
              {isPro
                ? <View style={s.proBadge}><Text style={s.proBadgeText}>PRO</Text></View>
                : <Text style={s.trialText}>{trialLeft} review{trialLeft !== 1 ? 's' : ''} left</Text>
              }
              <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                <Text style={s.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick prompts */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips} contentContainerStyle={s.chipsInner}>
            {QUICK_PROMPTS.map(p => (
              <TouchableOpacity key={p.label} style={s.chip} onPress={() => send(p.text)}>
                <Text style={s.chipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Upgrade banner */}
          {showUpgrade && (
            <View style={s.upgradeBanner}>
              <View style={{ flex: 1 }}>
                <Text style={s.upgradeTitle}>Upgrade to Voyara Pro</Text>
                <Text style={s.upgradeSub}>Unlimited AI chat · {PRO_MONTHLY_PRICE}/month · Cancel anytime</Text>
              </View>
              <TouchableOpacity style={s.upgradeBtn} onPress={() => { upgradeToPro(); setShowUpgrade(false); }}>
                <Text style={s.upgradeBtnText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* KAV wraps messages + input so the input lifts above the keyboard */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={s.messages}
              contentContainerStyle={s.messagesInner}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {history.map(msg => (
                <View key={msg.id}>
                  <View style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                    {msg.role === 'assistant' && (
                      <Text style={s.aiAvatar}>🤖</Text>
                    )}
                    <View style={[s.bubbleInner, msg.role === 'user' ? s.bubbleInnerUser : s.bubbleInnerAI]}>
                      <BoldText
                        text={msg.content}
                        style={[s.bubbleText, msg.role === 'user' ? s.bubbleTextUser : s.bubbleTextAI]}
                      />
                    </View>
                  </View>
                  {msg.role === 'assistant' && msg.actions?.length > 0 && (
                    <View style={s.actionRow}>
                      {msg.actions.map((action, idx) => {
                        const actionKey = `${msg.id}-${idx}`;
                        const done = executedActions.has(actionKey);
                        return (
                          <TouchableOpacity
                            key={actionKey}
                            style={[s.actionBtn, done && s.actionBtnDone]}
                            onPress={() => executeAction(action, actionKey)}
                            disabled={done}
                          >
                            <Text style={[s.actionBtnText, done && s.actionBtnTextDone]}>
                              {done ? '✅ Done' : action.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
              {loading && (
                <View style={[s.bubble, s.bubbleAI]}>
                  <Text style={s.aiAvatar}>🤖</Text>
                  <View style={s.bubbleInnerAI}>
                    <ActivityIndicator size="small" color={colors.muted} />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Trial hint */}
            {!isPro && trialLeft > 0 && trialLeft <= 2 && (
              <TouchableOpacity style={s.trialHint} onPress={() => setShowUpgrade(true)}>
                <Text style={s.trialHintText}>
                  {trialLeft === 1 ? '1 free message left — ' : `${trialLeft} free messages left — `}
                  <Text style={{ textDecorationLine: 'underline' }}>upgrade for unlimited</Text>
                </Text>
              </TouchableOpacity>
            )}

            {/* Input */}
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask about your trip…"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => send()}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
                onPress={() => send()}
                disabled={!input.trim() || loading}
              >
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>

          </KeyboardAvoidingView>

        </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flex: 1 },
  headerTitle: { ...typography.h4, color: colors.text },
  headerSub: { ...typography.caption, color: colors.muted, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  proBadge: { backgroundColor: colors.ai, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  proBadgeText: { ...typography.caption, color: '#fff', fontWeight: '800', fontSize: 10 },
  trialText: { ...typography.caption, color: colors.muted, fontSize: 11 },
  closeBtn: { paddingLeft: spacing.sm },
  closeText: { fontSize: 18, color: colors.muted },

  // Quick prompts
  chips: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 52 },
  chipsInner: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm, gap: spacing.sm, flexDirection: 'row' },
  chip: {
    backgroundColor: colors.aiLight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.18)',
  },
  chipText: { ...typography.caption, color: colors.ai, fontWeight: '700' },

  // Upgrade banner
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0eeff',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108,92,231,0.2)',
  },
  upgradeTitle: { ...typography.bodyBold, color: colors.ai },
  upgradeSub: { ...typography.caption, color: colors.muted, marginTop: 1 },
  upgradeBtn: { backgroundColor: colors.ai, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  upgradeBtnText: { ...typography.bodyBold, color: '#fff', fontSize: 13 },

  // Messages
  messages: { flex: 1 },
  messagesInner: { padding: spacing.xxl, gap: spacing.lg },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAI: { justifyContent: 'flex-start' },
  aiAvatar: { fontSize: 22, marginBottom: 2 },
  bubbleInner: { maxWidth: '78%', borderRadius: radius.lg, padding: spacing.md },
  bubbleInnerUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleInnerAI: { backgroundColor: '#fff', borderBottomLeftRadius: 4, ...shadow.card },
  bubbleText: { lineHeight: 20, fontSize: 14 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAI: { color: colors.text },

  // Action buttons
  actionRow: { marginLeft: 34, marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionBtn: {
    backgroundColor: colors.aiLight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: colors.ai,
  },
  actionBtnDone: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  actionBtnText: { ...typography.caption, color: colors.ai, fontWeight: '700' },
  actionBtnTextDone: { color: '#16a34a' },

  // Trial hint
  trialHint: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm, alignItems: 'center' },
  trialHintText: { ...typography.caption, color: colors.muted, fontSize: 11 },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 22 },
});
