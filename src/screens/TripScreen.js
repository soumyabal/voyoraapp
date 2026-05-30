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
import { colors, spacing, typography } from '../theme';
import { fmt, getAllMembers } from '../utils/helpers';

const TABS = [
  { key: 'itinerary', label: '📅 Itinerary' },
  { key: 'travelers', label: '👨‍👩‍👧‍👦 Travelers' },
  { key: 'splitwise', label: '💸 Splitwise' },
];

export default function TripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { getCurrentTrip, deleteTrip, duplicateTrip, setCurrentTrip } = useStore();
  const [activeTab, setActiveTab] = useState('itinerary');
  const [showEditModal, setShowEditModal] = useState(false);
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

  const isExpert = trip.mode === 'expert';
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

    try {
      await Share.share({ message: text, title: trip.name });
    } catch (_) {}
  };

  const handleDuplicate = () => {
    Alert.alert(
      'Duplicate Trip',
      `Create a copy of "${trip.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: () => {
            duplicateTrip(trip.id);
            Alert.alert('Done', 'Trip duplicated and added to your list.');
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTrip(trip.id);
            setCurrentTrip(null);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleMenu = () => {
    Alert.alert(
      trip.name,
      'What would you like to do?',
      [
        { text: '✏️  Edit Trip', onPress: () => setShowEditModal(true) },
        { text: '📋  Duplicate', onPress: handleDuplicate },
        { text: '📤  Share', onPress: handleShare },
        { text: '🗑️  Delete Trip', onPress: handleDelete, style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
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
                <View style={[styles.tag, { backgroundColor: colors.greenLight }]}>
                  <Text style={[styles.tagText, { color: colors.green }]}>♿ Accessible</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'itinerary' && (
          isExpert
            ? <ComingSoon tab="Itinerary" />
            : <ItineraryScreen trip={trip} switchTab={setActiveTab} />
        )}
        {activeTab === 'travelers' && <TravelersScreen trip={trip} />}
        {activeTab === 'splitwise' && (
          isExpert
            ? <ComingSoon tab="Splitwise" />
            : <SplitwiseScreen trip={trip} />
        )}
      </View>

      <EditTripModal
        visible={showEditModal}
        trip={trip}
        onClose={() => setShowEditModal(false)}
      />
    </View>
  );
}

function ComingSoon({ tab }) {
  return (
    <View style={cs.wrap}>
      <Text style={cs.icon}>🧳</Text>
      <Text style={cs.title}>Coming Soon</Text>
      <Text style={cs.body}>
        The {tab} tab for Expert-planned trips is on its way.
        {'\n\n'}Our team curates every detail — sit tight while your itinerary is being crafted.
      </Text>
      <View style={cs.badge}>
        <Text style={cs.badgeText}>Expert Planning in Progress</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xxl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backBtn: {},
  backText: { ...typography.bodyBold, color: colors.primary },
  menuBtn: { padding: 4 },
  menuText: { fontSize: 22, color: colors.text, fontWeight: '700', lineHeight: 24 },
  tripInfo: { flexDirection: 'row', gap: 12, marginBottom: spacing.lg, alignItems: 'flex-start' },
  emoji: { fontSize: 36 },
  tripName: { ...typography.h3, color: colors.text },
  tripMeta: { ...typography.small, color: colors.muted, marginTop: 3 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  tagText: { fontSize: 11, fontWeight: '600' },
  tabBar: { flexDirection: 'row', gap: 0 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.primary },
  content: { flex: 1 },
  noTrip: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noTripText: { ...typography.h4, color: colors.muted },
});

const cs = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 16,
  },
  icon: { fontSize: 56 },
  title: { ...typography.h2, color: colors.text, textAlign: 'center' },
  body: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  badge: {
    marginTop: 8,
    backgroundColor: colors.expertLight ?? '#fff3e0',
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.expert ?? '#e67e22',
  },
});
