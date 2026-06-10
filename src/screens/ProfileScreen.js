/**
 * ProfileScreen.js — the (flag-gated) Profile tab of the new shell. A read-only-first overview of
 * the user's own stuff: a stat strip (trips · people · groups), the saved families/groups, and the
 * traveler library. Tapping a person opens the EXISTING AddProfileModal to edit; "+ Add person"
 * opens it fresh. Accounts are off for the free/local TestFlight (RELEASE_FLAGS.accounts=false), so
 * there is no sign-in here — just the library that already drives trips.
 *
 * Pure consumer of the store — no engine logic, no new rules. Reachable only when
 * RELEASE_FLAGS.newShell is on (see MainShell). Contract: docs/ux-engine-contract.md
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import { colors, spacing, radius, shadow } from '../theme';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import AddProfileModal from '../modals/AddProfileModal';

function Stat({ value, label }) {
  return (
    <View style={s.stat}>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const trips = useStore((s) => s.trips) || [];
  const travelers = useStore((s) => s.travelers) || [];
  const groups = useStore((s) => s.groups) || [];

  // null = closed; 'new' = add fresh; an object = edit that traveler. (AddProfileModal owns the writes.)
  const [editing, setEditing] = useState(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}>
        <Text style={s.h1}>Profile</Text>

        <View style={s.statRow}>
          <Stat value={trips.length} label={trips.length === 1 ? 'Trip' : 'Trips'} />
          <Stat value={travelers.length} label={travelers.length === 1 ? 'Person' : 'People'} />
          <Stat value={groups.length} label={groups.length === 1 ? 'Group' : 'Groups'} />
        </View>

        {groups.length > 0 && (
          <>
            <Text style={s.sec}>Families &amp; groups</Text>
            {groups.map((g) => {
              const count = (g.travelerIds || []).length;
              return (
                <View key={g.id} style={s.card}>
                  <View style={[s.dot, { backgroundColor: g.color || colors.accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{g.name}</Text>
                    <Text style={s.cardSub}>{count} {count === 1 ? 'person' : 'people'}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={s.secRow}>
          <Text style={s.sec}>Traveler library</Text>
          <PressableScale haptic="light" style={s.addBtn} onPress={() => setEditing('new')}>
            <Icon name="add" size={15} color={colors.accent} />
            <Text style={s.addBtnText}>Add person</Text>
          </PressableScale>
        </View>

        {travelers.length === 0 ? (
          <Text style={s.empty}>No saved people yet — add the travelers you plan trips with.</Text>
        ) : (
          travelers.map((tv) => {
            const tags = [...(tv.dietary || []), ...(tv.needs || [])];
            return (
              <PressableScale key={tv.id} haptic="light" style={s.card} onPress={() => setEditing(tv)}>
                <Text style={s.cardEmoji}>{tv.emoji || '🙂'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{tv.name}</Text>
                  <Text style={s.cardSub}>
                    {tv.age != null ? `Age ${tv.age}` : 'Traveler'}
                    {tags.length > 0 ? ` · ${tags.join(' · ')}` : ''}
                  </Text>
                </View>
                <Icon name="forward" size={16} color={colors.subtle} />
              </PressableScale>
            );
          })
        )}
      </ScrollView>

      <AddProfileModal
        visible={editing !== null}
        editProfile={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 36, fontWeight: '800', color: colors.text, letterSpacing: -0.5, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, ...shadow.sm },
  statVal: { fontSize: 26, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 2 },
  sec: { fontSize: 13, fontWeight: '800', color: colors.subtle, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.lg },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  addBtnText: { fontSize: 12, fontWeight: '800', color: colors.accent },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, ...shadow.sm },
  cardEmoji: { fontSize: 24 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.text },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { paddingHorizontal: spacing.xl, color: colors.muted, fontSize: 14 },
});
