/**
 * AIPlannerModal.js
 *
 * Phases:
 *   input   → user sets pace/budget/focus + optional notes → Generate
 *   loading → spinner while callPlannerAPI runs
 *   ready   → day-by-day preview + LIVE REFINEMENT chat bar at the bottom
 *             (user types "add Universal Studios Day 2" → plan updates in-place)
 *   applying → writes plan to store
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import { callPlannerAPI, planSummary } from '../utils/plannerAPI';
import { fmt, fmtM, getAllMembers } from '../utils/helpers';

// ─── Constants ────────────────────────────────────────────────────────────────

const PACE_OPTIONS = [
  { key: 'relaxed',  label: '😌 Relaxed',  sub: 'Fewer stops, more breathing room' },
  { key: 'moderate', label: '🚶 Moderate', sub: 'Balanced — something every few hours' },
  { key: 'packed',   label: '⚡ Packed',   sub: 'Max activities, early starts' },
];

const BUDGET_OPTIONS = [
  { key: 'budget',    label: '💰 Budget',    sub: 'Local eats, free attractions' },
  { key: 'mid-range', label: '✈️ Mid-range', sub: 'Mix of paid & free experiences' },
  { key: 'luxury',    label: '💎 Luxury',    sub: 'Premium dining and experiences' },
];

const FOCUS_OPTIONS = [
  { key: 'culture',   emoji: '🏛️', label: 'Culture' },
  { key: 'food',      emoji: '🍽️', label: 'Food' },
  { key: 'outdoors',  emoji: '🌿', label: 'Outdoors' },
  { key: 'shopping',  emoji: '🛍️', label: 'Shopping' },
  { key: 'family',    emoji: '👨‍👩‍👧', label: 'Family' },
  { key: 'nightlife', emoji: '🌙', label: 'Nightlife' },
];

const NOTE_SUGGESTIONS = [
  'Add Universal Studios for Day 2 — we will have lunch there',
  'Keep activities relaxed, avoid early starts',
  'Add more local food experiences',
  'Include kid-friendly activities throughout',
  'Add a beach day somewhere in the middle',
  'Make Day 1 a rest day — we arrive late',
];

// Example refinements shown in the chat bar placeholder rotation
const REFINE_EXAMPLES = [
  'Swap Day 2 for a beach day…',
  'Add Universal Studios on Day 3…',
  'Make the last day more relaxed…',
  'Add a spa afternoon on Day 4…',
  'Replace dinner on Day 2 with street food…',
];

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, active, onPress, color }) {
  const ac = color || colors.primary;
  return (
    <TouchableOpacity
      style={[ch.chip, active && { backgroundColor: ac, borderColor: ac }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[ch.chipText, active && ch.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ch = StyleSheet.create({
  chip:          { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  chipText:      { ...typography.smallBold, color: colors.muted },
  chipTextActive:{ color: '#fff' },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function AIPlannerModal({ visible, trip, travelers, onClose }) {
  const { applyPlannedActivities } = useStore();
  const insets = useSafeAreaInsets();
  const notesRef  = useRef(null);
  const refineRef = useRef(null);

  // Preferences (persist across opens)
  const [notes,  setNotes]  = useState('');
  const [pace,   setPace]   = useState('moderate');
  const [budget, setBudget] = useState('mid-range');
  const [focus,  setFocus]  = useState([]);

  // Flow
  const [phase,        setPhase]        = useState('input');
  const [progress,     setProgress]     = useState('');
  const [dayActivities,setDayActivities]= useState(null);
  const [errorMsg,     setErrorMsg]     = useState(null);

  // Live refinement (ready phase)
  const [refineText,   setRefineText]   = useState('');
  const [isRefining,   setIsRefining]   = useState(false);
  const [refinements,  setRefinements]  = useState([]); // history of applied msgs

  // Reset phase on open, keep prefs
  React.useEffect(() => {
    if (visible) { setPhase('input'); setRefinements([]); setRefineText(''); }
  }, [visible]);

  const toggleFocus = key =>
    setFocus(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const appendNote = text => {
    setNotes(prev => prev ? `${prev.trim()}\n${text}` : text);
    notesRef.current?.focus();
  };

  const hasExisting  = trip?.days?.some(d => d.activities.length > 0);
  const allMembers   = trip ? getAllMembers(trip) : [];
  const families     = trip?.families || [];
  const summary      = dayActivities && trip ? planSummary(dayActivities, trip) : null;

  // ── Initial plan generation ───────────────────────────────────────────────
  const runPlanner = useCallback(async () => {
    if (!trip) return;
    setPhase('loading');
    setErrorMsg(null);
    setDayActivities(null);
    setProgress('Preparing…');
    try {
      const result = await callPlannerAPI(
        trip, travelers || [],
        { notes, pace, budget, focus },
        msg => setProgress(msg),
      );
      setDayActivities(result);
      setPhase('ready');
    } catch {
      setErrorMsg('Planning failed. Please try again.');
      setPhase('error');
    }
  }, [trip, travelers, notes, pace, budget, focus]);

  // ── Live refinement (chat input in ready phase) ───────────────────────────
  const handleRefine = useCallback(async () => {
    const text = refineText.trim();
    if (!text || isRefining || !trip) return;

    setRefineText('');
    setIsRefining(true);
    setProgress('Updating plan…');

    // Append this refinement to the running notes so context accumulates
    const updatedNotes = notes ? `${notes.trim()}\n${text}` : text;
    setNotes(updatedNotes);
    setRefinements(prev => [...prev, text]);

    try {
      const result = await callPlannerAPI(
        trip, travelers || [],
        { notes: updatedNotes, pace, budget, focus },
        msg => setProgress(msg),
        dayActivities,   // pass current plan so API can build refinement prompt
        text,            // the specific refinement instruction
      );
      setDayActivities(result);
    } catch {
      // Keep existing plan on error
    } finally {
      setIsRefining(false);
      setProgress('');
    }
  }, [refineText, isRefining, trip, travelers, notes, pace, budget, focus, dayActivities]);

  // ── Apply to store ────────────────────────────────────────────────────────
  const handleApply = () => {
    if (!dayActivities) return;
    setPhase('applying');
    setTimeout(() => {
      applyPlannedActivities(trip.id, dayActivities);
      showToast('Plan applied! Review and edit in the Plan tab.', '✅');
      onClose();
    }, 400);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: INPUT
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'input') return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.container, { paddingBottom: insets.bottom }]}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}><Text style={s.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={s.title}>✨ Plan with AI</Text>
            <View style={{ width: 64 }} />
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Trip summary card */}
            <View style={s.tripCard}>
              <Text style={s.tripEmoji}>{trip?.emoji || '✈️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.tripName} numberOfLines={1}>{trip?.name}</Text>
                <Text style={s.tripMeta}>📍 {trip?.destination}</Text>
                <Text style={s.tripMeta}>📅 {fmt(trip?.startDate)} – {fmt(trip?.endDate)}  ·  {trip?.days?.length} days</Text>
                <Text style={s.tripMeta}>👥 {allMembers.length} traveller{allMembers.length !== 1 ? 's' : ''}  ·  {families.length} group{families.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>

            {/* Group breakdown */}
            {families.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>YOUR GROUP</Text>
                {families.map(fam => {
                  const kids  = fam.members.filter(m => m.age < 13);
                  const needs = fam.members.filter(m => m.needs?.length > 0);
                  return (
                    <View key={fam.id} style={s.familyRow}>
                      <View style={[s.famDot, { backgroundColor: fam.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.famName, { color: fam.color }]}>{fam.name}</Text>
                        <Text style={s.famMeta}>
                          {fam.members.map(m => `${m.name.split(' ')[0]} (${m.age})`).join(', ')}
                          {kids.length > 0  ? `  ·  👧 ${kids.length} kid${kids.length > 1 ? 's' : ''}` : ''}
                          {needs.length > 0 ? '  ·  ♿ Accessibility' : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Pace */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>PACE</Text>
              <View style={s.optionGroup}>
                {PACE_OPTIONS.map(o => (
                  <TouchableOpacity key={o.key} style={[s.optionCard, pace === o.key && s.optionCardActive]} onPress={() => setPace(o.key)} activeOpacity={0.8}>
                    <Text style={[s.optionLabel, pace === o.key && s.optionLabelActive]}>{o.label}</Text>
                    <Text style={s.optionSub}>{o.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Budget */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>BUDGET</Text>
              <View style={s.optionGroup}>
                {BUDGET_OPTIONS.map(o => (
                  <TouchableOpacity key={o.key} style={[s.optionCard, budget === o.key && s.optionCardActive]} onPress={() => setBudget(o.key)} activeOpacity={0.8}>
                    <Text style={[s.optionLabel, budget === o.key && s.optionLabelActive]}>{o.label}</Text>
                    <Text style={s.optionSub}>{o.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Focus */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>FOCUS  <Text style={s.sectionHint}>pick any</Text></Text>
              <View style={s.chipRow}>
                {FOCUS_OPTIONS.map(o => (
                  <Chip key={o.key} label={`${o.emoji} ${o.label}`} active={focus.includes(o.key)} onPress={() => toggleFocus(o.key)} color={colors.primary} />
                ))}
              </View>
            </View>

            {/* Notes */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>NOTES  <Text style={s.sectionHint}>optional — tell the AI what you want</Text></Text>
              <TextInput
                ref={notesRef}
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                placeholder={'e.g. "Add Universal Studios for Day 2, we will have lunch there."\n\nOr: "Keep Day 1 relaxed — we arrive late. More beach time please."'}
                placeholderTextColor={colors.muted}
              />
              <Text style={s.suggestionsLabel}>Quick suggestions</Text>
              <View style={s.chipRow}>
                {NOTE_SUGGESTIONS.map(sug => (
                  <TouchableOpacity key={sug} style={s.suggestionChip} onPress={() => appendNote(sug)} activeOpacity={0.75}>
                    <Text style={s.suggestionText}>+ {sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Warning */}
            {hasExisting && (
              <View style={s.warnBanner}>
                <Text style={s.warnIcon}>⚠️</Text>
                <Text style={s.warnText}>Generating a new plan will replace your current itinerary. Splitwise expenses are not affected.</Text>
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity style={s.generateBtn} onPress={runPlanner} activeOpacity={0.85}>
              <Text style={s.generateBtnText}>✨ Generate Plan</Text>
              <Text style={s.generateBtnSub}>
                {trip?.days?.length} days  ·  {allMembers.length} travellers  ·  {BUDGET_OPTIONS.find(o => o.key === budget)?.label}  ·  {PACE_OPTIONS.find(o => o.key === pace)?.label}
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.container, { paddingBottom: insets.bottom }]}>
        <View style={s.header}>
          <View style={{ width: 64 }} />
          <Text style={s.title}>✨ Plan with AI</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={s.centreBox}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.xl }} />
          <Text style={s.loadTitle}>Building your itinerary…</Text>
          <Text style={s.loadMsg}>{progress}</Text>
          {!!notes.trim() && (
            <View style={s.notesPreview}>
              <Text style={s.notesPreviewLabel}>Your instructions</Text>
              <Text style={s.notesPreviewText} numberOfLines={3}>{notes}</Text>
            </View>
          )}
          <View style={s.checkList}>
            {[
              '🗺️  Checking destination database',
              notes.trim() ? '📝  Applying your instructions' : '👥  Profiling your group',
              '💡  Selecting activities',
              '💰  Estimating costs',
            ].map(item => <Text key={item} style={s.checkItem}>{item}</Text>)}
          </View>
        </View>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: ERROR
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'error') return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { paddingBottom: insets.bottom }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}><Text style={s.cancel}>Close</Text></TouchableOpacity>
          <Text style={s.title}>✨ Plan with AI</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={s.centreBox}>
          <Text style={{ fontSize: 48, marginBottom: spacing.xl }}>⚠️</Text>
          <Text style={s.loadTitle}>Something went wrong</Text>
          <Text style={s.loadMsg}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={runPlanner}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.backLink} onPress={() => setPhase('input')}>
            <Text style={s.backLinkText}>← Change inputs</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: READY — plan preview + live refinement chat bar
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'ready') return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.container, { paddingBottom: 0 }]}>

          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => setPhase('input')}>
              <Text style={s.cancel}>← Edit</Text>
            </TouchableOpacity>
            <Text style={s.title}>✨ Plan Ready</Text>
            <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
              <Text style={s.applyBtnText}>Apply →</Text>
            </TouchableOpacity>
          </View>

          {/* Refinement history pills */}
          {refinements.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.historyBar} contentContainerStyle={{ paddingHorizontal: spacing.xxl, gap: spacing.sm, alignItems: 'center' }}>
              <Text style={s.historyLabel}>Applied:</Text>
              {refinements.map((r, i) => (
                <View key={i} style={s.historyChip}>
                  <Text style={s.historyChipText} numberOfLines={1}>✓ {r}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Plan scroll */}
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Summary banner */}
            {summary && (
              <View style={s.summaryBanner}>
                <View style={s.summaryItem}>
                  <Text style={s.summaryVal}>{summary.activityCount}</Text>
                  <Text style={s.summaryLabelTxt}>Activities</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Text style={s.summaryVal}>{fmtM(summary.totalCost)}</Text>
                  <Text style={s.summaryLabelTxt}>Per person est.</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryItem}>
                  <Text style={s.summaryVal}>{fmtM(summary.totalCost * allMembers.length)}</Text>
                  <Text style={s.summaryLabelTxt}>Group total</Text>
                </View>
              </View>
            )}

            {/* Notes applied */}
            {!!notes.trim() && (
              <View style={s.notesApplied}>
                <Text style={s.notesAppliedIcon}>📝</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.notesAppliedTitle}>Instructions applied</Text>
                  <Text style={s.notesAppliedText} numberOfLines={2}>{notes}</Text>
                </View>
              </View>
            )}

            {/* Options recap */}
            <View style={s.optionsRecap}>
              <View style={s.recapChip}><Text style={s.recapChipText}>{PACE_OPTIONS.find(o => o.key === pace)?.label}</Text></View>
              <View style={s.recapChip}><Text style={s.recapChipText}>{BUDGET_OPTIONS.find(o => o.key === budget)?.label}</Text></View>
              {focus.map(f => { const fo = FOCUS_OPTIONS.find(o => o.key === f); return fo ? <View key={f} style={s.recapChip}><Text style={s.recapChipText}>{fo.emoji} {fo.label}</Text></View> : null; })}
            </View>

            {/* Warning if replacing */}
            {hasExisting && (
              <View style={s.warnBanner}>
                <Text style={s.warnIcon}>⚠️</Text>
                <Text style={s.warnText}>Applying will replace your current itinerary. Splitwise expenses are not affected.</Text>
              </View>
            )}

            {/* Updating overlay */}
            {isRefining && (
              <View style={s.updatingOverlay}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={s.updatingText}>{progress || 'Updating plan…'}</Text>
              </View>
            )}

            {/* Day-by-day */}
            {summary?.dayBreakdowns.map((day, i) => (
              <View key={i} style={[s.dayBlock, isRefining && s.dayBlockDimmed]}>
                <View style={s.dayHeader}>
                  <Text style={s.dayLabel}>{day.label}</Text>
                  {!!day.date && <Text style={s.dayDate}>{fmt(day.date)}</Text>}
                  {day.cost > 0 && (
                    <View style={s.dayCostBadge}>
                      <Text style={s.dayCostText}>{fmtM(day.cost)}/person</Text>
                    </View>
                  )}
                </View>
                {day.activities.length === 0
                  ? <Text style={s.emptyDay}>No activities planned</Text>
                  : day.activities.map((act, j) => (
                    <View key={j} style={[s.actRow, { borderLeftColor: activityColors[act.type] || colors.muted }]}>
                      <Text style={s.actTime}>{act.time}</Text>
                      <Text style={s.actTypeIcon}>{activityIcons[act.type] || '📌'}</Text>
                      <View style={s.actInfo}>
                        <Text style={s.actName} numberOfLines={1}>{act.name}</Text>
                        {!!act.detail  && <Text style={s.actDetail}  numberOfLines={1}>{act.detail}</Text>}
                        {!!act.address && <Text style={s.actAddress} numberOfLines={1}>📍 {act.address}</Text>}
                        {!!act.note    && <Text style={s.actNote}    numberOfLines={1}>💡 {act.note}</Text>}
                      </View>
                      {act.costPerPerson > 0 && <Text style={s.actCost}>${act.costPerPerson}</Text>}
                    </View>
                  ))
                }
              </View>
            ))}

            {/* Bottom apply */}
            <TouchableOpacity style={s.applyBigBtn} onPress={handleApply} activeOpacity={0.85}>
              <Text style={s.applyBigText}>✅  Apply This Plan</Text>
              {summary && allMembers.length > 0 && (
                <Text style={s.applyBigSub}>{summary.activityCount} activities · {fmtM(summary.totalCost * allMembers.length)} group total</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* ── Live refinement chat bar ─────────────────────────────── */}
          <View style={[s.refineBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={s.refineHint}>
              <Text style={s.refineHintText}>💬 Refine your plan — tell AI to make changes</Text>
            </View>
            <View style={s.refineInputRow}>
              <TextInput
                ref={refineRef}
                style={s.refineInput}
                value={refineText}
                onChangeText={setRefineText}
                placeholder={REFINE_EXAMPLES[refinements.length % REFINE_EXAMPLES.length]}
                placeholderTextColor={colors.muted}
                returnKeyType="send"
                onSubmitEditing={handleRefine}
                editable={!isRefining}
                multiline={false}
              />
              <TouchableOpacity
                style={[s.refineBtn, (!refineText.trim() || isRefining) && s.refineBtnDisabled]}
                onPress={handleRefine}
                disabled={!refineText.trim() || isRefining}
                activeOpacity={0.8}
              >
                {isRefining
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.refineBtnIcon}>↑</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE: APPLYING
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.container, { paddingBottom: insets.bottom }]}>
        <View style={s.header}>
          <View style={{ width: 64 }} />
          <Text style={s.title}>✨ Plan with AI</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={s.centreBox}>
          <ActivityIndicator size="large" color={colors.green} style={{ marginBottom: spacing.xl }} />
          <Text style={s.loadTitle}>Applying your plan…</Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#fff',
  },
  title:       { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  cancel:      { ...typography.body, color: colors.primary },
  applyBtn:    { backgroundColor: colors.primary, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  applyBtnText:{ ...typography.smallBold, color: '#fff' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: spacing.xxl, paddingBottom: 60 },

  // Trip card
  tripCard: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: colors.text, borderRadius: radius.xl,
    padding: spacing.xl, marginBottom: spacing.xl,
  },
  tripEmoji: { fontSize: 32, marginTop: 2 },
  tripName:  { ...typography.h4, color: '#fff', marginBottom: 4 },
  tripMeta:  { ...typography.caption, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  // Sections
  section:     { marginBottom: spacing.xl },
  sectionLabel:{ fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md },
  sectionHint: { fontWeight: '400', textTransform: 'none', color: colors.muted, fontSize: 10 },

  // Group
  familyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.sm },
  famDot:    { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  famName:   { ...typography.smallBold, marginBottom: 2 },
  famMeta:   { ...typography.caption, color: colors.muted, lineHeight: 16 },

  // Option cards
  optionGroup:       { gap: spacing.sm },
  optionCard:        { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  optionCardActive:  { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionLabel:       { ...typography.smallBold, color: colors.muted },
  optionLabelActive: { color: colors.primary },
  optionSub:         { ...typography.caption, color: colors.muted, marginTop: 2 },

  // Chips
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestionChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.surface, borderStyle: 'dashed' },
  suggestionText: { ...typography.caption, color: colors.muted, fontStyle: 'italic' },
  suggestionsLabel:{ ...typography.caption, color: colors.muted, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.md },

  // Notes
  notesInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.lg, fontSize: 14, color: colors.text,
    backgroundColor: '#fff', minHeight: 120, lineHeight: 22, marginBottom: spacing.sm,
  },

  // Warnings
  warnBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: '#fff8e6', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: '#fde68a' },
  warnIcon:   { fontSize: 16 },
  warnText:   { ...typography.caption, color: '#92400e', flex: 1, lineHeight: 18 },

  // Generate button
  generateBtn:    { backgroundColor: colors.ai, borderRadius: radius.xl, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.sm, ...shadow.md },
  generateBtnText:{ ...typography.bodyBold, color: '#fff', fontSize: 17 },
  generateBtnSub: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'center' },

  // Loading/error centre
  centreBox:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  loadTitle:         { ...typography.h4, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  loadMsg:           { ...typography.body, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl },
  notesPreview:      { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.border, alignSelf: 'stretch' },
  notesPreviewLabel: { ...typography.caption, color: colors.muted, fontWeight: '700', marginBottom: 4 },
  notesPreviewText:  { ...typography.caption, color: colors.text, lineHeight: 18, fontStyle: 'italic' },
  checkList:         { alignSelf: 'stretch', gap: spacing.sm },
  checkItem:         { ...typography.small, color: colors.muted, fontWeight: '600' },
  retryBtn:          { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radius.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  retryText:         { ...typography.bodyBold, color: '#fff' },
  backLink:          { marginTop: spacing.lg },
  backLinkText:      { ...typography.small, color: colors.primary, fontWeight: '700' },

  // Ready: refinement history bar
  historyBar:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm, maxHeight: 48 },
  historyLabel:    { ...typography.caption, color: colors.muted, fontWeight: '700', marginRight: spacing.xs },
  historyChip:     { backgroundColor: colors.greenLight, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 3, borderWidth: 1, borderColor: '#b2dfdb', maxWidth: 200 },
  historyChipText: { ...typography.caption, color: colors.green, fontWeight: '700' },

  // Ready: summary
  summaryBanner:  { flexDirection: 'row', backgroundColor: colors.text, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryVal:     { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  summaryLabelTxt:{ ...typography.caption, color: 'rgba(255,255,255,0.5)', marginTop: 2, textAlign: 'center', fontSize: 10 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: spacing.sm },

  // Ready: notes applied
  notesApplied:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.aiLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(108,92,231,0.2)' },
  notesAppliedIcon:  { fontSize: 16 },
  notesAppliedTitle: { ...typography.smallBold, color: colors.ai, marginBottom: 2 },
  notesAppliedText:  { ...typography.caption, color: colors.ai, lineHeight: 16, fontStyle: 'italic' },

  // Ready: options recap
  optionsRecap:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  recapChip:     { backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  recapChipText: { ...typography.caption, color: colors.muted, fontWeight: '700', fontSize: 10 },

  // Ready: updating overlay
  updatingOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#fff', borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primary,
    ...shadow.sm,
  },
  updatingText: { ...typography.smallBold, color: colors.primary },

  // Day blocks
  dayBlock:       { backgroundColor: '#fff', borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  dayBlockDimmed: { opacity: 0.5 },
  dayHeader:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayLabel:       { ...typography.bodyBold, color: colors.text, flex: 1 },
  dayDate:        { ...typography.caption, color: colors.muted, fontSize: 11 },
  dayCostBadge:   { backgroundColor: colors.greenLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: '#b2dfdb' },
  dayCostText:    { ...typography.caption, color: colors.green, fontWeight: '700', fontSize: 11 },
  emptyDay:       { ...typography.caption, color: colors.muted, padding: spacing.lg },

  // Activity row
  actRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  actTime:     { ...typography.caption, color: colors.muted, fontWeight: '700', fontSize: 10, width: 38, paddingTop: 2 },
  actTypeIcon: { fontSize: 14, paddingTop: 1 },
  actInfo:     { flex: 1 },
  actName:     { ...typography.smallBold, color: colors.text },
  actDetail:   { ...typography.caption, color: colors.muted, fontSize: 11, marginTop: 1 },
  actAddress:  { ...typography.caption, color: colors.primary, fontSize: 10, marginTop: 1 },
  actNote:     { ...typography.caption, color: '#9b6e00', fontSize: 10, marginTop: 1, fontStyle: 'italic' },
  actCost:     { ...typography.caption, color: '#9b6e00', fontWeight: '700', fontSize: 11, paddingTop: 2 },

  // Bottom apply
  applyBigBtn:  { backgroundColor: colors.green, borderRadius: radius.xl, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.xl, ...shadow.md },
  applyBigText: { ...typography.bodyBold, color: '#fff', fontSize: 16 },
  applyBigSub:  { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  // ── Live refinement bar (sticky bottom) ─────────────────────────────────
  refineBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  refineHint: { marginBottom: spacing.xs },
  refineHintText: { ...typography.caption, color: colors.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  refineInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  refineInput: {
    flex: 1,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: 14, color: colors.text, backgroundColor: colors.surface2,
  },
  refineBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  refineBtnDisabled: { backgroundColor: colors.border },
  refineBtnIcon: { fontSize: 18, color: '#fff', fontWeight: '800' },
});
