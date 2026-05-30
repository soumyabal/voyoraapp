import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore from '../store';
import ItineraryScreen from './ItineraryScreen';
import TravelersScreen from './TravelersScreen';
import SplitwiseScreen from './SplitwiseScreen';
import { colors, spacing, typography } from '../theme';
import { fmt } from '../utils/helpers';

const TABS = [
  { key: 'itinerary', label: '📅 Itinerary' },
  { key: 'travelers', label: '👨‍👩‍👧‍👦 Travelers' },
  { key: 'splitwise', label: '💸 Splitwise' },
];

export default function TripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { getCurrentTrip } = useStore();
  const [activeTab, setActiveTab] = useState('itinerary');
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

  const hasAccessible = trip.families.some(f => f.members.some(m => m.needs.length > 0));
  const modeLabel = trip.mode === 'ai' ? '🤖 AI Planned' : trip.mode === 'expert' ? '🧳 Expert' : '✍️ Manual';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Trip Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
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
        {activeTab === 'itinerary' && <ItineraryScreen trip={trip} switchTab={setActiveTab} />}
        {activeTab === 'travelers' && <TravelersScreen trip={trip} />}
        {activeTab === 'splitwise' && <SplitwiseScreen trip={trip} />}
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
  headerTop: { marginBottom: spacing.md },
  backBtn: {},
  backText: { ...typography.bodyBold, color: colors.primary },
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
