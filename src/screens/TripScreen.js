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
import { colors, spacing, typography, radius } from '../theme';
import { fmt, getAllMembers } from '../utils/helpers';
import { exportTripAsPDF } from '../utils/exportPlan';
import { RELEASE_FLAGS } from '../config';

// AI tab removed — plan is triggered directly from header / People screen
const TABS = [
  { key: 'itinerary', label: '📅 Plan' },
  { key: 'travelers', label: '👥 People' },
  { key: 'splitwise', label: '💸 Split' },
];

export default function TripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { getCurrentTrip, deleteTrip, duplicateTrip, setCurrentTrip, travelers } = useStore();
  const [activeTab, setActiveTab]           = useState('itinerary');
  const [showEditModal, setShowEditModal]   = useState(false);
  const [showModeModal, setShowModeModal]   = useState(false);
  const [showPlanner, setShowPlanner]       = useState(false);
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

  const isAIMode = trip.mode === 'ai';
  const hasActivities = trip.days?.some(d => d.activities.length > 0);
  const hasAccessible = trip.families.some(f => f.members.some(m => m.needs.length > 0));
  const modeLabel = trip.mode === 'ai' ? '🤖 AI Planned' : trip.mode === 'expert' ? '🧳 Expert' : '✍️ Manual';

  const handleShare = async () => {
    const members = getAllMembers(trip);
    const totalDays = trip.days?.length || 0;
    const text = [
      `✈️ ${trip.name}`,
      `📍 ${trip.destination}`,
      `📅 ${fmt(trip.startDate)} – ${fmt(trip.endDate)}  (${totalDays} day${totalDays !== 1 ? 's' : ''})`,
      `👥 ${members.length} traveler${members.length !== 1 ? 's' : ''}${members.length ? ': ' + members.map(m => m.name).join(', ') : ''}`,
      '',
      'Planned with Voyara 🗺️',
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
      { text: '📄  Export as PDF',          onPress: handleExportPDF },
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
            <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
            <Text style={styles.tripMeta}>📍 {trip.destination}  •  📅 {fmt(trip.startDate)} – {fmt(trip.endDate)}</Text>
            <View style={styles.tags}>
              <View style={[styles.tag, { backgroundColor: trip.mode === 'ai' ? colors.aiLight : trip.mode === 'expert' ? colors.expertLight : colors.primaryLight }]}>
                <Text style={[styles.tagText, { color: trip.mode === 'ai' ? colors.ai : trip.mode === 'expert' ? colors.expert : colors.primary }]}>{modeLabel}</Text>
              </View>
              {hasAccessible && (
                <View style={[styles.tag, { backgroundColor: '#fff8e6' }]}>
                  <Text style={[styles.tagText, { color: '#9b6e00' }]}>♿ Needs</Text>
                </View>
              )}

              {/* Plan with AI / Update Plan button — only when AI planner is enabled */}
              {isAIMode && RELEASE_FLAGS.aiPlanner && (
                <TouchableOpacity
                  style={[styles.planBtn, hasActivities && styles.planBtnUpdate]}
                  onPress={() => setShowPlanner(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.planBtnText}>
                    {hasActivities ? '↺ Update Plan' : '✨ Plan with AI'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'itinerary' && (
          <ItineraryScreen
            trip={trip}
            switchTab={setActiveTab}
            onPlanWithAI={isAIMode ? () => setShowPlanner(true) : undefined}
          />
        )}
        {activeTab === 'travelers' && (
          <TravelersScreen
            trip={trip}
            onUpdatePlan={isAIMode ? () => setShowPlanner(true) : undefined}
          />
        )}
        {activeTab === 'splitwise' && <SplitwiseScreen trip={trip} />}
      </View>

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
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backBtn: { paddingVertical: spacing.sm },
  backText: { ...typography.bodyBold, color: colors.primary },
  menuBtn: { paddingVertical: spacing.sm },
  menuText: { fontSize: 22, color: colors.text, fontWeight: '700' },
  tripInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  emoji: { fontSize: 32, marginTop: 2 },
  tripName: { ...typography.h3, color: colors.text, flex: 1 },
  tripMeta: { ...typography.caption, color: colors.muted, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  tag: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { ...typography.caption, fontWeight: '700', fontSize: 11 },

  // Plan with AI / Update Plan button (inline with tags)
  planBtn: {
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
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.caption, color: colors.muted, fontWeight: '600', fontSize: 11 },
  tabTextActive: { color: colors.primary, fontWeight: '800' },
});
