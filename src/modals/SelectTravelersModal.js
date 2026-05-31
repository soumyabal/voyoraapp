/**
 * SelectTravelersModal.js
 *
 * United Airlines-style saved traveler picker.
 *
 * Flow:
 *  1. See all travelers grouped by their saved group (+ "No group" section)
 *  2. Tap travelers to select them (checkboxes)
 *  3. Choose which trip family to add them to (existing or create new group)
 *  4. Tap "Add to Trip"
 *
 * This is the primary way to get travelers onto a trip from the People tab.
 */

import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput,
} from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { avatarColor, effectiveMember, uid } from '../utils/helpers';
import { ModalHeader } from '../components/ui';

const PACE_LABELS = { relaxed: '🐢', moderate: '🚶', packed: '🏃' };

export default function SelectTravelersModal({ visible, trip, onClose }) {
  const { travelers, groups, addTraveler, addFamilyFull } = useStore();

  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [targetFamId, setTargetFamId]     = useState('__new__');
  const [newGroupName, setNewGroupName]   = useState('');
  const [search, setSearch]               = useState('');

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      setSelectedIds(new Set());
      setTargetFamId(trip.families.length > 0 ? trip.families[0].id : '__new__');
      setNewGroupName('');
      setSearch('');
    }
  }, [visible]);

  // Travelers already on this trip
  const alreadyOnTrip = useMemo(() => {
    const ids = new Set();
    trip.families.forEach(f => f.members.forEach(m => { if (m.travelerId) ids.add(m.travelerId); }));
    return ids;
  }, [trip]);

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return travelers;
    return travelers.filter(tv => tv.name.toLowerCase().includes(q));
  }, [travelers, search]);

  // Group travelers into sections: one per saved group, then "No group"
  const sections = useMemo(() => {
    const result = [];
    const assigned = new Set();

    groups.forEach(g => {
      const members = g.travelerIds
        .map(id => filtered.find(tv => tv.id === id))
        .filter(Boolean);
      if (members.length > 0) {
        result.push({ type: 'group', group: g, travelers: members });
        members.forEach(tv => assigned.add(tv.id));
      }
    });

    const unassigned = filtered.filter(tv => !assigned.has(tv.id));
    if (unassigned.length > 0) {
      result.push({ type: 'ungrouped', travelers: unassigned });
    }
    return result;
  }, [filtered, groups]);

  const toggle = (tvId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(tvId)) next.delete(tvId);
      else next.add(tvId);
      return next;
    });
  };

  const canAdd = selectedIds.size > 0 && (targetFamId !== '__new__' || newGroupName.trim().length > 0);

  const handleAdd = () => {
    if (!canAdd) return;
    const selectedArr = [...selectedIds];

    if (targetFamId === '__new__') {
      // Create a new trip family with all selected travelers
      const members = selectedArr.map(tvId => {
        const tv = travelers.find(t => t.id === tvId);
        return tv ? {
          id: uid(), travelerId: tv.id,
          name: tv.name, age: tv.age || 25,
          needs: [...(tv.needs || [])],
        } : null;
      }).filter(Boolean);
      addFamilyFull(trip.id, { name: newGroupName.trim(), members });
    } else {
      // Add each selected traveler to an existing family
      selectedArr.forEach(tvId => {
        const tv = travelers.find(t => t.id === tvId);
        if (!tv) return;
        addTraveler(trip.id, targetFamId, {
          id: uid(), travelerId: tv.id,
          name: tv.name, age: tv.age || 25,
          needs: [...(tv.needs || [])],
        });
      });
    }

    onClose();
  };

  const totalSelected = selectedIds.size;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <ModalHeader
          title={totalSelected > 0 ? `${totalSelected} selected` : 'Select Travelers'}
          onClose={onClose}
          onAction={handleAdd}
          actionLabel="Add to Trip"
          actionDisabled={!canAdd}
        />

        {/* Search bar */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search travelers…"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Selected preview strip */}
        {totalSelected > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.selectedStrip} contentContainerStyle={s.selectedStripContent}>
            {[...selectedIds].map(tvId => {
              const tv = travelers.find(t => t.id === tvId);
              if (!tv) return null;
              return (
                <TouchableOpacity key={tvId} style={s.selectedChip} onPress={() => toggle(tvId)}>
                  <View style={[s.selectedAvatar, { backgroundColor: avatarColor(tv.name) }]}>
                    <Text style={s.selectedAvatarText}>{tv.name[0]}</Text>
                  </View>
                  <Text style={s.selectedChipName}>{tv.name.split(' ')[0]}</Text>
                  <Text style={s.selectedChipX}>✕</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {travelers.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>👥</Text>
              <Text style={s.emptyTitle}>No travelers in library</Text>
              <Text style={s.emptyBody}>Go to the Travelers tab on the home screen to add people to your library first.</Text>
            </View>
          )}

          {/* Traveler sections */}
          {sections.map((section, sIdx) => (
            <View key={sIdx} style={s.section}>
              {/* Section header */}
              {section.type === 'group' ? (
                <View style={[s.sectionHeader, { borderLeftColor: section.group.color }]}>
                  <View style={[s.sectionDot, { backgroundColor: section.group.color }]} />
                  <Text style={s.sectionTitle}>{section.group.name}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const unselected = section.travelers.filter(tv => !selectedIds.has(tv.id) && !alreadyOnTrip.has(tv.id));
                      if (unselected.length > 0) {
                        setSelectedIds(prev => { const next = new Set(prev); unselected.forEach(tv => next.add(tv.id)); return next; });
                      }
                    }}
                    style={s.selectAllBtn}
                  >
                    <Text style={s.selectAllText}>Select all</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.sectionHeaderPlain}>
                  <Text style={s.sectionTitleMuted}>Other travelers</Text>
                </View>
              )}

              {/* Traveler rows */}
              {section.travelers.map(tv => {
                const eff = effectiveMember({ travelerId: tv.id, name: tv.name, age: tv.age, needs: tv.needs }, travelers);
                const isSelected = selectedIds.has(tv.id);
                const onTrip = alreadyOnTrip.has(tv.id);

                return (
                  <TouchableOpacity
                    key={tv.id}
                    style={[s.row, isSelected && s.rowSelected, onTrip && s.rowOnTrip]}
                    onPress={() => !onTrip && toggle(tv.id)}
                    activeOpacity={onTrip ? 1 : 0.7}
                  >
                    {/* Avatar */}
                    <View style={[s.avatar, { backgroundColor: onTrip ? '#ccc' : avatarColor(tv.name) }]}>
                      <Text style={s.avatarText}>{tv.emoji || tv.name[0]}</Text>
                    </View>

                    {/* Info */}
                    <View style={s.rowInfo}>
                      <View style={s.rowNameRow}>
                        <Text style={[s.rowName, onTrip && s.rowNameMuted]}>{tv.name}</Text>
                        {onTrip && <View style={s.onTripBadge}><Text style={s.onTripText}>On trip</Text></View>}
                      </View>
                      <Text style={s.rowMeta}>
                        {tv.age ? `${tv.age}yo` : ''}
                        {eff.pacePreference ? ' · ' + PACE_LABELS[eff.pacePreference] : ''}
                        {(eff.needs || []).length > 0 ? ' · ' + eff.needs.slice(0, 2).join(', ') : ''}
                      </Text>
                      {(tv.dietary || []).length > 0 && (
                        <Text style={s.rowDietary}>{tv.dietary.join(' · ')}</Text>
                      )}
                    </View>

                    {/* Checkbox */}
                    {onTrip ? (
                      <Text style={s.onTripCheck}>✓</Text>
                    ) : (
                      <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                        {isSelected && <Text style={s.checkboxTick}>✓</Text>}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Add to — family picker */}
          {totalSelected > 0 && (
            <View style={s.targetSection}>
              <Text style={s.targetLabel}>Add selected to</Text>

              {trip.families.map(fam => (
                <TouchableOpacity
                  key={fam.id}
                  style={[s.targetOption, targetFamId === fam.id && s.targetOptionSelected]}
                  onPress={() => setTargetFamId(fam.id)}
                >
                  <View style={[s.targetDot, { backgroundColor: fam.color }]} />
                  <Text style={[s.targetName, targetFamId === fam.id && { color: colors.primary, fontWeight: '800' }]}>
                    {fam.name}
                  </Text>
                  <View style={[s.targetRadio, targetFamId === fam.id && s.targetRadioSelected]}>
                    {targetFamId === fam.id && <View style={s.targetRadioDot} />}
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[s.targetOption, targetFamId === '__new__' && s.targetOptionSelected]}
                onPress={() => setTargetFamId('__new__')}
              >
                <Text style={s.targetNewIcon}>＋</Text>
                <Text style={[s.targetName, targetFamId === '__new__' && { color: colors.primary, fontWeight: '800' }]}>
                  New group
                </Text>
                <View style={[s.targetRadio, targetFamId === '__new__' && s.targetRadioSelected]}>
                  {targetFamId === '__new__' && <View style={s.targetRadioDot} />}
                </View>
              </TouchableOpacity>

              {targetFamId === '__new__' && (
                <TextInput
                  style={s.newGroupInput}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder="Group name (e.g. Sharma Family)"
                  placeholderTextColor={colors.muted}
                  autoFocus
                  returnKeyType="done"
                />
              )}
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 80 },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xxl,
    marginVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, ...typography.body, color: colors.text },
  searchClear: { fontSize: 13, color: colors.muted, padding: 2 },

  // Selected strip
  selectedStrip: { maxHeight: 72, borderBottomWidth: 1, borderBottomColor: colors.border },
  selectedStripContent: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm, gap: spacing.sm, flexDirection: 'row' },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectedAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  selectedChipName: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  selectedChipX: { ...typography.caption, color: colors.primary, fontSize: 10 },

  // Empty
  empty: { alignItems: 'center', padding: spacing.xxxl },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { ...typography.h4, color: colors.text, marginBottom: 8 },
  emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 20 },

  // Section
  section: { marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    backgroundColor: colors.surface2,
    marginBottom: 2,
  },
  sectionHeaderPlain: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface2,
    marginBottom: 2,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { ...typography.bodyBold, color: colors.text, flex: 1 },
  sectionTitleMuted: { ...typography.caption, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  selectAllBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.primaryLight },
  selectAllText: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  // Traveler row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  rowSelected: { backgroundColor: colors.primaryLight },
  rowOnTrip: { backgroundColor: colors.bg, opacity: 0.7 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  rowInfo: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { ...typography.bodyBold, color: colors.text },
  rowNameMuted: { color: colors.muted },
  onTripBadge: { backgroundColor: colors.greenLight, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  onTripText: { ...typography.caption, color: colors.green, fontWeight: '700', fontSize: 10 },
  rowMeta: { ...typography.small, color: colors.muted, marginTop: 2 },
  rowDietary: { ...typography.caption, color: '#a29bfe', marginTop: 1 },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  onTripCheck: { fontSize: 18, color: colors.green, fontWeight: '800' },

  // Target family picker
  targetSection: {
    margin: spacing.xxl,
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  targetLabel: {
    ...typography.caption,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface2,
  },
  targetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  targetOptionSelected: { backgroundColor: colors.primaryLight },
  targetDot: { width: 10, height: 10, borderRadius: 5 },
  targetNewIcon: { fontSize: 18, color: colors.primary, width: 10, textAlign: 'center' },
  targetName: { ...typography.body, color: colors.text, flex: 1 },
  targetRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  targetRadioSelected: { borderColor: colors.primary },
  targetRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  newGroupInput: {
    ...typography.body,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
  },
});
