/**
 * AddProfileModal.js
 *
 * Create or edit a global traveler profile.
 * Profiles persist across all trips. A traveler is created once here,
 * then added to any trip with their preferences pre-filled.
 */

import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { uid } from '../utils/helpers';
import { ModalHeader, FormField, ChipSelector } from '../components/ui';

const PACE_OPTIONS = [
  { value: 'relaxed', label: '🐢 Relaxed' },
  { value: 'moderate', label: '🚶 Moderate' },
  { value: 'packed', label: '🏃 Packed' },
];

const DIETARY_OPTIONS = [
  { value: 'vegetarian',  label: '🥦 Vegetarian' },
  { value: 'vegan',       label: '🌱 Vegan' },
  { value: 'halal',       label: '🥩 Halal' },
  { value: 'kosher',      label: '✡️ Kosher' },
  { value: 'gluten-free', label: '🌾 Gluten-free' },
  { value: 'nut-allergy', label: '🥜 Nut allergy' },
];

const NEEDS_OPTIONS = [
  { value: 'wheelchair',  label: '♿ Wheelchair' },
  { value: 'mobility aid', label: '🦯 Mobility aid' },
  { value: 'infant',      label: '👶 Infant' },
  { value: 'elderly',     label: '🧓 Elderly' },
  { value: 'hearing loop', label: '🔊 Hearing loop' },
  { value: 'dietary',     label: '🍽️ Dietary' },
];

const INTEREST_OPTIONS = [
  { value: 'museums',    label: '🏛️ Museums' },
  { value: 'beaches',    label: '🏖️ Beaches' },
  { value: 'hiking',     label: '🥾 Hiking' },
  { value: 'food',       label: '🍜 Food & Dining' },
  { value: 'shopping',   label: '🛍️ Shopping' },
  { value: 'nightlife',  label: '🌃 Nightlife' },
  { value: 'nature',     label: '🌿 Nature' },
  { value: 'history',    label: '🏰 History' },
  { value: 'sport',      label: '⚽ Sport' },
  { value: 'art',        label: '🎨 Art' },
];

const PROFILE_EMOJIS = ['👤', '👩', '👨', '👧', '👦', '👵', '👴', '👶', '🧑', '🧒', '🧓', '🧔', '👩‍🦳', '👨‍🦳'];

// MultiChip — allows selecting multiple values
function MultiChipSelector({ label, options, selected, onToggle }) {
  return (
    <View style={mcs.wrap}>
      <Text style={mcs.label}>{label}</Text>
      <View style={mcs.chips}>
        {options.map(opt => {
          const active = selected.includes(opt.value);
          return (
            <Text
              key={opt.value}
              onPress={() => onToggle(opt.value)}
              style={[mcs.chip, active && mcs.chipActive]}
            >
              {opt.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const mcs = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  label: { ...typography.caption, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    ...typography.caption,
    color: colors.muted,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontWeight: '700',
  },
});

export default function AddProfileModal({ visible, editProfile, onClose }) {
  const { createTraveler, updateTraveler } = useStore();
  const isEdit = !!editProfile;

  const [name, setName]       = useState('');
  const [age, setAge]         = useState('');
  const [emoji, setEmoji]     = useState('👤');
  const [dietary, setDietary] = useState([]);
  const [needs, setNeeds]     = useState([]);
  const [interests, setInterests] = useState([]);
  const [pace, setPace]       = useState('moderate');
  const [notes, setNotes]     = useState('');

  useEffect(() => {
    if (visible) {
      if (editProfile) {
        setName(editProfile.name || '');
        setAge(editProfile.age ? String(editProfile.age) : '');
        setEmoji(editProfile.emoji || '👤');
        setDietary(editProfile.dietary || []);
        setNeeds(editProfile.needs || []);
        setInterests(editProfile.interests || []);
        setPace(editProfile.pacePreference || 'moderate');
        setNotes(editProfile.notes || '');
      } else {
        setName(''); setAge(''); setEmoji('👤');
        setDietary([]); setNeeds([]); setInterests([]);
        setPace('moderate'); setNotes('');
      }
    }
  }, [visible, editProfile]);

  const toggle = (setter, arr) => (val) =>
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      age: parseInt(age) || null,
      emoji,
      dietary,
      needs,
      interests,
      pacePreference: pace,
      notes: notes.trim(),
    };
    if (isEdit) {
      updateTraveler(editProfile.id, payload);
    } else {
      createTraveler({ ...payload, id: uid() });
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <ModalHeader
            title={isEdit ? 'Edit Profile' : 'New Traveler Profile'}
            onClose={onClose}
            onAction={handleSave}
            actionLabel={isEdit ? 'Save' : 'Create'}
            actionDisabled={!name.trim()}
          />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* Emoji picker */}
            <Text style={styles.sectionLabel}>Avatar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xl }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {PROFILE_EMOJIS.map(e => (
                  <Text
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={[styles.emojiOpt, emoji === e && styles.emojiOptActive]}
                  >
                    {e}
                  </Text>
                ))}
              </View>
            </ScrollView>

            <FormField label="Full Name *" value={name} onChangeText={setName} placeholder="e.g. Sarah Johnson" autoFocus={!isEdit} />
            <FormField label="Age" value={age} onChangeText={setAge} placeholder="e.g. 34" keyboardType="number-pad" />

            <ChipSelector
              label="Preferred Pace"
              options={PACE_OPTIONS}
              selected={pace}
              onSelect={setPace}
            />

            <MultiChipSelector
              label="Dietary Requirements"
              options={DIETARY_OPTIONS}
              selected={dietary}
              onToggle={toggle(setDietary, dietary)}
            />

            <MultiChipSelector
              label="Special Needs"
              options={NEEDS_OPTIONS}
              selected={needs}
              onToggle={toggle(setNeeds, needs)}
            />

            <MultiChipSelector
              label="Interests"
              options={INTEREST_OPTIONS}
              selected={interests}
              onToggle={toggle(setInterests, interests)}
            />

            <FormField
              label="Personal Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the planner should know…"
              multiline
            />

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  sectionLabel: {
    ...typography.caption,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  emojiOpt: {
    fontSize: 28,
    padding: 6,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  emojiOptActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
});
