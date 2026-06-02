import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { getAllMembers, fmt, fmtM } from '../utils/helpers';
import { calcTripItineraryTotal } from '../utils/costs';
import Icon from './ui/Icon';

// Compact list row: emoji thumbnail · name + one meta line · total.
// Kept short on purpose — the spotlight handles the "hero" treatment.
export default function TripCard({ trip, onPress, style }) {
  const allMembers   = getAllMembers(trip);
  const itinTotal    = calcTripItineraryTotal(trip);
  const expTotal     = trip.expenses.filter(e => e.source === 'manual').reduce((s, e) => s + e.amount, 0);
  const hasAccessible = trip.families.some(f => f.members.some(m => m.needs.length > 0));

  return (
    <TouchableOpacity
      style={[styles.card, trip.archived && styles.cardArchived, style]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={trip.bgColors || ['#e17055', '#fdcb6e']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.thumb, trip.archived && { opacity: 0.5 }]}
      >
        <Text style={styles.emoji}>{trip.emoji}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          {trip.archived && <Icon name="check" size={14} color={colors.success} />}
          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        </View>
        <View style={styles.metaRow}>
          <Icon name="location" size={12} color={colors.subtle} />
          <Text style={styles.meta} numberOfLines={1}>
            {trip.destination} · {fmt(trip.startDate)}–{fmt(trip.endDate)} · {trip.days.length}d
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Icon name="people" size={12} color={colors.subtle} />
          <Text style={styles.meta} numberOfLines={1}>
            {trip.families.length} famil{trip.families.length !== 1 ? 'ies' : 'y'} · {allMembers.length} {allMembers.length !== 1 ? 'people' : 'person'}
          </Text>
          {hasAccessible && <Icon name="accessible" size={12} color={colors.success} style={{ marginLeft: 2 }} />}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.totalAmt}>{fmtM(itinTotal + expTotal)}</Text>
        <Text style={styles.totalLabel}>est.</Text>
        <Icon name="forward" size={16} color={colors.subtle} style={{ marginTop: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.hairline,
    padding: spacing.sm, paddingRight: spacing.md,
    marginBottom: spacing.md, ...shadow.sm,
  },
  cardArchived: { backgroundColor: '#f6faf7', borderColor: '#cde7d6' },
  thumb: {
    width: 58, height: 58, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 28 },
  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...typography.h4, color: colors.ink, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { ...typography.small, color: colors.subtle, flexShrink: 1 },
  right: { alignItems: 'flex-end', minWidth: 52 },
  totalAmt: { ...typography.bodyBold, color: colors.ink },
  totalLabel: { ...typography.tiny, color: colors.subtle },
});
