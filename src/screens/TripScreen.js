import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useStore from '../store';
import ItineraryScreen from './ItineraryScreen';
import TravelersScreen from './TravelersScreen';
import SplitwiseScreen from './SplitwiseScreen';
import EditTripModal from '../modals/EditTripModal';
import ChangeModeModal from '../modals/ChangeModeModal';
import AgenticPlannerModal from '../modals/AgenticPlannerModal';
import TripValidationModal from '../modals/TripValidationModal';
import PackingModal from '../modals/PackingModal';
import { colors, spacing, typography, radius, gradients, shadow } from '../theme';
import Icon from '../components/ui/Icon';
import { fmt, getAllMembers, openFocusFor } from '../utils/helpers';
import { exportTripAsPDF } from '../utils/exportPlan';
import { RELEASE_FLAGS, APP_NAME } from '../config';

// AI tab removed — plan is triggered directly from header / People screen
const TABS = [
  { key: 'itinerary', label: 'Plan',   icon: 'calendar' },
  { key: 'travelers', label: 'People', icon: 'people' },
  { key: 'splitwise', label: 'Split',  icon: 'wallet' },
];

// Compact header countdown (module fn → pure at the call site, no render-time impurity flag).
function tripCountdown(trip) {
  const DAY = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(trip.startDate + 'T00:00:00');
  const end   = new Date(trip.endDate + 'T00:00:00');
  if (trip.archived) return '✓ Completed';
  if (today > end)   return '✓ Ended';
  if (today >= start && today <= end) return '🟢 Happening now';
  const d = Math.round((start - today) / DAY);
  return d === 0 ? '📅 Starts today' : d === 1 ? '📅 Tomorrow' : `📅 In ${d} days`;
}

export default function TripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { getCurrentTrip, deleteTrip, duplicateTrip, setCurrentTrip, setCurrentDay, ignoreWarning, clearIgnoredWarnings, travelers } = useStore();
  const [activeTab, setActiveTab]               = useState('itinerary');
  const [showEditModal, setShowEditModal]       = useState(false);
  const [showModeModal, setShowModeModal]       = useState(false);
  const [showPlanner, setShowPlanner]           = useState(false);
  const [showValidation,    setShowValidation]    = useState(false);
  const [showPacking,       setShowPacking]       = useState(false);
  const [highlightedActIds, setHighlightedActIds] = useState([]);
  const [replanRequest,     setReplanRequest]     = useState(null);   // "Re-plan this day" bridge to ItineraryScreen
  const trip = getCurrentTrip();

  // Open to "now": when a trip is opened (or another is switched in), land on the destination's
  // current day + scroll to its now/next activity. setCurrentTrip already set the day; this also
  // sets it (covers app relaunch with a persisted trip) and drives the activity highlight, which
  // TripScreen owns. Active trips only (openFocusFor returns no activity otherwise); brief 3s cue.
  useEffect(() => {
    if (!trip) return undefined;
    const { dayIndex, activityId } = openFocusFor(trip);
    setCurrentDay(dayIndex);
    if (!activityId) return undefined;
    setHighlightedActIds([activityId]);
    const t = setTimeout(() => setHighlightedActIds([]), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  if (!trip) {
    return (
      <View style={styles.noTrip}>
        <Text style={styles.noTripText}>Trip not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleValidationNavigate = (warning) => {
    // Switch to the itinerary tab
    setActiveTab('itinerary');
    // Jump to the relevant day (default day 0 for trip-level issues)
    setCurrentDay(warning.dayIndex ?? 0);
    // Highlight specific activity cards if the warning names them
    if (warning.actIds?.length) {
      setHighlightedActIds(warning.actIds);
      setTimeout(() => setHighlightedActIds([]), 3000);
    }
  };

  // "Re-plan this day" from Trip Check: close the modal, land on the day, and bump a token that
  // ItineraryScreen watches to run Plan-my-day on that exact day (one engine resolves the flags).
  const handleReplanDay = (dayIndex) => {
    setShowValidation(false);
    setActiveTab('itinerary');
    setCurrentDay(dayIndex);
    setReplanRequest(r => ({ dayIndex, token: (r?.token || 0) + 1 }));
  };

  const isAIMode = trip.mode === 'ai';
  const hasActivities = trip.days?.some(d => d.activities.length > 0);

  const hasAccessible = trip.families.some(f => f.members.some(m => m.needs.length > 0));
  const modeLabel = trip.mode === 'ai' ? 'AI Planned' : trip.mode === 'expert' ? 'Expert' : 'Manual';
  const modeIcon  = trip.mode === 'ai' ? 'sparkles' : trip.mode === 'expert' ? 'briefcase-outline' : 'create-outline';
  const statusLabel = tripCountdown(trip);

  const handleShare = async () => {
    const members = getAllMembers(trip);
    const totalDays = trip.days?.length || 0;
    const text = [
      `✈️ ${trip.name}`,
      `📍 ${trip.destination}`,
      `📅 ${fmt(trip.startDate)} – ${fmt(trip.endDate)}  (${totalDays} day${totalDays !== 1 ? 's' : ''})`,
      `👥 ${members.length} traveler${members.length !== 1 ? 's' : ''}${members.length ? ': ' + members.map(m => m.name).join(', ') : ''}`,
      '',
      `Planned with ${APP_NAME} 🗺️`,
    ].join('\n');
    try { await Share.share({ message: text, title: trip.name }); } catch (_) {}
  };

  const handleDuplicate = () => {
    Alert.alert('Duplicate Trip', `Create a copy of "${trip.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Duplicate', onPress: () => { duplicateTrip(trip.id); Alert.alert('Done', 'Trip duplicated and added to your list.'); } },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Trip', `Are you sure you want to delete "${trip.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteTrip(trip.id); setCurrentTrip(null); navigation.goBack(); } },
    ]);
  };

  const handleExportPDF = () => exportTripAsPDF(trip, travelers);

  const handleMenu = () => {
    Alert.alert(trip.name, 'What would you like to do?', [
      { text: '✏️  Edit Trip',              onPress: () => setShowEditModal(true) },
      { text: '🎒  Packing List',           onPress: () => setShowPacking(true) },
      { text: '🔄  Switch Planning Mode',   onPress: () => setShowModeModal(true) },
      { text: '📋  Duplicate',              onPress: handleDuplicate },
      { text: '📤  Share',                  onPress: handleShare },
      { text: '📄  Export Trip Plan (PDF)',  onPress: handleExportPDF },
      { text: '🗑️  Delete Trip',            onPress: handleDelete, style: 'destructive' },
      { text: 'Cancel',                     style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Trip Header — gradient cover (per-trip emoji tile + countdown) */}
      <LinearGradient
        colors={gradients.hero}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenu} style={styles.menuBtn} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={styles.menuText}>⋮</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tripInfo}>
          <LinearGradient
            colors={trip.bgColors || ['#e17055', '#fdcb6e']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.emojiTile}
          >
            <Text style={styles.emoji}>{trip.emoji}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
            <View style={styles.tripMetaRow}>
              <Icon name="location" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.tripMeta} numberOfLines={1}>{trip.destination}  ·  {fmt(trip.startDate)} – {fmt(trip.endDate)}</Text>
            </View>
            <View style={styles.tags}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{statusLabel}</Text>
              </View>
              <View style={styles.tag}>
                <Icon name={modeIcon} size={11} color="#fff" />
                <Text style={styles.tagText}>{modeLabel}</Text>
              </View>
              {hasAccessible && (
                <View style={styles.tag}>
                  <Icon name="accessible" size={11} color="#fff" />
                  <Text style={styles.tagText}>Needs</Text>
                </View>
              )}

              {/* Plan with AI / Update Plan button — only when AI planner is enabled */}
              {isAIMode && RELEASE_FLAGS.aiPlanner && (
                <TouchableOpacity
                  style={[styles.planBtn, hasActivities && styles.planBtnUpdate]}
                  onPress={() => setShowPlanner(true)}
                  activeOpacity={0.8}
                >
                  <Icon name={hasActivities ? 'refresh' : 'sparkles'} size={12} color="#fff" />
                  <Text style={styles.planBtnText}>
                    {hasActivities ? 'Update Plan' : 'Plan with AI'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Tab Bar — on white, directly below the cover */}
      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Icon name={tab.icon} size={16} color={active ? colors.accent : colors.subtle} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Tab Content — all tabs stay mounted so scroll position is preserved */}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: activeTab === 'itinerary' ? 'flex' : 'none' }}>
          <ItineraryScreen
            trip={trip}
            switchTab={setActiveTab}
            onPlanWithAI={isAIMode ? () => setShowPlanner(true) : undefined}
            onCheckTrip={() => setShowValidation(true)}
            highlightedActIds={highlightedActIds}
            replanRequest={replanRequest}
          />
        </View>
        <View style={{ flex: 1, display: activeTab === 'travelers' ? 'flex' : 'none' }}>
          <TravelersScreen
            trip={trip}
            onUpdatePlan={isAIMode ? () => setShowPlanner(true) : undefined}
          />
        </View>
        <View style={{ flex: 1, display: activeTab === 'splitwise' ? 'flex' : 'none' }}>
          <SplitwiseScreen
            trip={trip}
            onOpenActivity={(dayIndex, actId) => {
              setActiveTab('itinerary');
              setCurrentDay(dayIndex ?? 0);
              if (actId) {
                setHighlightedActIds([actId]);
                setTimeout(() => setHighlightedActIds([]), 3000);
              }
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
      <PackingModal visible={showPacking} trip={trip} onClose={() => setShowPacking(false)} />
      <EditTripModal visible={showEditModal} trip={trip} onClose={() => setShowEditModal(false)} />
      <ChangeModeModal visible={showModeModal} trip={trip} onClose={() => setShowModeModal(false)} />
      <AgenticPlannerModal
        visible={showPlanner}
        trip={trip}
        travelers={travelers}
        onClose={() => setShowPlanner(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  noTrip: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noTripText: { ...typography.h3, color: colors.muted, marginBottom: spacing.lg },

  // ── Header (gradient cover) ─────────────────────────────────────
  hero: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backBtn: { paddingVertical: spacing.xs },
  backText: { ...typography.bodyBold, color: '#fff' },
  menuBtn: { paddingVertical: spacing.xs },
  menuText: { fontSize: 22, color: '#fff', fontWeight: '700' },
  tripInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emojiTile: {
    width: 50, height: 50, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', ...shadow.sm,
  },
  emoji: { fontSize: 26 },
  tripName: { fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  tripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  tripMeta: { fontSize: 11, color: 'rgba(255,255,255,0.8)', flexShrink: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  statusPill: {
    backgroundColor: 'rgba(255,255,255,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3,
  },
  statusPillText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  tagText: { ...typography.caption, fontWeight: '700', fontSize: 11, color: '#fff' },

  // Plan with AI / Update Plan button (inline with tags)
  planBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.ai,
  },
  planBtnUpdate: { backgroundColor: colors.primary },
  planBtnText: { ...typography.caption, color: '#fff', fontWeight: '800', fontSize: 11 },

  // ── Tab bar (white surface below the cover) ─────────────────────
  tabBarWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing.xxl,
  },
  tabBar: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.caption, color: colors.muted, fontWeight: '600', fontSize: 11 },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
});
