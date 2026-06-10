/**
 * ProfileScreen.js — the (flag-gated) Profile tab of the new shell. A read-only-first overview of
 * the user's own stuff: an Appearance toggle (System/Light/Dark for the new shell), a stat strip
 * (trips · people · groups), the saved families/groups, and the traveler library. Tapping a person
 * opens the EXISTING AddProfileModal to edit; "+ Add person" opens it fresh. Accounts are off for
 * the free/local TestFlight (RELEASE_FLAGS.accounts=false), so there is no sign-in here.
 *
 * Pure consumer of the store — no engine logic, no new rules. Theme via useShellTheme (local to the
 * new shell). Reachable only when RELEASE_FLAGS.newShell is on. Contract: docs/ux-engine-contract.md
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import { spacing, radius, shadow } from '../theme';
import { useShellTheme } from '../shellTheme';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import AddProfileModal from '../modals/AddProfileModal';

const APPEARANCE = [
  { key: 'system', label: 'System' },
  { key: 'light',  label: 'Light' },
  { key: 'dark',   label: 'Dark' },
];

function Stat({ value, label, s }) {
  return (
    <View style={s.stat}>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { c, mode, setMode, resolved } = useShellTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const trips = useStore((st) => st.trips) || [];
  const travelers = useStore((st) => st.travelers) || [];
  const groups = useStore((st) => st.groups) || [];

  // null = closed; 'new' = add fresh; an object = edit that traveler. (AddProfileModal owns the writes.)
  const [editing, setEditing] = useState(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}>
        <Text style={s.h1}>Profile</Text>

        <Text style={s.sec}>Appearance</Text>
        <View style={s.segment}>
          {APPEARANCE.map((a) => {
            const on = mode === a.key;
            return (
              <PressableScale key={a.key} haptic="light" style={[s.segBtn, on && s.segBtnOn]} onPress={() => setMode(a.key)}>
                <Text style={[s.segText, on && s.segTextOn]}>{a.label}</Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={s.statRow}>
          <Stat s={s} value={trips.length} label={trips.length === 1 ? 'Trip' : 'Trips'} />
          <Stat s={s} value={travelers.length} label={travelers.length === 1 ? 'Person' : 'People'} />
          <Stat s={s} value={groups.length} label={groups.length === 1 ? 'Group' : 'Groups'} />
        </View>

        {groups.length > 0 && (
          <>
            <Text style={s.sec}>Families &amp; groups</Text>
            {groups.map((g) => {
              const count = (g.travelerIds || []).length;
              return (
                <View key={g.id} style={s.card}>
                  <View style={[s.dot, { backgroundColor: g.color || c.accent }]} />
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
            <Icon name="add" size={15} color={c.accent} />
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
                <Icon name="forward" size={16} color={c.subtle} />
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

const makeStyles = (c) => StyleSheet.create({
  h1: { fontSize: 36, fontWeight: '800', color: c.text, letterSpacing: -0.5, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  segment: { flexDirection: 'row', gap: 4, marginHorizontal: spacing.lg, padding: 4, borderRadius: radius.full, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.full },
  segBtnOn: { backgroundColor: c.accent },
  segText: { fontSize: 13, fontWeight: '800', color: c.muted },
  segTextOn: { color: '#ffffff' },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, ...shadow.sm },
  statVal: { fontSize: 26, fontWeight: '800', color: c.text },
  statLabel: { fontSize: 12, fontWeight: '700', color: c.muted, marginTop: 2 },
  sec: { fontSize: 13, fontWeight: '800', color: c.subtle, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.lg },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full, backgroundColor: c.primaryLight },
  addBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 14, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, ...shadow.sm },
  cardEmoji: { fontSize: 24 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: c.text },
  cardSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  empty: { paddingHorizontal: spacing.xl, color: c.muted, fontSize: 14 },
});
