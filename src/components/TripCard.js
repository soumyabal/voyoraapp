import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { getAllMembers, fmt, fmtM, avatarColor } from '../utils/helpers';
import { calcTripItineraryTotal } from '../utils/costs';

export default function TripCard({ trip, onPress }) {
  const allMembers = getAllMembers(trip);
  const itinTotal = calcTripItineraryTotal(trip);
  const expTotal = trip.expenses.filter(e => e.source === 'manual').reduce((s, e) => s + e.amount, 0);
  const hasAccessible = trip.families.some(f => f.members.some(m => m.needs.length > 0));
  const displayMembers = allMembers.slice(0, 4);
  const extra = allMembers.length - 4;

  const modeLabel = trip.mode === 'ai' ? '🤖 AI' : trip.mode === 'expert' ? '🧳 Expert' : '✍️ Manual';
  const modeColor = trip.mode === 'ai' ? colors.ai : trip.mode === 'expert' ? colors.expert : colors.primary;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={trip.bgColors || ['#e17055', '#fdcb6e']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={styles.emoji}>{trip.emoji}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.meta}>📍 {trip.destination}</Text>
        <Text style={styles.meta}>📅 {fmt(trip.startDate)} – {fmt(trip.endDate)} · {trip.days.length}d</Text>

        <View style={styles.tags}>
          <View style={[styles.tag, { backgroundColor: modeColor + '20' }]}>
            <Text style={[styles.tagText, { color: modeColor }]}>{modeLabel}</Text>
          </View>
          {hasAccessible && (
            <View style={[styles.tag, { backgroundColor: colors.greenLight }]}>
              <Text style={[styles.tagText, { color: colors.green }]}>♿ Accessible</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.avatars}>
          {displayMembers.map((m, i) => (
            <View key={m.id} style={[styles.avatar, { backgroundColor: avatarColor(m.name), marginLeft: i === 0 ? 0 : -8 }]}>
              <Text style={styles.avatarText}>{m.name[0]}</Text>
            </View>
          ))}
          {extra > 0 && (
            <View style={[styles.avatar, { backgroundColor: colors.muted, marginLeft: -8 }]}>
              <Text style={styles.avatarText}>+{extra}</Text>
            </View>
          )}
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalAmt}>{fmtM(itinTotal + expTotal)}</Text>
          <Text style={styles.totalLabel}>est. total</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadow.md,
  },
  header: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 48 },
  body: { padding: spacing.lg },
  name: { ...typography.h4, color: colors.text, marginBottom: 4 },
  meta: { ...typography.small, color: colors.muted, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  tagText: { ...typography.tinyBold },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  totalBox: { alignItems: 'flex-end' },
  totalAmt: { ...typography.bodyBold, color: colors.text },
  totalLabel: { ...typography.tiny, color: colors.muted },
});
