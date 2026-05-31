import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import useStore from '../store';
import AddTravelerModal from '../modals/AddTravelerModal';
import AddFamilyModal from '../modals/AddFamilyModal';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { avatarColor, NEEDS_OPTIONS } from '../utils/helpers';
import { ChipSelector } from '../components/ui';

// ── Edit family name modal ─────────────────────────────────────────
function EditFamilyModal({ visible, initial, onSave, onClose }) {
  const [name, setName] = useState('');
  React.useEffect(() => { if (visible) setName(initial || ''); }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={em.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={em.card}>
          <Text style={em.title}>Edit Family</Text>
          <View style={em.fieldGroup}>
            <Text style={em.label}>Family Name</Text>
            <TextInput
              style={em.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sharma Family"
              autoFocus
              returnKeyType="done"
            />
          </View>
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

// ── Edit traveler modal (name + age + needs) ──────────────────────
const needsOpts = NEEDS_OPTIONS.map(n => ({ value: n, label: n }));

function EditTravelerModal({ visible, initial, onSave, onClose }) {
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {/* Header */}
          <View style={em.sheetHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={em.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={em.sheetTitle}>Edit Traveler</Text>
            <TouchableOpacity onPress={() => { if (canSave) { onSave({ name: name.trim(), age: parseInt(age) || 0, needs }); onClose(); } }} disabled={!canSave}>
              <Text style={[em.sheetSave, !canSave && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <View style={em.fieldGroup}>
              <Text style={em.label}>Full Name *</Text>
              <TextInput style={em.input} value={name} onChangeText={setName} placeholder="e.g. Raj Sharma" autoFocus returnKeyType="next" />
            </View>
            <View style={em.fieldGroup}>
              <Text style={em.label}>Age</Text>
              <TextInput style={em.input} value={age} onChangeText={setAge} placeholder="e.g. 42" keyboardType="number-pad" returnKeyType="done" />
            </View>
            <ChipSelector
              label="Special Needs / Accessibility"
              options={needsOpts}
              selected={needs}
              onSelect={toggleNeed}
              multi
              activeColor={colors.green}
              wrap
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function TravelersScreen({ trip }) {
  const { updateTraveler, deleteTraveler, updateFamily, deleteFamily } = useStore();

  const [showAddTraveler, setShowAddTraveler] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [collapsed, setCollapsed] = useState({});           // famId → bool
  const [editFamily, setEditFamily] = useState(null);       // { famId, name }
  const [editMember, setEditMember] = useState(null);       // { famId, memberId, name, age }
  const [addTravelerFamId, setAddTravelerFamId] = useState(null); // pre-selected family

  const toggleCollapse = (famId) =>
    setCollapsed(prev => ({ ...prev, [famId]: !prev[famId] }));

  const handleDeleteFamily = (fam) => {
    Alert.alert(
      'Delete Family',
      `Remove "${fam.name}" and all ${fam.members.length} member${fam.members.length !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteFamily(trip.id, fam.id) },
      ],
    );
  };

  const handleDeleteMember = (fam, member) => {
    Alert.alert(
      'Remove Traveler',
      `Remove ${member.name} from ${fam.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteTraveler(trip.id, fam.id, member.id) },
      ],
    );
  };

  const openAddTravelerForFamily = (famId) => {
    setAddTravelerFamId(famId);
    setShowAddTraveler(true);
  };

  const totalTravelers = trip.families.reduce((s, f) => s + f.members.length, 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Travelers & Families</Text>
            <Text style={styles.subtitle}>{trip.families.length} families · {totalTravelers} travelers</Text>
          </View>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowAddFamily(true)}>
            <Text style={styles.outlineBtnText}>+ Family</Text>
          </TouchableOpacity>
        </View>

        {/* Family cards */}
        {trip.families.map(fam => {
          const isCollapsed = !!collapsed[fam.id];
          return (
            <View key={fam.id} style={[styles.familyCard, { borderLeftColor: fam.color }]}>

              {/* Family header row */}
              <TouchableOpacity
                style={styles.familyHeader}
                onPress={() => toggleCollapse(fam.id)}
                activeOpacity={0.7}
              >
                <View style={styles.famHeaderLeft}>
                  <View style={[styles.famColorDot, { backgroundColor: fam.color }]} />
                  <View>
                    <Text style={[styles.familyName, { color: fam.color }]}>{fam.name}</Text>
                    <Text style={styles.memberCount}>
                      {fam.members.length} traveler{fam.members.length !== 1 ? 's' : ''}
                      {isCollapsed && fam.members.length > 0 ? '  ·  ' + fam.members.map(m => m.name.split(' ')[0]).join(', ') : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.famHeaderRight}>
                  {/* Add traveler to this family */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={e => { e.stopPropagation?.(); openAddTravelerForFamily(fam.id); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.iconBtnText}>➕</Text>
                  </TouchableOpacity>
                  {/* Edit family */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={e => { e.stopPropagation?.(); setEditFamily({ famId: fam.id, name: fam.name }); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.iconBtnText}>✏️</Text>
                  </TouchableOpacity>
                  {/* Delete family */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={e => { e.stopPropagation?.(); handleDeleteFamily(fam); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.iconBtnText}>🗑️</Text>
                  </TouchableOpacity>
                  {/* Collapse chevron */}
                  <Text style={[styles.chevron, isCollapsed && styles.chevronCollapsed]}>▾</Text>
                </View>
              </TouchableOpacity>

              {/* Members (hidden when collapsed) */}
              {!isCollapsed && (
                <View>
                  {fam.members.length === 0 && (
                    <View style={styles.emptyMembers}>
                      <Text style={styles.emptyMembersText}>No travelers yet</Text>
                      <TouchableOpacity onPress={() => openAddTravelerForFamily(fam.id)}>
                        <Text style={styles.emptyMembersLink}>+ Add traveler</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {fam.members.map((member, idx) => (
                    <View
                      key={member.id}
                      style={[
                        styles.memberRow,
                        idx === fam.members.length - 1 && styles.memberRowLast,
                      ]}
                    >
                      {/* Avatar */}
                      <View style={[styles.avatar, { backgroundColor: avatarColor(member.name) }]}>
                        <Text style={styles.avatarText}>{member.name[0]}</Text>
                      </View>

                      {/* Info column */}
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <Text style={styles.memberMeta}>Age {member.age}</Text>
                        {member.needs.length > 0 && (
                          <View style={styles.needsRow}>
                            {member.needs.map(need => (
                              <View key={need} style={styles.needTag}>
                                <Text style={styles.needText}>{need}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Action buttons */}
                      <View style={styles.memberActions}>
                        <TouchableOpacity
                          onPress={() => setEditMember({ famId: fam.id, memberId: member.id, name: member.name, age: member.age })}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.memberActionIcon}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteMember(fam, member)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.memberActionIcon}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Empty state */}
        {trip.families.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👨‍👩‍👧</Text>
            <Text style={styles.emptyTitle}>No families yet</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddFamily(true)}>
              <Text style={styles.emptyBtnText}>+ Add a Family</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Edit family name modal */}
      <EditFamilyModal
        visible={!!editFamily}
        initial={editFamily?.name}
        onSave={name => updateFamily(trip.id, editFamily.famId, { name })}
        onClose={() => setEditFamily(null)}
      />

      {/* Edit traveler modal — includes needs chips */}
      <EditTravelerModal
        visible={!!editMember}
        initial={editMember}
        onSave={updates => updateTraveler(trip.id, editMember.famId, editMember.memberId, updates)}
        onClose={() => setEditMember(null)}
      />

      <AddTravelerModal
        visible={showAddTraveler}
        trip={trip}
        defaultFamId={addTravelerFamId}
        onClose={() => { setShowAddTraveler(false); setAddTravelerFamId(null); }}
      />
      <AddFamilyModal visible={showAddFamily} trip={trip} onClose={() => setShowAddFamily(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 100 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.small, color: colors.muted, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  outlineBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  outlineBtnText: { ...typography.smallBold, color: colors.primary },

  // Family card
  familyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  familyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface2,
  },
  famHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  famColorDot: { width: 10, height: 10, borderRadius: 5 },
  familyName: { ...typography.bodyBold },
  memberCount: { ...typography.small, color: colors.muted, marginTop: 1 },
  famHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 4 },
  iconBtnText: { fontSize: 14 },
  chevron: { fontSize: 16, color: colors.muted, marginLeft: 4, transform: [{ rotate: '0deg' }] },
  chevronCollapsed: { transform: [{ rotate: '-90deg' }] },

  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  memberRowLast: {},
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { ...typography.bodyBold, color: colors.text },
  memberMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  needsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  needTag: { backgroundColor: colors.greenLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  needText: { ...typography.tinyBold, color: colors.green },
  memberActions: { flexDirection: 'row', gap: 4, paddingTop: 2 },
  memberActionIcon: { fontSize: 14, padding: 4 },

  // Empty members inside a family
  emptyMembers: { padding: spacing.lg, alignItems: 'center', gap: 6 },
  emptyMembersText: { ...typography.small, color: colors.muted },
  emptyMembersLink: { ...typography.smallBold, color: colors.primary },

  // Empty state (no families)
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h4, color: colors.muted, marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
});

// ── Edit modal styles ─────────────────────────────────────────────
const em = StyleSheet.create({
  // Centered overlay card (family name edit)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { ...typography.h4, color: colors.text, marginBottom: spacing.lg },
  fieldGroup: { marginBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center' },
  cancelText: { ...typography.bodyBold, color: colors.muted },
  saveBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { ...typography.bodyBold, color: '#fff' },
  // pageSheet header (traveler edit)
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetTitle: { ...typography.bodyBold, color: colors.text },
  sheetCancel: { ...typography.body, color: colors.muted },
  sheetSave: { ...typography.bodyBold, color: colors.primary },
});
