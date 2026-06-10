/**
 * TripShellScreen.js — the (flag-gated) new-shell trip detail. The prototype's two-level nav: a flat
 * themed header (back · emoji · name · dest/dates · status/mode/families pills · ⋮) + segmented
 * Itinerary / People / Split subtabs — replacing the gradient-hero + bottom-border tabs of the
 * classic TripScreen.
 *
 * CRITICAL: this is a SEPARATE route ('TripShell'); the live `Trip`/TripScreen is untouched and still
 * serves the flag-OFF app. The three tab BODIES REUSE the existing, tested screens (ItineraryScreen /
 * TravelersScreen / SplitwiseScreen) verbatim — the itinerary engine and the split MOAT are never
 * reimplemented here, only re-chromed. Those inner screens read the global light theme, so in dark
 * mode the header is dark and the body is light (a known follow-up — restyling them is a separate,
 * careful step). Theme via its own ShellThemeProvider (reads the persisted mode). Contract:
 * docs/ux-engine-contract.md · Design ref: prototypes/discover-rails.html
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, Alert, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import ItineraryScreen from './ItineraryScreen';
import TravelersScreen from './TravelersScreen';
import SplitwiseScreen from './SplitwiseScreen';
import EditTripModal from '../modals/EditTripModal';
import TripValidationModal from '../modals/TripValidationModal';
import { spacing, radius, shadow } from '../theme';
import { ShellThemeProvider, useShellTheme } from '../shellTheme';
import { APP_NAME } from '../config';
import { fmt, getAllMembers } from '../utils/helpers';
import { classifyTrip } from '../utils/tripGrouping';
import { exportTripAsPDF } from '../utils/exportPlan';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';

const SUBTABS = [
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'people',    label: 'People' },
  { key: 'split',     label: 'Split' },
];

const MODE_META = {
  ai:     { icon: 'sparkles',         label: 'AI Planned' },
  expert: { icon: 'briefcase-outline', label: 'Expert' },
  manual: { icon: 'create-outline',   label: 'Manual' },
};

function statusPill(trip, nowMs) {
  const st = classifyTrip(trip, nowMs);
  if (st.phase === 'ongoing') return '🟢 Happening now';
  if (st.phase === 'past') return st.label === 'Completed' ? '✓ Completed' : '✓ Ended';
  return `📅 ${st.label}`;
}

export default function TripShellScreen({ navigation }) {
  // Own provider so the pushed screen is themed like the shell (reads the persisted mode).
  return (
    <ShellThemeProvider>
      <TripShellBody navigation={navigation} />
    </ShellThemeProvider>
  );
}

function TripShellBody({ navigation }) {
  const insets = useSafeAreaInsets();
  const { c, resolved } = useShellTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const {
    getCurrentTrip, setCurrentTrip, setCurrentDay, deleteTrip, duplicateTrip,
    ignoreWarning, clearIgnoredWarnings, travelers,
  } = useStore();
  const trip = getCurrentTrip();

  const [tab, setTab] = useState('itinerary');
  const [showEdit, setShowEdit] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [highlightedActIds, setHighlightedActIds] = useState([]);
  const [replanRequest, setReplanRequest] = useState(null);
  const [now] = useState(() => Date.now());

  if (!trip) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: c.muted, fontSize: 16, marginBottom: 12 }}>Trip not found</Text>
        <PressableScale haptic="light" onPress={() => navigation.goBack()}>
          <Text style={{ color: c.accent, fontWeight: '800' }}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  const mode = MODE_META[trip.mode] || MODE_META.manual;
  const fam = (trip.families || []).length;
  const hasAccessible = (trip.families || []).some((f) => (f.members || []).some((m) => (m.needs || []).length > 0));

  const handleValidationNavigate = (warning) => {
    setTab('itinerary');
    setCurrentDay(warning.dayIndex ?? 0);
    if (warning.actIds?.length) {
      setHighlightedActIds(warning.actIds);
      setTimeout(() => setHighlightedActIds([]), 3000);
    }
  };
  const handleReplanDay = (dayIndex) => {
    setShowValidation(false);
    setTab('itinerary');
    setCurrentDay(dayIndex);
    setReplanRequest((r) => ({ dayIndex, token: (r?.token || 0) + 1 }));
  };

  const handleShare = async () => {
    const members = getAllMembers(trip);
    const totalDays = trip.days?.length || 0;
    const text = [
      `✈️ ${trip.name}`, `📍 ${trip.destination}`,
      `📅 ${fmt(trip.startDate)} – ${fmt(trip.endDate)}  (${totalDays} day${totalDays !== 1 ? 's' : ''})`,
      `👥 ${members.length} traveler${members.length !== 1 ? 's' : ''}`, '', `Planned with ${APP_NAME} 🗺️`,
    ].join('\n');
    try { await Share.share({ message: text, title: trip.name }); } catch (_) {}
  };
  const handleDelete = () => Alert.alert('Delete trip', `Delete "${trip.name}"? This cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { deleteTrip(trip.id); setCurrentTrip(null); navigation.goBack(); } },
  ]);
  const handleMenu = () => Alert.alert(trip.name, undefined, [
    { text: '✏️  Edit trip', onPress: () => setShowEdit(true) },
    { text: '📋  Duplicate', onPress: () => { duplicateTrip(trip.id); Alert.alert('Done', 'Trip duplicated.'); } },
    { text: '📤  Share', onPress: handleShare },
    { text: '📄  Export PDF', onPress: () => exportTripAsPDF(trip, travelers) },
    { text: '🗑️  Delete trip', style: 'destructive', onPress: handleDelete },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <View style={s.screen}>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Flat themed header */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <View style={s.headTop}>
          <PressableScale haptic="light" style={s.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="back" size={18} color={c.text} />
            <Text style={s.backText}>Back</Text>
          </PressableScale>
          <PressableScale haptic="light" style={s.iconBtn} onPress={handleMenu} accessibilityRole="button" accessibilityLabel="Trip menu">
            <Text style={s.menuDots}>⋯</Text>
          </PressableScale>
        </View>

        <View style={s.nameRow}>
          <Text style={s.emoji}>{trip.emoji || '🧳'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{trip.name}</Text>
            <Text style={s.sub} numberOfLines={1}>
              {trip.destination ? `${trip.destination} · ` : ''}{fmt(trip.startDate)} – {fmt(trip.endDate)}
            </Text>
          </View>
        </View>

        <View style={s.pills}>
          <View style={s.pill}><Text style={s.pillText}>{statusPill(trip, now)}</Text></View>
          <View style={s.pill}><Icon name={mode.icon} size={11} color={c.muted} /><Text style={s.pillText}>{mode.label}</Text></View>
          <View style={s.pill}><Text style={s.pillText}>👨‍👩‍👧 {fam} famil{fam !== 1 ? 'ies' : 'y'}</Text></View>
          {hasAccessible && (<View style={s.pill}><Icon name="accessible" size={11} color={c.muted} /><Text style={s.pillText}>Needs</Text></View>)}
        </View>

        {/* Segmented subtabs */}
        <View style={s.segment}>
          {SUBTABS.map((t) => {
            const on = tab === t.key;
            return (
              <PressableScale key={t.key} haptic="light" style={[s.segBtn, on && s.segBtnOn]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
                <Text style={[s.segText, on && s.segTextOn]}>{t.label}</Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {/* Tab bodies — REUSE the existing screens (stay mounted to preserve scroll) */}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: tab === 'itinerary' ? 'flex' : 'none' }}>
          <ItineraryScreen
            trip={trip}
            switchTab={(t) => setTab(t === 'travelers' ? 'people' : t === 'splitwise' ? 'split' : t)}
            onCheckTrip={() => setShowValidation(true)}
            highlightedActIds={highlightedActIds}
            replanRequest={replanRequest}
          />
        </View>
        <View style={{ flex: 1, display: tab === 'people' ? 'flex' : 'none' }}>
          <TravelersScreen trip={trip} />
        </View>
        <View style={{ flex: 1, display: tab === 'split' ? 'flex' : 'none' }}>
          <SplitwiseScreen
            trip={trip}
            onOpenActivity={(dayIndex, actId) => {
              setTab('itinerary');
              setCurrentDay(dayIndex ?? 0);
              if (actId) { setHighlightedActIds([actId]); setTimeout(() => setHighlightedActIds([]), 3000); }
            }}
          />
        </View>
      </View>

      <TripValidationModal
        visible={showValidation}
        trip={trip}
        onClose={() => setShowValidation(false)}
        onNavigate={handleValidationNavigate}
        onReplanDay={handleReplanDay}
        onIgnore={(key) => ignoreWarning(trip.id, key)}
        onClearIgnored={() => clearIgnoredWarnings(trip.id)}
      />
      <EditTripModal visible={showEdit} trip={trip} onClose={() => setShowEdit(false)} />
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.hairline },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingRight: 8, minHeight: 44 },
  backText: { fontSize: 15, fontWeight: '700', color: c.text },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuDots: { fontSize: 22, fontWeight: '800', color: c.text },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  emoji: { fontSize: 30 },
  name: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
  sub: { fontSize: 12.5, color: c.muted, marginTop: 2 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderWidth: 1, borderColor: c.hairline, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700', color: c.muted },

  segment: { flexDirection: 'row', gap: 4, marginTop: 12, padding: 4, borderRadius: radius.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.hairline, ...shadow.sm },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md },
  segBtnOn: { backgroundColor: c.accent },
  segText: { fontSize: 14, fontWeight: '800', color: c.muted },
  segTextOn: { color: '#ffffff' },
});
