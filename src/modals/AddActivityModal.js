/**
 * AddActivityModal.js
 *
 * Compact, family-first activity editor.
 *
 * Key design decisions:
 *   - 4×2 type grid — all 8 types visible without scrolling
 *   - Transport subtypes: Flight / Drive / Train / Ship
 *   - Cost mode: Per Person  OR  Per Family (the USP)
 *   - No accessibility field (handled by AI agents, not manual entry)
 *   - Notes + Reminder at the bottom
 */

import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { uid } from '../utils/helpers';
import { ModalHeader } from '../components/ui';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE_GAP = 8;
const TILE_W   = Math.floor((SCREEN_W - spacing.xxl * 2 - TILE_GAP * 3) / 4);

// ─── Activity type grid (4 per row) ──────────────────────────────────────────
const TILES = [
  { type: 'transport', subtype: 'flight', icon: '✈️', label: 'Flight',   color: '#3b82f6' },
  { type: 'transport', subtype: 'car',    icon: '🚗', label: 'Drive',    color: '#3b82f6' },
  { type: 'transport', subtype: 'train',  icon: '🚂', label: 'Train',    color: '#3b82f6' },
  { type: 'transport', subtype: 'ship',   icon: '🚢', label: 'Ship',     color: '#3b82f6' },
  { type: 'stay',      subtype: null,     icon: '🏨', label: 'Stay',     color: '#8b5cf6' },
  { type: 'food',      subtype: null,     icon: '🍽️', label: 'Meal',     color: '#f97316' },
  { type: 'activity',  subtype: null,     icon: '🎯', label: 'Activity', color: '#10b981' },
  { type: 'note',      subtype: null,     icon: '💬', label: 'Other',    color: '#6b7280' },
];

function tileKey(t) { return `${t.type}:${t.subtype || ''}` ; }

function findTile(type, subtype) {
  return TILES.find(t => t.type === type && t.subtype === (subtype || null))
      || TILES.find(t => t.type === type)
      || TILES[6]; // default: Activity
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function AddActivityModal({ visible, trip, currentDay, onClose, editActivity, defaultTime }) {
  const { addActivity, updateActivity } = useStore();
  const isEdit = !!editActivity;

  // Type / subtype
  const [tile, setTile]           = useState(TILES[6]);  // Activity default

  // Core fields
  const [name, setName]           = useState('');
  const [time, setTime]           = useState(defaultTime || '09:00');
  const [detail, setDetail]       = useState('');

  // Cost
  const [costMode, setCostMode]   = useState('per_person'); // 'per_person' | 'per_family'
  const [costInput, setCostInput] = useState('');

  // Notes + Reminder
  const [memo, setMemo]           = useState('');
  const [reminder, setReminder]   = useState('');

  // Seed fields on open
  useEffect(() => {
    if (!visible) return;
    if (editActivity) {
      setTile(findTile(editActivity.type, editActivity.subtype));
      setName(editActivity.name || '');
      setTime(editActivity.time || '09:00');
      setDetail(editActivity.detail || '');
      setCostMode(editActivity.costMode || 'per_person');
      setCostInput(editActivity.costAmount > 0 ? String(editActivity.costAmount) : '');
      setMemo(editActivity.memo || '');
      setReminder(editActivity.reminder || '');
    } else {
      setTile(TILES[6]);
      setName('');
      setTime(defaultTime || '09:00');
      setDetail('');
      setCostMode('per_person');
      setCostInput('');
      setMemo('');
      setReminder('');
    }
  }, [visible, editActivity, defaultTime]);

  // ── Cost calculations ──────────────────────────────────────────────────────
  const totalMembers  = trip.families.reduce((s, f) => s + f.members.length, 0);
  const familyCount   = trip.families.length;
  const avgFamilySize = familyCount > 0 ? totalMembers / familyCount : 1;
  const parsedCost    = parseFloat(costInput) || 0;

  // costPerPerson is always the per-person value stored in the activity
  const costPerPerson = parsedCost > 0
    ? costMode === 'per_person'
      ? parsedCost
      : costMode === 'per_family'
        ? parsedCost / avgFamilySize   // family cost → approximate per person
        : parsedCost / (totalMembers || 1) // total cost → divide by all members
    : 0;

  // Display hint
  const costHintText = parsedCost > 0 && (
    costMode === 'per_person'
      ? `${totalMembers} travellers → est. $${(parsedCost * totalMembers).toFixed(0)} total`
      : costMode === 'per_family'
        ? `${familyCount} famil${familyCount !== 1 ? 'ies' : 'y'} → est. $${(parsedCost * familyCount).toFixed(0)} total`
        : `Shared total · $${costPerPerson.toFixed(2)}/person across ${totalMembers} travellers`
  );

  const syncNote = trip.itineraryPushed
    ? isEdit ? '✅ Splitwise expense updates automatically'
              : parsedCost > 0 ? '✅ Will be added to Splitwise automatically' : null
    : null;

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!name.trim()) return;
    const payload = {
      type:         tile.type,
      subtype:      tile.subtype || null,
      name:         name.trim(),
      time,
      detail:       detail.trim(),
      costMode,
      costAmount:   parsedCost,
      costPerPerson,
      memo:         memo.trim() || null,
      reminder:     reminder.trim() || null,
      access:       '',  // kept in schema for AI-generated activities
    };
    if (isEdit) {
      updateActivity(trip.id, editActivity.id, payload);
    } else {
      addActivity(trip.id, currentDay, { ...payload, id: uid() });
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>

          <ModalHeader
            title={isEdit ? 'Edit Activity' : 'Add Activity'}
            onClose={onClose}
            onAction={handleSave}
            actionLabel={isEdit ? 'Save' : 'Add'}
            actionDisabled={!name.trim()}
          />

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── Type grid ── */}
            <Text style={s.sectionLabel}>TYPE</Text>
            <View style={s.tileGrid}>
              {TILES.map(t => {
                const active = tileKey(t) === tileKey(tile);
                return (
                  <TouchableOpacity
                    key={tileKey(t)}
                    style={[s.tile, active && { borderColor: t.color, backgroundColor: t.color + '18' }]}
                    onPress={() => setTile(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.tileIcon}>{t.icon}</Text>
                    <Text style={[s.tileLabel, active && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Name ── */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>NAME *</Text>
            <TextInput
              style={s.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={tile.type === 'transport' ? `e.g. ${tile.label} to Paris` : tile.type === 'stay' ? 'e.g. Marriott Downtown' : tile.type === 'food' ? 'e.g. Breakfast at hotel' : 'e.g. Visit Eiffel Tower'}
              placeholderTextColor={colors.muted}
              autoFocus={!isEdit}
              returnKeyType="next"
            />

            {/* ── Time ── */}
            <View style={s.inlineRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionLabel}>TIME</Text>
                <View style={s.timeInputWrap}>
                  <Text style={s.timeIcon}>🕐</Text>
                  <TextInput
                    style={s.timeInput}
                    value={time}
                    onChangeText={setTime}
                    placeholder="09:00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </View>
            </View>

            {/* ── Details ── */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>DETAILS <Text style={s.optional}>(optional)</Text></Text>
            <TextInput
              style={s.detailInput}
              value={detail}
              onChangeText={setDetail}
              placeholder="Booking ref, meeting point, what to expect…"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {/* ── Cost ── */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>COST</Text>

            {/* Cost mode toggle */}
            <View style={s.costModeRow}>
              <TouchableOpacity
                style={[s.costModeBtn, costMode === 'per_person' && s.costModeBtnActive]}
                onPress={() => setCostMode('per_person')}
              >
                <Text style={[s.costModeBtnText, costMode === 'per_person' && s.costModeBtnTextActive]}>
                  👤 Per Person
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costModeBtn, costMode === 'per_family' && s.costModeBtnActive]}
                onPress={() => setCostMode('per_family')}
              >
                <Text style={[s.costModeBtnText, costMode === 'per_family' && s.costModeBtnTextActive]}>
                  👨‍👩‍👧 Per Family
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costModeBtn, costMode === 'total' && s.costModeBtnActiveTotal]}
                onPress={() => setCostMode('total')}
              >
                <Text style={[s.costModeBtnText, costMode === 'total' && s.costModeBtnTextActiveTotal]}>
                  💰 Total
                </Text>
              </TouchableOpacity>
            </View>

            {/* Cost amount */}
            <View style={s.costInputWrap}>
              <Text style={s.costCurrency}>$</Text>
              <TextInput
                style={s.costInput}
                value={costInput}
                onChangeText={setCostInput}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <Text style={s.costSuffix}>
                {costMode === 'per_person' ? '/ person' : costMode === 'per_family' ? '/ family' : 'total'}
              </Text>
            </View>

            {/* Cost hint */}
            {!!costHintText && (
              <View style={s.costHint}>
                <Text style={s.costHintText}>📊 {costHintText}</Text>
                {costMode === 'per_family' && (
                  <Text style={s.costHintSub}>Each family pays equally — the Voyara moat ✦</Text>
                )}
                {costMode === 'total' && (
                  <Text style={s.costHintSub}>Total shared cost — ideal for Airbnbs, vans, group tickets ✦</Text>
                )}
              </View>
            )}

            {/* Splitwise sync */}
            {!!syncNote && (
              <View style={s.syncNote}>
                <Text style={s.syncNoteText}>{syncNote}</Text>
              </View>
            )}

            {/* ── Notes / Memo ── */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>NOTES <Text style={s.optional}>(personal)</Text></Text>
            <TextInput
              style={s.detailInput}
              value={memo}
              onChangeText={setMemo}
              placeholder="Pack sunscreen, book tickets in advance, wear comfortable shoes…"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {/* ── Reminder ── */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>REMINDER <Text style={s.optional}>(optional)</Text></Text>
            <View style={s.reminderWrap}>
              <Text style={s.reminderIcon}>🔔</Text>
              <TextInput
                style={s.reminderInput}
                value={reminder}
                onChangeText={setReminder}
                placeholder="e.g. Book 2 weeks ahead · Check passport · Pack adapter"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll:    { flex: 1 },
  content:   { padding: spacing.xxl, paddingBottom: 60 },

  sectionLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  optional:     { fontSize: 9, fontWeight: '400', color: '#c0c8d0', textTransform: 'none', letterSpacing: 0 },

  // Type grid
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: {
    width: TILE_W,
    height: TILE_W * 0.85,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    ...shadow.sm,
  },
  tileIcon:  { fontSize: 22 },
  tileLabel: { fontSize: 10, color: colors.muted, fontWeight: '600', textAlign: 'center' },

  // Name
  nameInput: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    ...shadow.sm,
  },

  // Inline row
  inlineRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },

  // Time
  timeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  timeIcon:  { fontSize: 16 },
  timeInput: { fontSize: 16, color: colors.text, fontWeight: '600', minWidth: 60 },

  // Detail / Memo
  detailInput: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 64,
    ...shadow.sm,
  },

  // Cost mode toggle
  costModeRow:        { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  costModeBtn:        { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center' },
  costModeBtnActive:       { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  costModeBtnActiveTotal:  { borderColor: '#059669', backgroundColor: '#d1fae5' },
  costModeBtnText:         { fontSize: 12, fontWeight: '600', color: colors.muted },
  costModeBtnTextActive:   { color: colors.primary, fontWeight: '800' },
  costModeBtnTextActiveTotal: { color: '#059669', fontWeight: '800' },

  // Cost input
  costInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  costCurrency: { fontSize: 18, fontWeight: '700', color: colors.muted },
  costInput:    { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  costSuffix:   { fontSize: 13, color: colors.muted, fontWeight: '500' },

  // Cost hint
  costHint: {
    backgroundColor: colors.yellowLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#f0d080',
  },
  costHintText: { fontSize: 12, color: '#9b6e00', fontWeight: '600' },
  costHintSub:  { fontSize: 11, color: '#b8860b', marginTop: 2 },

  // Sync note
  syncNote: {
    backgroundColor: '#e8f5e9',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  syncNoteText: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },

  // Reminder
  reminderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  reminderIcon:  { fontSize: 16 },
  reminderInput: { flex: 1, fontSize: 14, color: colors.text },
});
