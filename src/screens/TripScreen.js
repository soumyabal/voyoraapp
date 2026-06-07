import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import ItineraryScreen from './ItineraryScreen';
import TravelersScreen from './TravelersScreen';
import SplitwiseScreen from './SplitwiseScreen';
import EditTripModal from '../modals/EditTripModal';
import ChangeModeModal from '../modals/ChangeModeModal';
import AgenticPlannerModal from '../modals/AgenticPlannerModal';
import TripValidationModal from '../modals/TripValidationModal';
import { colors, spacing, typography, radius } from '../theme';
import Icon from '../components/ui/Icon';
import { fmt, getAllMembers } from '../utils/helpers';
import { exportTripAsPDF } from '../utils/exportPlan';
import { RELEASE_FLAGS, APP_NAME } from '../config';

// AI tab removed — plan is triggered directly from header / People screen
const TABS = [
  { key: 'itinerary', label: 'Plan',   icon: 'calendar' },
  { key: 'travelers', label: 'People', icon: 'people' },
  { key: 'splitwise', label: 'Split',  icon: 'wallet' },
];

export default function TripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { getCurrentTrip, deleteTrip, duplicateTrip, setCurrentTrip, setCurrentDay, ignoreWarning, clearIgnoredWarnings, travelers } = useStore();
  const [activeTab, setActiveTab]               = useState('itinerary');
  const [showEditModal, setShowEditModal]       = useState(false);
  const [showModeModal, setShowModeModal]       = useState(false);
  const [showPlanner, setShowPlanner]           = useState(false);
  const [showValidation,    setShowValidation]    = useState(false);
  const [highlightedActIds, setHighlightedActIds] = useState([]);
  const trip = getCurrentTrip();

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

  const isAIMode = trip.mode === 'ai';
  const hasActivities = trip.days?.some(d => d.activities.length > 0);

  const hasAccessible = trip.families.some(f => f.members.some(m => m.needs.length > 0));
  const modeLabel = trip.mode === 'ai' ? 'AI Planned' : trip.mode === 'expert' ? 'Expert' : 'Manual';
  const modeIcon  = trip.mode === 'ai' ? 'sparkles' : trip.mode === 'expert' ? 'briefcase-outline' : 'create-outline';
  const modeColor = trip.mode === 'ai' ? colors.ai : trip.mode === 'expert' ? colors.expert : colors.primary;

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
      <StatusBar barStyle="dark-content" />

      {/* Trip Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenu} style={styles.menuBtn} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={styles.menuText}>⋮</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tripInfo}>
          <Text style={styles.emoji}>{trip.emoji}</Text>
          <View style={{ flex: 1 }}>
            <View style={styles.tripNameRow}>
              <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
            </View>
            <View style={styles.tripMetaRow}>
              <Icon name="location" size={13} color={colors.subtle} />
              <Text style={styles.tripMeta} numberOfLines={1}>{trip.destination}  ·  {fmt(trip.startDate)} – {fmt(trip.endDate)}</Text>
            </View>
            <View style={styles.tags}>
              <View style={[styles.tag, { backgroundColor: trip.mode === 'ai' ? colors.aiLight : trip.mode === 'expert' ? colors.expertLight : colors.primaryLight }]}>
                <Icon name={modeIcon} size={11} color={modeColor} />
                <Text style={[styles.tagText, { color: modeColor }]}>{modeLabel}</Text>
              </View>
              {hasAccessible && (
                <View style={[styles.tag, { backgroundColor: '#fff8e6' }]}>
                  <Icon name="accessible" size={11} color="#9b6e00" />
                  <Text style={[styles.tagText, { color: '#9b6e00' }]}>Needs</Text>
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

        {/* Tab Bar */}
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
        onIgnore={(key) => ignoreWarning(trip.id, key)}
        onClearIgnored={() => clearIgnoredWarnings(trip.id)}
      />
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

  // ── Header ──────────────────────────────────────────────────────
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backBtn: { paddingVertical: spacing.xs },
  backText: { ...typography.bodyBold, color: colors.primary },
  menuBtn: { paddingVertical: spacing.xs },
  menuText: { fontSize: 22, color: colors.text, fontWeight: '700' },
  tripInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 26 },
  tripNameRow: { flexDirection: 'row', alignItems: 'center' },
  tripName: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  tripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tripMeta: { fontSize: 11, color: colors.muted, flexShrink: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  tagText: { ...typography.caption, fontWeight: '700', fontSize: 11 },

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

  // ── Tab bar ──────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    marginTop: spacing.md,
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
