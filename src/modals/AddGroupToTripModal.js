/**
 * AddGroupToTripModal.js
 *
 * Pick a saved group (or create a new one from scratch) to add to the trip.
 *
 * Flow:
 *  1. User sees saved groups as cards.
 *  2. Tap a group to expand it and tick/untick individual members.
 *  3. "Add to Trip" creates a trip family from that group with only
 *     the selected members.
 */

import React, { useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { avatarColor, NEEDS_OPTIONS, effectiveMember } from '../utils/helpers';
import { ModalHeader } from '../components/ui';

const NEEDS_MAP = {};
NEEDS_OPTIONS.forEach(n => { NEEDS_MAP[n] = true; });

export default function AddGroupToTripModal({ visible, trip, onClose }) {
  const { travelers, groups, addGroupToTrip } = useStore();

  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [checkedIds, setCheckedIds]           = useState({});

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      setSelectedGroupId(null);
      setCheckedIds({});
    }
  }, [visible]);

  // When a group is selected, pre-check all its members
  const handleSelectGroup = (groupId) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setCheckedIds({});
      return;
    }
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    setSelectedGroupId(groupId);
    const next = {};
    group.travelerIds.forEach(id => { next[id] = true; });
    setCheckedIds(next);
  };

  const toggleTraveler = (tvId) =>
    setCheckedIds(prev => ({ ...prev, [tvId]: !prev[tvId] }));

  const selectedGroup  = groups.find(g => g.id === selectedGroupId);
  const selectedIds    = Object.keys(checkedIds).filter(id => checkedIds[id]);
  const canAdd         = selectedGroup && selectedIds.length > 0;

  // Groups already on this trip
  const tripGroupIds = new Set(trip.families.map(f => f.groupId).filter(Boolean));

  const handleAdd = () => {
    if (!canAdd) return;
    addGroupToTrip(trip.id, selectedGroupId, selectedIds);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <ModalHeader
            title="Add Saved Group"
            onClose={onClose}
            onAction={handleAdd}
            actionLabel="Add to Trip"
            actionDisabled={!canAdd}
          />

          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

            <Text style={s.hint}>
              Pick a saved group and choose which members to include. You can adjust needs and details after adding.
            </Text>

            {groups.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyEmoji}>📚</Text>
                <Text style={s.emptyTitle}>No saved groups yet</Text>
                <Text style={s.emptyBody}>
                  Build your traveler library first — add travelers in the People tab, then use "New Family" to group them.
                </Text>
              </View>
            )}

            {groups.map(group => {
              const isSelected = selectedGroupId === group.id;
              const alreadyOnTrip = tripGroupIds.has(group.id);
              const groupTravelers = (group.travelerIds || [])
                .map(id => travelers.find(tv => tv.id === id))
                .filter(Boolean);

              return (
                <View key={group.id} style={[s.groupCard, isSelected && s.groupCardSelected, { borderLeftColor: group.color }]}>

                  {/* Group header — tap to select */}
                  <TouchableOpacity
                    style={s.groupHeader}
                    onPress={() => !alreadyOnTrip && handleSelectGroup(group.id)}
                    activeOpacity={alreadyOnTrip ? 1 : 0.7}
                  >
                    <View style={[s.colorDot, { backgroundColor: group.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.groupName, isSelected && { color: group.color }]}>{group.name}</Text>
                      <Text style={s.groupSub}>
                        {groupTravelers.map(tv => tv.name.split(' ')[0]).join(', ') || 'No members'}
                      </Text>
                    </View>
                    {alreadyOnTrip ? (
                      <View style={s.addedBadge}>
                        <Text style={s.addedText}>✓ On trip</Text>
                      </View>
                    ) : (
                      <View style={[s.selectCircle, isSelected && { backgroundColor: group.color, borderColor: group.color }]}>
                        {isSelected && <Text style={s.selectCheck}>✓</Text>}
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Member list — only visible when group is selected */}
                  {isSelected && (
                    <View style={s.memberList}>
                      <Text style={s.memberListLabel}>Who's coming?</Text>
                      {groupTravelers.map(tv => {
                        const eff = effectiveMember({ travelerId: tv.id, name: tv.name, age: tv.age, needs: tv.needs }, travelers);
                        const isChecked = !!checkedIds[tv.id];

                        return (
                          <TouchableOpacity
                            key={tv.id}
                            style={[s.memberRow, isChecked && s.memberRowChecked]}
                            onPress={() => toggleTraveler(tv.id)}
                            activeOpacity={0.7}
                          >
                            <View style={[s.avatar, { backgroundColor: avatarColor(tv.name) }]}>
                              <Text style={s.avatarText}>{tv.name[0]}</Text>
                            </View>
                            <View style={s.memberInfo}>
                              <Text style={s.memberName}>{tv.name}</Text>
                              <Text style={s.memberMeta}>
                                {tv.age ? `${tv.age}yo` : ''}
                                {eff.needs.length > 0 ? (tv.age ? ' · ' : '') + eff.needs.join(', ') : ''}
                              </Text>
                            </View>
                            <View style={[s.checkbox, isChecked && { backgroundColor: group.color, borderColor: group.color }]}>
                              {isChecked && <Text style={s.checkboxTick}>✓</Text>}
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {selectedIds.length > 0 && (
                        <View style={s.selectionSummary}>
                          <Text style={s.selectionText}>
                            {selectedIds.length} of {groupTravelers.length} traveler{groupTravelers.length !== 1 ? 's' : ''} selected
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 80 },

  hint: { ...typography.body, color: colors.muted, marginBottom: spacing.xl, lineHeight: 20 },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { ...typography.h4, color: colors.text, marginBottom: 8 },
  emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  groupCard: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  groupCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderLeftWidth: 4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  groupName: { ...typography.bodyBold, color: colors.text },
  groupSub: { ...typography.small, color: colors.muted, marginTop: 1 },

  selectCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  selectCheck: { color: '#fff', fontSize: 12, fontWeight: '800' },

  addedBadge: {
    backgroundColor: colors.greenLight,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addedText: { ...typography.caption, color: colors.green, fontWeight: '700' },

  // Member list (expanded)
  memberList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  memberListLabel: {
    ...typography.caption,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  memberRowChecked: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { ...typography.bodyBold, color: colors.text },
  memberMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '800' },

  selectionSummary: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectionText: { ...typography.caption, color: colors.primary, fontWeight: '700', textAlign: 'center' },
});
