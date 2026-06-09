/**
 * UpdatesScreen.js — the (flag-gated) Updates tab of the new shell. A live, engine-driven feed:
 * for ongoing trips it surfaces "log your expenses" nudges (dayNeedsExpenseLog) and a quick jump
 * to each trip. Pure consumer of the engine — no rules here, it just renders what the engine says.
 *
 * Contract: docs/ux-engine-contract.md
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import { colors, spacing, radius, shadow } from '../theme';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import { isTripOngoing, dayNeedsExpenseLog } from '../utils/helpers';

export default function UpdatesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const trips = useStore((s) => s.trips) || [];
  const setCurrentTrip = useStore((s) => s.setCurrentTrip);
  const openTrip = (id) => { setCurrentTrip(id); navigation.navigate('Trip'); };

  const [now] = useState(() => Date.now());   // clock at open (lazy init → pure render)
  const ongoing = trips.filter((t) => isTripOngoing(t, now));
  const nudges = [];
  ongoing.forEach((t) => {
    (t.days || []).forEach((d, i) => {
      if (dayNeedsExpenseLog(t, i, now)) nudges.push({ tripId: t.id, tripName: t.name, dayLabel: d.label });
    });
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}>
        <Text style={s.h1}>Updates</Text>

        {nudges.length > 0 && (
          <>
            <Text style={s.sec}>Don’t forget</Text>
            {nudges.map((n, i) => (
              <PressableScale key={`${n.tripId}-${i}`} haptic="light" style={s.card} onPress={() => openTrip(n.tripId)}>
                <Text style={s.cardEmoji}>🧾</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Log {n.dayLabel}’s spend</Text>
                  <Text style={s.cardSub}>{n.tripName} · keeps each family’s split fair</Text>
                </View>
                <Icon name="forward" size={16} color={colors.subtle} />
              </PressableScale>
            ))}
          </>
        )}

        <Text style={s.sec}>Your trips</Text>
        {trips.length === 0 ? (
          <Text style={s.empty}>No trips yet — start one from Discover.</Text>
        ) : (
          trips.map((t) => (
            <PressableScale key={t.id} haptic="light" style={s.card} onPress={() => openTrip(t.id)}>
              <Text style={s.cardEmoji}>{t.emoji || '🧳'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{t.name}</Text>
                <Text style={s.cardSub}>{isTripOngoing(t, now) ? '🟢 Happening now' : (t.destination || `${(t.families || []).length} families`)}</Text>
              </View>
              <Icon name="forward" size={16} color={colors.subtle} />
            </PressableScale>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 36, fontWeight: '800', color: colors.text, letterSpacing: -0.5, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  sec: { fontSize: 13, fontWeight: '800', color: colors.subtle, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, ...shadow.sm },
  cardEmoji: { fontSize: 24 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.text },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { paddingHorizontal: spacing.xl, color: colors.muted, fontSize: 14 },
});
