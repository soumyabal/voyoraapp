import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useStore from '../store';
import TripCard from '../components/TripCard';
import NewTripModal from '../modals/NewTripModal';
import AuthModal from '../modals/AuthModal';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { fmtM } from '../utils/helpers';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { trips, account, setCurrentTrip } = useStore();
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const openTrip = (tripId) => {
    setCurrentTrip(tripId);
    navigation.navigate('Trip');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Hero */}
      <LinearGradient colors={['#1a1714', '#3d2c1e', '#e86c3a']} style={[styles.hero, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.heroNav}>
          <Text style={styles.logo}>Voy<Text style={{ color: colors.yellow }}>ara</Text> ✈️</Text>
          {account.loggedIn ? (
            <TouchableOpacity style={styles.creditPill} onPress={() => setShowAuth(true)}>
              <Text style={styles.creditPillText}>💳 {account.credits} cr  {account.name[0]?.toUpperCase()}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.signInBtn} onPress={() => setShowAuth(true)}>
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Plan Trips{'\n'}<Text style={{ color: colors.yellow }}>Together</Text></Text>
          <Text style={styles.heroSub}>Daily itineraries · Multi-family expenses · Accessibility built-in</Text>
          <TouchableOpacity style={styles.heroCta} onPress={() => setShowNewTrip(true)}>
            <Text style={styles.heroCtaText}>🗺️ Plan Your Next Trip</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Trip list */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Trips</Text>
          <TouchableOpacity onPress={() => setShowNewTrip(true)}>
            <Text style={styles.addBtn}>+ Add Trip</Text>
          </TouchableOpacity>
        </View>

        {trips.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺️</Text>
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyText}>Start planning your first adventure!</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNewTrip(true)}>
              <Text style={styles.emptyBtnText}>Create a Trip</Text>
            </TouchableOpacity>
          </View>
        ) : (
          trips.map(trip => (
            <TripCard key={trip.id} trip={trip} onPress={() => openTrip(trip.id)} />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => setShowNewTrip(true)}>
        <Text style={styles.fabText}>+ New Trip</Text>
      </TouchableOpacity>

      <NewTripModal visible={showNewTrip} onClose={() => setShowNewTrip(false)} onCreated={(trip) => { setShowNewTrip(false); openTrip(trip.id); }} onNeedAuth={() => { setShowNewTrip(false); setShowAuth(true); }} />
      <AuthModal visible={showAuth} onClose={() => setShowAuth(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl },
  heroNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  creditPill: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  creditPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  signInBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 6 },
  signInText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  heroContent: { alignItems: 'center', paddingTop: spacing.lg },
  heroTitle: { fontSize: 34, fontWeight: '900', color: '#fff', textAlign: 'center', lineHeight: 40, letterSpacing: -1 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  heroCta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 14, marginTop: 24 },
  heroCtaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text },
  addBtn: { ...typography.bodyBold, color: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12, marginTop: 20 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  fab: { position: 'absolute', right: 20, backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 20, paddingVertical: 14, ...shadow.lg },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
