/**
 * PasteImportModal.js — "Paste a plan → get a trip."
 *
 * The headline import flow: paste an itinerary from ChatGPT / Gemini / a travel blog and we draft
 * the whole day-by-day trip — DETERMINISTICALLY, no AI, no API (itineraryParser + itineraryImport).
 * It's a DRAFT: the user reviews + tweaks after. Flag-gated by RELEASE_FLAGS.smartPaste.
 *
 * Places enrichment (coords/hours/cost — which also lights up the timezone features) is a later
 * add; today this produces the full reviewable skeleton (dates, days, slots, names, types, times).
 */
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard,
} from 'react-native';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { ModalHeader } from '../components/ui';
import { importTripFromTextAsync } from '../utils/itineraryImport';

const SAMPLE = `Segment 1: Los Angeles (June 30 – July 3)
June 30: Arrival & Santa Monica
Land at LAX, grab your rental car, and head to the coast.
Spend the afternoon at the Santa Monica Pier.
July 1: Hollywood & Griffith Observatory
Morning: Hike the trails at Griffith Park.
Afternoon: Explore the Griffith Observatory.
Evening: Dinner in West Hollywood.
July 2: Theme Park or Museum Day
Option A: Universal Studios Hollywood.
Option B: The Getty Center and LACMA.
Segment 2: San Diego (July 3 – July 5)
July 3: Coastal drive to San Diego
Check out of your LA hotel.
Stop 1 (Laguna Beach): Stroll around Heisler Park.
July 4: Balboa Park & Zoo
Morning: Balboa Park.
Afternoon: San Diego Zoo.
July 5: Departure
Check out of your San Diego hotel.
Drive back to LAX and catch your flight home.`;

// Friendly progress steps shown while the trip is building. We don't have real per-stage events
// (the AI call is one round-trip), so we advance through these on a timer to keep the user engaged
// during the few seconds it takes — holding on the last step until the build actually finishes.
const BUILD_STEPS = [
  { emoji: '📖', text: 'Reading your plan…' },
  { emoji: '🗺️', text: 'Spotting your destinations…' },
  { emoji: '🧭', text: 'Laying out your days…' },
  { emoji: '📍', text: 'Pinning your stops…' },
  { emoji: '✨', text: 'Putting it all together…' },
];

export default function PasteImportModal({ visible, onClose, onCreated }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  // Cycle the progress messages while busy (step is reset to 0 in build() before busy flips on).
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setStep(s => Math.min(s + 1, BUILD_STEPS.length - 1)), 1500);
    return () => clearInterval(id);
  }, [busy]);

  const build = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) { if (!trimmed) showToast('Paste an itinerary first', '📋'); return; }
    Keyboard.dismiss();   // get the keyboard out of the way so the building… overlay is fully visible
    setStep(0);
    setBusy(true);
    try {
      // AI reads the text when a key is set (richer understanding); else the deterministic parser.
      const result = await importTripFromTextAsync(useStore.getState(), trimmed);
      if (!result || !result.trip) {
        showToast('Couldn’t read a day-by-day plan — try adding dates/days', '🗓️');
        return;
      }
      const { imported, days } = result.summary;
      const how = result.source === 'ai' ? '✨ AI' : 'auto';
      showToast(`${how}: drafted ${imported} stops across ${days} day${days !== 1 ? 's' : ''} — review & tweak`, '✨');
      setText('');
      onCreated?.(result.trip);
    } catch (err) {
      // Never leave the user staring at a dead button — surface the failure.
      console.warn('[PasteImport] build failed:', err?.message);
      showToast('Import hit a snag — please try again', '⚠️');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ModalHeader
          title="Paste a plan"
          closeLabel="Cancel"
          actionLabel="Build trip"
          onClose={onClose}
          onAction={build}
          actionColor={colors.accent}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>
            Have an itinerary from ChatGPT, Gemini, or a travel blog? Paste it below and we&apos;ll
            draft the whole trip — days, stops, and times — so you don&apos;t type a thing. You can
            review and tweak everything after.
          </Text>

          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder={'Paste your day-by-day plan here…\n\nJuly 1: …\nMorning: …\nAfternoon: …'}
            placeholderTextColor={colors.subtle}
          />

          <View style={s.row}>
            <TouchableOpacity onPress={() => setText(SAMPLE)} activeOpacity={0.7}>
              <Text style={s.link}>Try a sample ›</Text>
            </TouchableOpacity>
            {!!text && (
              <TouchableOpacity onPress={() => setText('')} activeOpacity={0.7}>
                <Text style={[s.link, { color: colors.subtle }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.note}>
            Works best with a dated, day-by-day plan (the more structure, the better). It&apos;s a
            starting draft — add photos, costs, and fine-tune on the next screen.
          </Text>

          <TouchableOpacity style={[s.buildBtn, busy && { opacity: 0.7 }]} onPress={build} activeOpacity={0.85} disabled={busy}>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#fff" />
                <Text style={s.buildBtnText}>Building your trip…</Text>
              </View>
            ) : (
              <Text style={s.buildBtnText}>✨ Build my trip</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {busy && (
          <View style={s.overlay}>
            <View style={s.loadingCard}>
              <Text style={s.loadingEmoji}>{BUILD_STEPS[step].emoji}</Text>
              <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: spacing.lg }} />
              <Text style={s.loadingText}>{BUILD_STEPS[step].text}</Text>
              <Text style={s.loadingSub}>Hang tight — building your trip from the plan.</Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  intro: { ...typography.small, color: colors.muted, lineHeight: 20, marginBottom: spacing.lg },
  input: {
    minHeight: 220, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.lg,
    padding: spacing.md, ...typography.body, color: colors.ink, backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  link: { ...typography.smallBold, color: colors.accent },
  note: { ...typography.caption, color: colors.subtle, lineHeight: 16, marginTop: spacing.lg },
  buildBtn: {
    marginTop: spacing.xl, backgroundColor: colors.accent, borderRadius: radius.xl,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  buildBtnText: { ...typography.bodyBold, color: '#fff' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xxl,
  },
  loadingCard: { alignItems: 'center', maxWidth: 320 },
  loadingEmoji: { fontSize: 44 },
  loadingText: { ...typography.h3, color: colors.ink, textAlign: 'center' },
  loadingSub: { ...typography.small, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
});
