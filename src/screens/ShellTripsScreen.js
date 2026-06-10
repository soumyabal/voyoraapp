/**
 * ShellTripsScreen.js — the (flag-gated) Trips tab of the new shell. A themed (light/dark) trip list
 * grouped Active / Upcoming / Past via the pure, tested `groupTrips` engine helper, plus the real
 * Magic Paste + New Trip entry points. Replaces the old light-only HomeScreen inside the new shell so
 * the whole shell is dark-cohesive and the content clears the floating tab bar.
 *
 * The legacy HomeScreen is untouched and still serves the flag-OFF app. Pure store/engine consumer —
 * no rules here. Theme via useShellTheme. Contract: docs/ux-engine-contract.md
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import { spacing, radius, shadow } from '../theme';
import { useShellTheme } from '../shellTheme';
import { RELEASE_FLAGS } from '../config';
import { fmt, getAllMembers } from '../utils/helpers';
import { groupTrips } from '../utils/tripGrouping';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import NewTripModal from '../modals/NewTripModal';
import PasteImportModal from '../modals/PasteImportModal';

function TripRow({ trip, status, s, c, onOpen, onManage }) {
  const fam = (trip.families || []).length;
  const people = getAllMembers(trip).length;
  const tone = status.phase === 'ongoing' ? 'live' : status.phase === 'past' ? 'past' : 'soon';
  return (
    <PressableScale haptic="light" style={s.card} onPress={onOpen} onLongPress={onManage} scaleTo={0.98}>
      <Text style={s.cardEmoji}>{trip.emoji || '🧳'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{trip.name}</Text>
        <Text style={s.cardSub} numberOfLines={1}>
          {trip.destination ? `${trip.destination} · ` : ''}{fmt(trip.startDate)} – {fmt(trip.endDate)}
        </Text>
        <Text style={s.cardMeta} numberOfLines={1}>
          {fam} famil{fam !== 1 ? 'ies' : 'y'} · {people} {people !== 1 ? 'people' : 'person'} · {(trip.days || []).length}d
        </Text>
      </View>
      <View style={[s.pill, tone === 'live' && s.pillLive, tone === 'past' && s.pillPast]}>
        <Text style={[s.pillText, tone === 'live' && s.pillTextLive]} numberOfLines={1}>{status.label}</Text>
      </View>
    </PressableScale>
  );
}

export default function ShellTripsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { c, resolved } = useShellTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const trips = useStore((st) => st.trips) || [];
  const setCurrentTrip = useStore((st) => st.setCurrentTrip);
  const deleteTrip = useStore((st) => st.deleteTrip);
  const updateTrip = useStore((st) => st.updateTrip);

  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [now] = useState(() => Date.now());

  const openTrip = (id) => { setCurrentTrip(id); navigation.navigate('Trip'); };
  const manageTrip = (trip) => {
    Alert.alert(trip.name, undefined, [
      { text: trip.archived ? '↩ Reopen' : '✓ Mark complete', onPress: () => updateTrip(trip.id, { archived: !trip.archived }) },
      { text: '🗑 Delete', style: 'destructive', onPress: () => Alert.alert('Delete trip', `Delete "${trip.name}"? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTrip(trip.id) },
      ]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const { active, upcoming, past, spotlight } = groupTrips(trips, now);
  const upcomingRest = spotlight ? upcoming.slice(1) : upcoming;
  const rows = (list) => list.map(({ trip, status }) => (
    <TripRow key={trip.id} trip={trip} status={status} s={s} c={c} onOpen={() => openTrip(trip.id)} onManage={() => manageTrip(trip)} />
  ));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}>
        <View style={s.headRow}>
          <Text style={s.h1}>Trips</Text>
          <PressableScale haptic="medium" style={s.newBtn} onPress={() => setShowNewTrip(true)}>
            <Icon name="add" size={16} color="#ffffff" />
            <Text style={s.newBtnText}>New</Text>
          </PressableScale>
        </View>

        {RELEASE_FLAGS.smartPaste && (
          <PressableScale haptic="light" style={s.paste} onPress={() => setShowPaste(true)}>
            <View style={s.pasteIcon}><Icon name="sparkles" size={18} color={c.smartDeep} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.pasteTitle}>Magic Paste</Text>
              <Text style={s.pasteSub}>Got a plan from ChatGPT or Gemini? Paste it.</Text>
            </View>
            <Icon name="forward" size={16} color={c.subtle} />
          </PressableScale>
        )}

        {trips.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🧳</Text>
            <Text style={s.emptyTitle}>No trips yet</Text>
            <Text style={s.emptyBody}>Start a multi-family trip — costs split per family, automatically.</Text>
            <PressableScale haptic="medium" style={s.emptyBtn} onPress={() => setShowNewTrip(true)}>
              <Text style={s.emptyBtnText}>Plan your first trip</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            {active.length > 0 && (<><Text style={s.sec}>Active now</Text>{rows(active)}</>)}
            {spotlight && (<><Text style={s.sec}>Next trip</Text>{rows([spotlight])}</>)}
            {upcomingRest.length > 0 && (<><Text style={s.sec}>Upcoming</Text>{rows(upcomingRest)}</>)}
            {past.length > 0 && (<><Text style={s.sec}>Past</Text>{rows(past)}</>)}
          </>
        )}
      </ScrollView>

      <NewTripModal
        visible={showNewTrip}
        onClose={() => setShowNewTrip(false)}
        onCreated={(trip) => { setShowNewTrip(false); openTrip(trip.id); }}
        onNeedAuth={() => setShowNewTrip(false)}
      />
      <PasteImportModal
        visible={showPaste}
        onClose={() => setShowPaste(false)}
        onCreated={(trip) => { setShowPaste(false); openTrip(trip.id); }}
      />
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  h1: { fontSize: 36, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accent, borderRadius: radius.full, paddingLeft: 12, paddingRight: 15, paddingVertical: 9, ...shadow.sm },
  newBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },

  paste: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: 13, borderRadius: radius.lg, backgroundColor: c.smartSoft, borderWidth: 1, borderColor: c.hairline },
  pasteIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  pasteTitle: { fontSize: 14, fontWeight: '800', color: c.smartDeep },
  pasteSub: { fontSize: 12, color: c.muted, marginTop: 1 },

  sec: { fontSize: 13, fontWeight: '800', color: c.subtle, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 14, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, ...shadow.sm },
  cardEmoji: { fontSize: 26 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: c.text },
  cardSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  cardMeta: { fontSize: 11, color: c.subtle, marginTop: 2 },
  pill: { backgroundColor: c.bg, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: c.hairline, maxWidth: 96 },
  pillText: { fontSize: 10.5, fontWeight: '800', color: c.muted },
  pillLive: { backgroundColor: c.accent, borderColor: c.accent },
  pillTextLive: { color: '#ffffff' },
  pillPast: { opacity: 0.7 },

  empty: { alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.xl, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, gap: 6 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  emptyBody: { fontSize: 13, color: c.muted, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
  emptyBtn: { backgroundColor: c.accent, borderRadius: radius.lg, paddingHorizontal: 22, paddingVertical: 13, marginTop: spacing.sm },
  emptyBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
});
