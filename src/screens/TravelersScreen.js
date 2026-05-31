/**
 * TravelersScreen.js — "People" tab inside a trip
 *
 * Intentionally simple: shows who is on THIS trip.
 * Library and group management moved to the global Travelers tab on the home screen.
 *
 * Primary action: "Select from Saved" → United-style SelectTravelersModal
 * Secondary:      "New Group" → AddFamilyModal (manual entry)
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import useStore from '../store';
import AddTravelerModal from '../modals/AddTravelerModal';
import AddFamilyModal from '../modals/AddFamilyModal';
import SelectTravelersModal from '../modals/SelectTravelersModal';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { avatarColor, effectiveMember, NEEDS_OPTIONS } from '../utils/helpers';
import { ChipSelector } from '../components/ui';
import { useKeyboardOffset } from '../utils/useKeyboardOffset';

// ── Edit family name ───────────────────────────────────────────────
function EditFamilyModal({ visible, initial, onSave, onClose }) {
  const [name, setName] = useState('');
  React.useEffect(() => { if (visible) setName(initial || ''); }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={em.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={em.card}>
          <Text style={em.title}>Edit Group Name</Text>
          <TextInput
            style={em.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Sharma Family"
            autoFocus
            returnKeyType="done"
          />
          <View style={em.btnRow}>
            <TouchableOpacity style={em.cancelBtn} onPress={onClose}>
              <Text style={em.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[em.saveBtn, !name.trim() && em.saveBtnDisabled]}
              onPress={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }}
              disabled={!name.trim()}
            >
              <Text style={em.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Edit traveler (trip-level overrides) ───────────────────────────
const needsOpts = NEEDS_OPTIONS.map(n => ({ value: n, label: n }));

function EditTravelerModal({ visible, initial, onSave, onClose }) {
  const kbOffset = useKeyboardOffset();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [needs, setNeeds] = useState([]);

  React.useEffect(() => {
    if (visible && initial) {
      setName(initial.name || '');
      setAge(String(initial.age ?? ''));
      setNeeds(initial.needs || []);
    }
  }, [visible, initial]);

  const toggleNeed = (n) =>
    setNeeds(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const canSave = name.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: kbOffset }}>
          <View style={em.sheetHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={em.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={em.sheetTitle}>Edit for This Trip</Text>
            <TouchableOpacity
              onPress={() => { if (canSave) onSave({ name: name.trim(), age: parseInt(age) || 0, needs }); }}
              disabled={!canSave}
            >
              <Text style={[em.sheetSave, !canSave && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <View style={em.sheetHint}>
            <Text style={em.sheetHintText}>Changes apply to this trip only. Edit the global profile in the Travelers tab.</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={em.fieldLabel}>Display Name *</Text>
              <TextInput style={em.input} value={name} onChangeText={setName} placeholder="e.g. Raj Sharma" autoFocus returnKeyType="next" />
            </View>
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={em.fieldLabel}>Age</Text>
              <TextInput style={em.input} value={age} onChangeText={setAge} placeholder="e.g. 42" keyboardType="number-pad" returnKeyType="done" />
            </View>
            <ChipSelector
              label="Special Needs for This Trip"
              options={needsOpts}
              selected={needs}
              onSelect={toggleNeed}
              multi
              activeColor={colors.green}
              wrap
            />
          </ScrollView>
        </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function TravelersScreen({ trip, onUpdatePlan }) {
  const { travelers, deleteTraveler, setMemberOverride, updateFamily, deleteFamily } = useStore();

  const [showSelect, setShowSelect]           = useState(false);
  const [showAddTraveler, setShowAddTraveler] = useState(false);
  const [showAddFamily, setShowAddFamily]     = useState(false);
  const [collapsed, setCollapsed]             = useState({});
  const [editFamily, setEditFamily]           = useState(null);
  const [editMember, setEditMember]           = useState(null);
  const [addTravelerFamId, setAddTravelerFamId] = useState(null);
  const [travelersChanged, setTravelersChanged] = useState(false);

  const toggleCollapse = (famId) =>
    setCollapsed(prev => ({ ...prev, [famId]: !prev[famId] }));

  const markChanged = () => setTravelersChanged(true);

  const confirmDeleteFamily = (fam) => {
    Alert.alert(
      'Remove Group',
      `Remove "${fam.name}" and all ${fam.members.length} traveler${fam.members.length !== 1 ? 's' : ''} from this trip?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => { deleteFamily(trip.id, fam.id); markChanged(); },
        },
      ],
    );
  };

  const confirmDeleteMember = (fam, member) => {
    Alert.alert(
      'Remove Traveler',
      `Remove ${member.name} from ${fam.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => { deleteTraveler(trip.id, fam.id, member.id); markChanged(); },
        },
      ],
    );
  };

  const hasOverride = (member) => {
    if (!member.travelerId) return false;
    const tv = travelers.find(t => t.id === member.travelerId);
    if (!tv) return false;
    if (member._nameOverride) return true;
    if (member.needs?.length > 0 && JSON.stringify(member.needs) !== JSON.stringify(tv.needs || [])) return true;
    return false;
  };

  const totalTravelers = trip.families.reduce((s, f) => s + f.members.length, 0);
  const hasLibrary = travelers.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, onUpdatePlan && travelersChanged && { paddingBottom: 130 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ─────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Who's Coming</Text>
            <Text style={styles.subtitle}>
              {trip.families.length} group{trip.families.length !== 1 ? 's' : ''} · {totalTravelers} traveler{totalTravelers !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowAddFamily(true)}>
            <Text style={styles.outlineBtnText}>+ Group</Text>
          </TouchableOpacity>
        </View>

        {/* ── Primary CTA: Select from saved ─────────────── */}
        <TouchableOpacity
          style={[styles.selectCta, !hasLibrary && styles.selectCtaDim]}
          onPress={() => hasLibrary && setShowSelect(true)}
          activeOpacity={hasLibrary ? 0.8 : 1}
        >
          <View style={styles.selectCtaLeft}>
            <Text style={styles.selectCtaIcon}>👥</Text>
            <View>
              <Text style={styles.selectCtaTitle}>Select from Saved Travelers</Text>
              <Text style={styles.selectCtaSub}>
                {hasLibrary
                  ? `${travelers.length} traveler${travelers.length !== 1 ? 's' : ''} in your library`
                  : 'Add travelers in the Travelers tab first'}
              </Text>
            </View>
          </View>
          <Text style={styles.selectCtaArrow}>›</Text>
        </TouchableOpacity>

        {/* ── Trip groups ─────────────────────────────────── */}
        {trip.families.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✈️</Text>
            <Text style={styles.emptyTitle}>No one added yet</Text>
            <Text style={styles.emptyBody}>
              Select from your saved travelers, or create a new group manually.
            </Text>
          </View>
        ) : (
          trip.families.map(fam => {
            const isCollapsed = !!collapsed[fam.id];
            return (
              <View key={fam.id} style={[styles.familyCard, { borderLeftColor: fam.color }]}>

                {/* Family header */}
                <TouchableOpacity
                  style={styles.familyHeader}
                  onPress={() => toggleCollapse(fam.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.famLeft}>
                    <View style={[styles.famDot, { backgroundColor: fam.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.famName, { color: fam.color }]}>{fam.name}</Text>
                      <Text style={styles.famCount}>
                        {fam.members.length} traveler{fam.members.length !== 1 ? 's' : ''}
                        {isCollapsed && fam.members.length > 0
                          ? '  ·  ' + fam.members.map(m => m.name.split(' ')[0]).join(', ')
                          : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.famRight}>
                    <TouchableOpacity
                      onPress={e => { e.stopPropagation?.(); setAddTravelerFamId(fam.id); setShowAddTraveler(true); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.iconBtn}
                    >
                      <Text style={styles.iconBtnText}>➕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={e => { e.stopPropagation?.(); setEditFamily({ famId: fam.id, name: fam.name }); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.iconBtn}
                    >
                      <Text style={styles.iconBtnText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={e => { e.stopPropagation?.(); confirmDeleteFamily(fam); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.iconBtn}
                    >
                      <Text style={styles.iconBtnText}>🗑️</Text>
                    </TouchableOpacity>
                    <Text style={[styles.chevron, isCollapsed && styles.chevronUp]}>▾</Text>
                  </View>
                </TouchableOpacity>

                {/* Members */}
                {!isCollapsed && (
                  <View>
                    {fam.members.length === 0 && (
                      <View style={styles.emptyMembers}>
                        <Text style={styles.emptyMembersText}>No travelers yet</Text>
                        <TouchableOpacity onPress={() => { setAddTravelerFamId(fam.id); setShowAddTraveler(true); }}>
                          <Text style={styles.emptyMembersLink}>+ Add traveler</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {fam.members.map((member, idx) => {
                      const eff = effectiveMember(member, travelers);
                      const overridden = hasOverride(member);
                      return (
                        <View
                          key={member.id}
                          style={[styles.memberRow, idx === fam.members.length - 1 && styles.memberRowLast]}
                        >
                          <View style={[styles.avatar, { backgroundColor: avatarColor(member.name) }]}>
                            <Text style={styles.avatarText}>{member.name[0]}</Text>
                          </View>

                          <View style={styles.memberInfo}>
                            <View style={styles.memberNameRow}>
                              <Text style={styles.memberName}>{member.name}</Text>
                              {overridden && (
                                <View style={styles.overrideBadge}>
                                  <Text style={styles.overrideBadgeText}>trip override</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.memberMeta}>Age {member.age}</Text>
                            {eff.needs.length > 0 && (
                              <View style={styles.needsRow}>
                                {eff.needs.map(need => (
                                  <View key={need} style={styles.needTag}>
                                    <Text style={styles.needText}>{need}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>

                          <View style={styles.memberActions}>
                            <TouchableOpacity
                              onPress={() => setEditMember({ famId: fam.id, memberId: member.id, name: member.name, age: member.age, needs: member.needs || [] })}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={styles.memberActionIcon}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => confirmDeleteMember(fam, member)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={styles.memberActionIcon}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Update Plan sticky banner — shown when travelers changed and AI mode */}
      {onUpdatePlan && travelersChanged && (
        <View style={styles.updateBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.updateBannerTitle}>👥 Travelers updated</Text>
            <Text style={styles.updateBannerSub}>Regenerate the plan to reflect your group changes.</Text>
          </View>
          <TouchableOpacity
            style={styles.updateBannerBtn}
            onPress={() => { setTravelersChanged(false); onUpdatePlan(); }}
            activeOpacity={0.85}
          >
            <Text style={styles.updateBannerBtnText}>✨ Update Plan</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modals */}
      <EditFamilyModal
        visible={!!editFamily}
        initial={editFamily?.name}
        onSave={name => updateFamily(trip.id, editFamily.famId, { name })}
        onClose={() => setEditFamily(null)}
      />
      <EditTravelerModal
        visible={!!editMember}
        initial={editMember}
        onSave={updates => {
          setMemberOverride(trip.id, editMember.famId, editMember.memberId, updates);
          setEditMember(null);
          markChanged();
        }}
        onClose={() => setEditMember(null)}
      />
      <SelectTravelersModal
        visible={showSelect}
        trip={trip}
        onClose={() => { setShowSelect(false); markChanged(); }}
      />
      <AddTravelerModal
        visible={showAddTraveler}
        trip={trip}
        defaultFamId={addTravelerFamId}
        onClose={() => { setShowAddTraveler(false); setAddTravelerFamId(null); markChanged(); }}
      />
      <AddFamilyModal
        visible={showAddFamily}
        trip={trip}
        onClose={() => { setShowAddFamily(false); markChanged(); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 100 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.small, color: colors.muted, marginTop: 2 },
  outlineBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  outlineBtnText: { ...typography.smallBold, color: colors.primary },

  // Select from saved CTA
  selectCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  selectCtaDim: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selectCtaLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  selectCtaIcon: { fontSize: 26 },
  selectCtaTitle: { ...typography.bodyBold, color: '#fff', marginBottom: 2 },
  selectCtaSub: { ...typography.caption, color: 'rgba(255,255,255,0.75)', lineHeight: 16 },
  selectCtaArrow: { color: '#fff', fontSize: 24, fontWeight: '300' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { ...typography.h4, color: colors.text, marginBottom: 6 },
  emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  // Family card
  familyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  familyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface2,
  },
  famLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  famDot: { width: 10, height: 10, borderRadius: 5 },
  famName: { ...typography.bodyBold },
  famCount: { ...typography.small, color: colors.muted, marginTop: 1 },
  famRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 4 },
  iconBtnText: { fontSize: 14 },
  chevron: { fontSize: 16, color: colors.muted, marginLeft: 4 },
  chevronUp: { transform: [{ rotate: '-90deg' }] },

  // Member row
  memberRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  memberRowLast: {},
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberName: { ...typography.bodyBold, color: colors.text },
  overrideBadge: { backgroundColor: '#fff3cd', borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#ffc107' },
  overrideBadgeText: { fontSize: 9, color: '#856404', fontWeight: '700' },
  memberMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  needsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  needTag: { backgroundColor: colors.greenLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  needText: { ...typography.tinyBold, color: colors.green },
  memberActions: { flexDirection: 'row', gap: 4, paddingTop: 2 },
  memberActionIcon: { fontSize: 14, padding: 4 },

  emptyMembers: { padding: spacing.lg, alignItems: 'center', gap: 6 },
  emptyMembersText: { ...typography.small, color: colors.muted },
  emptyMembersLink: { ...typography.smallBold, color: colors.primary },

  // Update Plan sticky banner
  updateBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ai,
    padding: spacing.lg,
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
    ...shadow.lg,
  },
  updateBannerTitle: { ...typography.smallBold, color: '#fff' },
  updateBannerSub: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  updateBannerBtn: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexShrink: 0,
  },
  updateBannerBtnText: { ...typography.smallBold, color: colors.ai },
});

// ── Inline modal styles ───────────────────────────────────────────
const em = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xxl, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: colors.border },
  title: { ...typography.h4, color: colors.text, marginBottom: spacing.lg },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center' },
  cancelText: { ...typography.bodyBold, color: colors.muted },
  saveBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { ...typography.bodyBold, color: '#fff' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  sheetTitle: { ...typography.bodyBold, color: colors.text },
  sheetCancel: { ...typography.body, color: colors.muted },
  sheetSave: { ...typography.bodyBold, color: colors.primary },
  sheetHint: { backgroundColor: '#fff8e6', paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#fde68a' },
  sheetHintText: { ...typography.caption, color: '#92400e', lineHeight: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
});
