/**
 * HomeScreen.js
 *
 * Two-tab home screen:
 *   ✈️ Trips     — trip cards, plan new trip
 *   👥 Travelers — global traveler library & saved groups
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useStore from '../store';
import TripCard from '../components/TripCard';
import NewTripModal from '../modals/NewTripModal';
import AuthModal from '../modals/AuthModal';
import AddProfileModal from '../modals/AddProfileModal';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { avatarColor } from '../utils/helpers';

const PACE_LABELS = { relaxed: '🐢 Relaxed', moderate: '🚶 Moderate', packed: '🏃 Packed' };

// ─── Travelers tab content ────────────────────────────────────────

function TravelersTab() {
  const {
    travelers, groups,
    createTraveler, deleteTravelerFromLibrary,
    createGroup, deleteGroup,
    addTravelerToGroup, removeTravelerFromGroup,
  } = useStore();

  const [showAddProfile, setShowAddProfile] = useState(false);
  const [editTraveler, setEditTraveler]     = useState(null);
  const [showNewGroup, setShowNewGroup]     = useState(false);

  const confirmDeleteTraveler = (tv) => {
    Alert.alert(
      'Remove Traveler',
      `Remove "${tv.name}" from the library? They will be unlinked from trip members but members stay on their trips.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteTravelerFromLibrary(tv.id) },
      ],
    );
  };

  const confirmRemoveFromGroup = (g, tv) => {
    Alert.alert(
      'Remove from Group',
      `Remove ${tv.name.split(' ')[0]} from "${g.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeTravelerFromGroup(g.id, tv.id) },
      ],
    );
  };

  const confirmDeleteGroup = (g) => {
    Alert.alert(
      'Delete Group',
      `Delete "${g.name}"? The group is removed but individual travelers remain in the library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteGroup(g.id) },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={tt.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Traveler Library */}
        <View style={tt.sectionHeader}>
          <View>
            <Text style={tt.sectionTitle}>Traveler Library</Text>
            <Text style={tt.sectionSub}>Your saved people — reuse across any trip</Text>
          </View>
          <TouchableOpacity
            style={tt.addBtn}
            onPress={() => { setEditTraveler(null); setShowAddProfile(true); }}
          >
            <Text style={tt.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {travelers.length === 0 ? (
          <View style={tt.emptyCard}>
            <Text style={tt.emptyEmoji}>👤</Text>
            <Text style={tt.emptyTitle}>No travelers yet</Text>
            <Text style={tt.emptyBody}>
              Save people here once — name, age, dietary needs, accessibility requirements — then pick them for any trip in seconds.
            </Text>
            <TouchableOpacity
              style={tt.emptyBtn}
              onPress={() => { setEditTraveler(null); setShowAddProfile(true); }}
            >
              <Text style={tt.emptyBtnText}>Add First Traveler</Text>
            </TouchableOpacity>
          </View>
        ) : (
          travelers.map(tv => {
            const tags = [...(tv.dietary || []), ...(tv.needs || [])];
            return (
              <View key={tv.id} style={tt.travelerCard}>
                <View style={tt.travelerRow}>
                  <View style={[tt.avatar, { backgroundColor: avatarColor(tv.name) }]}>
                    <Text style={tt.avatarText}>{tv.emoji || tv.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={tt.travelerName}>{tv.name}</Text>
                    <Text style={tt.travelerMeta}>
                      {tv.age ? `${tv.age}yo · ` : ''}{PACE_LABELS[tv.pacePreference] || '🚶 Moderate'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setEditTraveler(tv); setShowAddProfile(true); }}
                    style={tt.actionBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDeleteTraveler(tv)}
                    style={tt.actionBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text>🗑</Text>
                  </TouchableOpacity>
                </View>
                {tags.length > 0 && (
                  <View style={tt.tagRow}>
                    {tags.map(t => (
                      <View key={t} style={tt.tag}>
                        <Text style={tt.tagText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {(tv.interests || []).length > 0 && (
                  <Text style={tt.interests}>Loves: {tv.interests.join(' · ')}</Text>
                )}
              </View>
            );
          })
        )}

        {/* Saved Groups */}
        <View style={[tt.sectionHeader, { marginTop: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xl }]}>
          <View>
            <Text style={tt.sectionTitle}>Saved Groups</Text>
            <Text style={tt.sectionSub}>Pre-built collections — add to any trip with one tap</Text>
          </View>
          <TouchableOpacity style={tt.addBtn} onPress={() => setShowNewGroup(true)}>
            <Text style={tt.addBtnText}>+ Group</Text>
          </TouchableOpacity>
        </View>

        {groups.length === 0 ? (
          <View style={tt.emptyCard}>
            <Text style={tt.emptyEmoji}>👨‍👩‍👧</Text>
            <Text style={tt.emptyTitle}>No groups yet</Text>
            <Text style={tt.emptyBody}>
              Group your travelers (e.g. "Sharma Family"). When planning a trip you can add a whole group in one tap.
            </Text>
          </View>
        ) : (
          groups.map(g => {
            const groupTravelers = (g.travelerIds || [])
              .map(id => travelers.find(tv => tv.id === id))
              .filter(Boolean);
            return (
              <View key={g.id} style={[tt.groupCard, { borderLeftColor: g.color }]}>
                <View style={tt.groupHeader}>
                  <View style={[tt.groupDot, { backgroundColor: g.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={tt.groupName}>{g.name}</Text>
                    <Text style={tt.groupSub}>
                      {groupTravelers.map(tv => tv.name.split(' ')[0]).join(', ') || 'No members'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDeleteGroup(g)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={tt.actionBtn}
                  >
                    <Text>🗑</Text>
                  </TouchableOpacity>
                </View>
                <View style={tt.groupMembers}>
                  {groupTravelers.map(tv => (
                    <View key={tv.id} style={tt.groupMemberChip}>
                      <Text style={tt.groupMemberEmoji}>{tv.emoji || '👤'}</Text>
                      <Text style={tt.groupMemberName}>{tv.name.split(' ')[0]}</Text>
                      <TouchableOpacity onPress={() => confirmRemoveFromGroup(g, tv)}>
                        <Text style={tt.groupMemberRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {travelers.filter(tv => !(g.travelerIds || []).includes(tv.id)).map(tv => (
                    <TouchableOpacity
                      key={tv.id}
                      style={tt.groupAddChip}
                      onPress={() => addTravelerToGroup(g.id, tv.id)}
                    >
                      <Text style={tt.groupAddChipText}>+ {tv.name.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <AddProfileModal
        visible={showAddProfile}
        editProfile={editTraveler}
        onClose={() => { setShowAddProfile(false); setEditTraveler(null); }}
      />
      <NewGroupModal
        visible={showNewGroup}
        travelers={travelers}
        onCreate={createGroup}
        onClose={() => setShowNewGroup(false)}
      />
    </View>
  );
}

// ─── New Group Modal ──────────────────────────────────────────────
function NewGroupModal({ visible, travelers, onCreate, onClose }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(new Set());

  React.useEffect(() => {
    if (visible) { setName(''); setSelected(new Set()); }
  }, [visible]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    const palette = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#e84393', '#e67e22'];
    const color = palette[Math.floor(Math.random() * palette.length)];
    onCreate({ name: name.trim(), color, travelerIds: [...selected] });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={ng.header}>
            <TouchableOpacity onPress={onClose}><Text style={ng.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={ng.title}>New Group</Text>
            <TouchableOpacity onPress={handleCreate} disabled={!canCreate}>
              <Text style={[ng.create, !canCreate && { opacity: 0.35 }]}>Create</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <View style={{ marginBottom: spacing.xl }}>
              <Text style={ng.label}>Group Name *</Text>
              <TextInput
                style={ng.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Sharma Family"
                autoFocus
                returnKeyType="next"
              />
            </View>
            {travelers.length > 0 && (
              <>
                <Text style={ng.label}>Add Members (optional)</Text>
                {travelers.map(tv => (
                  <TouchableOpacity
                    key={tv.id}
                    style={[ng.memberRow, selected.has(tv.id) && ng.memberRowSelected]}
                    onPress={() => toggle(tv.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[ng.avatar, { backgroundColor: avatarColor(tv.name) }]}>
                      <Text style={ng.avatarText}>{tv.emoji || tv.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ng.memberName}>{tv.name}</Text>
                      {tv.age ? <Text style={ng.memberMeta}>{tv.age}yo</Text> : null}
                    </View>
                    <View style={[ng.checkbox, selected.has(tv.id) && ng.checkboxSelected]}>
                      {selected.has(tv.id) && <Text style={ng.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main HomeScreen ──────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { trips, account, travelers, setCurrentTrip } = useStore();
  const [activeTab, setActiveTab]     = useState('trips');
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showAuth, setShowAuth]       = useState(false);

  const openTrip = (tripId) => {
    setCurrentTrip(tripId);
    navigation.navigate('Trip');
  };

  const TAB_BAR_HEIGHT = 56;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Shared hero header */}
      <LinearGradient
        colors={['#1a1714', '#3d2c1e', '#e86c3a']}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={styles.heroNav}>
          <Text style={styles.logo}>Voy<Text style={{ color: colors.yellow }}>ara</Text></Text>
          {account.loggedIn ? (
            <TouchableOpacity style={styles.creditPill} onPress={() => setShowAuth(true)}>
              <Text style={styles.creditPillText}>
                {account.plan === 'pro' ? '⭐ Pro' : '🎁 Free'}  {account.name[0]?.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.signInBtn} onPress={() => setShowAuth(true)}>
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeTab === 'trips' ? (
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Plan Trips Together</Text>
            <Text style={styles.heroSub}>Daily itineraries · Multi-family expenses · Accessibility built-in</Text>
            <TouchableOpacity style={styles.heroCta} onPress={() => setShowNewTrip(true)}>
              <Text style={styles.heroCtaText}>Plan Your Next Trip</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.heroContentSmall}>
            <Text style={styles.heroTitleSmall}>Your Travelers</Text>
            <Text style={styles.heroSub}>
              {travelers.length} saved · Select any for a trip in seconds
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'trips' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Trips</Text>
              <TouchableOpacity onPress={() => setShowNewTrip(true)}>
                <Text style={styles.addLink}>+ Add Trip</Text>
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
        ) : (
          <View style={{ flex: 1, paddingBottom: insets.bottom + TAB_BAR_HEIGHT }}>
            <TravelersTab />
          </View>
        )}
      </View>

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { paddingBottom: insets.bottom, height: TAB_BAR_HEIGHT + insets.bottom }]}>
        {[
          { key: 'trips',     label: 'Trips',    icon: '✈️' },
          { key: 'travelers', label: 'Travelers', icon: '👥' },
        ].map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              {active && <View style={styles.tabIndicator} />}
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* FAB — only on Trips tab */}
      {activeTab === 'trips' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + TAB_BAR_HEIGHT + 12 }]}
          onPress={() => setShowNewTrip(true)}
        >
          <Text style={styles.fabText}>+ New Trip</Text>
        </TouchableOpacity>
      )}

      <NewTripModal
        visible={showNewTrip}
        onClose={() => setShowNewTrip(false)}
        onCreated={(trip) => { setShowNewTrip(false); openTrip(trip.id); }}
        onNeedAuth={() => { setShowNewTrip(false); setShowAuth(true); }}
      />
      <AuthModal visible={showAuth} onClose={() => setShowAuth(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  hero: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl },
  heroNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  creditPill: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  creditPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  signInBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  signInText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  heroContent: { alignItems: 'center', paddingTop: spacing.lg },
  heroTitle: {
    fontSize: 30, fontWeight: '900', color: '#fff',
    textAlign: 'center', letterSpacing: -0.8,
  },
  heroCta: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 20,
  },
  heroCtaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  heroContentSmall: { paddingTop: spacing.sm },
  heroTitleSmall: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 8, lineHeight: 20 },

  scroll: { flex: 1 },
  content: { padding: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  addLink: { ...typography.bodyBold, color: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 20,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 10, paddingBottom: 6, position: 'relative',
  },
  tabIcon: { fontSize: 20, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabLabel: { ...typography.caption, color: colors.muted, marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
  tabIndicator: {
    position: 'absolute', top: 0, left: '20%', right: '20%',
    height: 3, backgroundColor: colors.primary,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },

  fab: {
    position: 'absolute', right: 20,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: 20, paddingVertical: 14, ...shadow.lg,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ── Travelers tab styles ──────────────────────────────────────────
const tt = StyleSheet.create({
  content: { padding: spacing.xxl, paddingBottom: 60 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h4, color: colors.text },
  sectionSub: { ...typography.small, color: colors.muted, marginTop: 2 },
  addBtn: {
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  addBtnText: { ...typography.smallBold, color: colors.primary },

  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.xl, alignItems: 'center', marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { ...typography.h4, color: colors.text, marginBottom: 6 },
  emptyBody: {
    ...typography.body, color: colors.muted,
    textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg,
  },
  emptyBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: 20, paddingVertical: 11,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },

  travelerCard: {
    backgroundColor: '#fff', borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
  },
  travelerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  travelerName: { ...typography.bodyBold, color: colors.text },
  travelerMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  actionBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tag: {
    backgroundColor: colors.primaryLight, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  tagText: { ...typography.caption, color: colors.primary, fontWeight: '700', fontSize: 10 },
  interests: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },

  groupCard: {
    backgroundColor: '#fff', borderLeftWidth: 4, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm, overflow: 'hidden', ...shadow.sm,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, padding: spacing.md,
  },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupName: { ...typography.bodyBold, color: colors.text },
  groupSub: { ...typography.small, color: colors.muted, marginTop: 1 },
  groupMembers: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  groupMemberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  groupMemberEmoji: { fontSize: 13 },
  groupMemberName: { ...typography.caption, color: colors.text, fontWeight: '700' },
  groupMemberRemove: { ...typography.caption, color: colors.muted, fontSize: 10, marginLeft: 2 },
  groupAddChip: {
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.full,
    borderStyle: 'dashed', paddingHorizontal: spacing.sm, paddingVertical: 5,
  },
  groupAddChipText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
});

// ── New Group Modal styles ────────────────────────────────────────
const ng = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  title: { ...typography.bodyBold, color: colors.text },
  cancel: { ...typography.body, color: colors.muted },
  create: { ...typography.bodyBold, color: colors.primary },
  label: {
    fontSize: 11, fontWeight: '700', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 15, color: colors.text, backgroundColor: colors.bg, marginBottom: spacing.xl,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: 'transparent', marginBottom: spacing.sm,
  },
  memberRowSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  memberName: { ...typography.bodyBold, color: colors.text },
  memberMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
