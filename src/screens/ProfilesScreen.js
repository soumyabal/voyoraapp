/**
 * ProfilesScreen.js  — "🤖 AI" tab
 *
 * Two sections:
 *  1. Trip Review — on-demand AI gap analysis with guided "Go to Day" fix-it actions
 *  2. Chat with AI — per-trip AI chat
 *
 * Traveler Library has moved to the People tab (TravelersScreen).
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import useStore from '../store';
import AIChatModal from '../modals/AIChatModal';
import { colors, spacing, radius, typography } from '../theme';
import { analyzeItinerary } from '../utils/aiAssist';

// ─── Severity config ──────────────────────────────────────────────
const SEV = {
  error:   { bg: '#fdecea', border: '#f5c6cb', text: '#d63031', label: 'Error' },
  warning: { bg: '#fff8e6', border: '#fde68a', text: '#92400e', label: 'Action needed' },
  info:    { bg: colors.aiLight, border: 'rgba(108,92,231,0.2)', text: colors.ai, label: 'Suggestion' },
};

// ─── Trip Health Score ────────────────────────────────────────────
function HealthScore({ suggestions }) {
  const errors   = suggestions.filter(s => s.severity === 'error').length;
  const warnings = suggestions.filter(s => s.severity === 'warning').length;
  const infos    = suggestions.filter(s => s.severity === 'info').length;
  const score    = Math.max(0, 100 - errors * 20 - warnings * 10 - infos * 3);

  const grade = score >= 90 ? { label: 'Excellent', color: colors.green }
    : score >= 70 ? { label: 'Good', color: '#0984e3' }
    : score >= 50 ? { label: 'Needs work', color: '#f59e0b' }
    : { label: 'Incomplete', color: colors.red };

  return (
    <View style={hs.wrap}>
      <View style={hs.row}>
        <View>
          <Text style={hs.label}>TRIP HEALTH</Text>
          <Text style={[hs.grade, { color: grade.color }]}>{grade.label}</Text>
        </View>
        <Text style={[hs.score, { color: grade.color }]}>{score}</Text>
      </View>
      <View style={hs.track}>
        <View style={[hs.bar, { width: `${score}%`, backgroundColor: grade.color }]} />
      </View>
      {suggestions.length === 0 ? (
        <Text style={hs.allGood}>✅ No issues found — your plan looks solid!</Text>
      ) : (
        <Text style={hs.summary}>
          {errors > 0 ? `${errors} error${errors !== 1 ? 's' : ''} · ` : ''}
          {warnings > 0 ? `${warnings} warning${warnings !== 1 ? 's' : ''} · ` : ''}
          {infos > 0 ? `${infos} suggestion${infos !== 1 ? 's' : ''}` : ''}
        </Text>
      )}
    </View>
  );
}

const hs = StyleSheet.create({
  wrap: {
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  label: { ...typography.caption, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', fontSize: 9 },
  grade: { ...typography.bodyBold, fontSize: 18, marginTop: 2 },
  score: { fontSize: 48, fontWeight: '800', letterSpacing: -2, lineHeight: 52 },
  track: { height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, marginBottom: spacing.sm },
  bar: { height: 6, borderRadius: 3 },
  allGood: { ...typography.caption, color: colors.green, fontWeight: '700' },
  summary: { ...typography.caption, color: 'rgba(255,255,255,0.45)' },
});

// ─── Suggestion Card with fix-it action ──────────────────────────
function SuggestionCard({ sug, onFix }) {
  const sev = SEV[sug.severity] || SEV.info;
  const hasDays = sug.days && sug.days.length > 0;

  return (
    <View style={[sc.card, { backgroundColor: sev.bg, borderColor: sev.border }]}>
      <View style={sc.top}>
        <Text style={sc.icon}>{sug.icon}</Text>
        <View style={{ flex: 1 }}>
          <View style={sc.topRow}>
            <Text style={[sc.badge, { color: sev.text }]}>{sev.label.toUpperCase()}</Text>
          </View>
          <Text style={sc.title}>{sug.title}</Text>
          <Text style={sc.body}>{sug.body}</Text>
        </View>
      </View>
      {hasDays && (
        <TouchableOpacity style={[sc.fixBtn, { borderColor: sev.text }]} onPress={() => onFix(sug)}>
          <Text style={[sc.fixBtnText, { color: sev.text }]}>
            {sug.days.length === 1 ? `Go to Day ${sug.days[0] + 1}` : 'Go to first affected day'} →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  top: { flexDirection: 'row', gap: spacing.sm },
  icon: { fontSize: 20, marginTop: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  badge: { ...typography.caption, fontWeight: '800', fontSize: 9, letterSpacing: 0.5 },
  title: { ...typography.bodyBold, color: colors.text, fontSize: 14, marginBottom: 2 },
  body: { ...typography.caption, color: colors.muted, lineHeight: 17 },
  fixBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  fixBtnText: { ...typography.caption, fontWeight: '800' },
});

// ─── Main Screen ──────────────────────────────────────────────────
export default function ProfilesScreen({ trip, switchTab, pendingAIMessage, onClearPendingAI }) {
  const { travelers, setCurrentDay } = useStore();
  const [showAIChat, setShowAIChat]       = useState(false);
  const [reviewed, setReviewed]           = useState(false);
  const [aiChatInitialMsg, setAIChatInitialMsg] = useState(null);

  // Auto-open AI chat when a traveler change triggers it from the People tab
  React.useEffect(() => {
    if (pendingAIMessage) {
      setAIChatInitialMsg(pendingAIMessage);
      setShowAIChat(true);
      onClearPendingAI?.();
    }
  }, [pendingAIMessage]);

  const suggestions = reviewed ? analyzeItinerary(trip, travelers) : [];
  const warnings    = suggestions.filter(s => s.severity !== 'info');

  const handleFix = (sug) => {
    if (sug.day !== undefined) {
      setCurrentDay(sug.day);
      if (switchTab) switchTab('itinerary');
    }
  };

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Trip Review ─────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Trip Review</Text>

        {!reviewed ? (
          <View style={s.reviewCta}>
            <Text style={s.reviewCtaEmoji}>🤖</Text>
            <Text style={s.reviewCtaTitle}>Let AI review your trip</Text>
            <Text style={s.reviewCtaBody}>
              Checks your itinerary for gaps — missing meals, empty days, unverified accessibility, pace issues, and budget spread. Runs locally in a second.
            </Text>
            <View style={s.reviewCtaChecks}>
              {['🍽️  Missing meals', '📅  Empty days', '♿  Accessibility', '🧓  Pace & rest', '💰  Budget spread'].map(item => (
                <Text key={item} style={s.reviewCtaCheck}>{item}</Text>
              ))}
            </View>
            <TouchableOpacity style={s.reviewCtaBtn} onPress={() => setReviewed(true)}>
              <Text style={s.reviewCtaBtnText}>Review My Trip →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <HealthScore suggestions={suggestions} />

            {warnings.length > 0 && (
              <>
                <Text style={s.groupLabel}>⚠️ Needs attention</Text>
                {warnings.map(sug => (
                  <SuggestionCard key={sug.id} sug={sug} onFix={handleFix} />
                ))}
              </>
            )}

            {suggestions.filter(sug => sug.severity === 'info').length > 0 && (
              <>
                <Text style={s.groupLabel}>💡 Nice to have</Text>
                {suggestions.filter(sug => sug.severity === 'info').map(sug => (
                  <SuggestionCard key={sug.id} sug={sug} onFix={handleFix} />
                ))}
              </>
            )}

            {suggestions.length === 0 && (
              <View style={s.allGoodCard}>
                <Text style={s.allGoodEmoji}>🎉</Text>
                <Text style={s.allGoodTitle}>Plan looks great!</Text>
                <Text style={s.allGoodBody}>No gaps or issues detected. Chat with AI to dig deeper or get activity ideas.</Text>
              </View>
            )}

            <TouchableOpacity onPress={() => setReviewed(false)} style={s.reRunBtn}>
              <Text style={s.reRunText}>↻ Run review again</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Chat with AI ─────────────────────────────────────── */}
        <TouchableOpacity style={s.chatBtn} onPress={() => setShowAIChat(true)}>
          <Text style={s.chatBtnIcon}>🤖</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.chatBtnTitle}>Chat with AI</Text>
            <Text style={s.chatBtnSub}>Ask anything about this trip — meal ideas, activity suggestions, local tips</Text>
          </View>
          <Text style={s.chatBtnArrow}>›</Text>
        </TouchableOpacity>

      </ScrollView>

      <AIChatModal
        visible={showAIChat}
        trip={trip}
        initialMessage={aiChatInitialMsg}
        onClose={() => { setShowAIChat(false); setAIChatInitialMsg(null); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 60 },

  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.md },
  groupLabel: {
    ...typography.caption, color: colors.muted, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: spacing.sm, marginTop: spacing.xs,
  },

  // Pre-review CTA
  reviewCta: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.15)',
  },
  reviewCtaEmoji: { fontSize: 40, marginBottom: spacing.md },
  reviewCtaTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  reviewCtaBody: { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  reviewCtaChecks: { alignSelf: 'stretch', marginBottom: spacing.xl, gap: spacing.xs },
  reviewCtaCheck: { ...typography.caption, color: colors.muted, fontWeight: '600', paddingVertical: 2 },
  reviewCtaBtn: {
    backgroundColor: colors.ai,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  reviewCtaBtnText: { ...typography.bodyBold, color: '#fff', fontSize: 16 },

  // All good card
  allGoodCard: { backgroundColor: colors.greenLight, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.md },
  allGoodEmoji: { fontSize: 36, marginBottom: spacing.sm },
  allGoodTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.xs },
  allGoodBody: { ...typography.caption, color: colors.muted, textAlign: 'center', lineHeight: 18 },

  // Re-run
  reRunBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.sm },
  reRunText: { ...typography.caption, color: colors.muted, fontWeight: '700' },

  // Chat button
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ai,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  chatBtnIcon: { fontSize: 24 },
  chatBtnTitle: { ...typography.bodyBold, color: '#fff' },
  chatBtnSub: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 1, lineHeight: 16 },
  chatBtnArrow: { color: '#fff', fontSize: 22, fontWeight: '300' },
});
