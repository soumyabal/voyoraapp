/**
 * PackingModal.js — the Smart Packing List UI.
 *
 * Renders buildPackingList(trip) grouped by category: each item shows WHY it's there (the
 * contextual reason) and a checkbox whose state persists on trip.packing (togglePackingItem).
 * A progress bar + a celebratory all-packed state make it feel alive. Suggestions are derived;
 * only the ticks are stored.
 */
import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import useStore from '../store';
import { colors, spacing, typography } from '../theme';
import { ModalHeader } from '../components/ui';
import Icon from '../components/ui/Icon';
import { buildPackingList } from '../utils/packing';

const CAT_ICON = {
  Documents: 'document-text-outline', Electronics: 'phone-portrait-outline', Clothing: 'shirt-outline',
  Toiletries: 'sparkles', Health: 'medkit-outline', Activities: 'walk-outline', Kids: 'happy-outline',
  Essentials: 'briefcase-outline',
};

export default function PackingModal({ visible, trip, onClose }) {
  const { togglePackingItem } = useStore();
  const { items, byCategory } = buildPackingList(trip);
  const checkedMap = trip?.packing || {};
  const checkedCount = items.filter(i => checkedMap[i.key]).length;
  const total = items.length;
  const pct = total ? Math.round((checkedCount / total) * 100) : 0;
  const allDone = total > 0 && checkedCount === total;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <ModalHeader title="Packing List" closeLabel="Done" onClose={onClose} />

        {/* Progress */}
        <View style={s.progressWrap}>
          <View style={s.progressHead}>
            <Text style={s.progressText}>
              {allDone ? '🎉 All packed — you’re ready!' : `${checkedCount} of ${total} packed`}
            </Text>
            <Text style={s.progressPct}>{pct}%</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }, allDone && { backgroundColor: colors.success }]} />
          </View>
          <Text style={s.smartNote}>Tailored to your itinerary, dates & who’s coming — tap why anytime.</Text>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {byCategory.map(group => (
            <View key={group.category} style={s.section}>
              <View style={s.sectionHead}>
                <Icon name={CAT_ICON[group.category] || 'pricetag-outline'} size={15} color={colors.smart} />
                <Text style={s.sectionTitle}>{group.category}</Text>
                <Text style={s.sectionCount}>{group.items.filter(i => checkedMap[i.key]).length}/{group.items.length}</Text>
              </View>
              {group.items.map(item => {
                const checked = !!checkedMap[item.key];
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={s.row}
                    onPress={() => togglePackingItem(trip.id, item.key)}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`${item.label}. ${item.reason}`}
                  >
                    <Icon
                      name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={checked ? colors.success : colors.subtle}
                    />
                    <View style={s.rowBody}>
                      <Text style={[s.rowLabel, checked && s.rowLabelDone]}>{item.label}</Text>
                      {!!item.reason && <Text style={s.rowReason}>{item.reason}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <Text style={s.footer}>Smart suggestions — add your own essentials too. Nothing here is set in stone.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  progressWrap: { paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  progressText: { ...typography.bodyBold, color: colors.ink },
  progressPct: { ...typography.caption, color: colors.smart, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 999, backgroundColor: colors.smart },
  smartNote: { ...typography.caption, color: colors.subtle, marginTop: 8, lineHeight: 16 },
  content: { paddingHorizontal: spacing.xxl, paddingBottom: 60, paddingTop: spacing.sm },
  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  sectionTitle: { ...typography.bodyBold, color: colors.body, flex: 1, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.3 },
  sectionCount: { ...typography.caption, color: colors.subtle, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowBody: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.ink, fontWeight: '600' },
  rowLabelDone: { color: colors.subtle, textDecorationLine: 'line-through' },
  rowReason: { ...typography.caption, color: colors.subtle, marginTop: 1 },
  footer: { ...typography.caption, color: colors.subtle, textAlign: 'center', marginTop: spacing.md, lineHeight: 16 },
});
