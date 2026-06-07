/**
 * HomeScreen.js
 *
 * Two-tab home screen:
 *   ✈️ Trips     — trip cards, plan new trip
 *   👥 Travelers — global traveler library & saved groups
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';

const SCREEN_W      = Dimensions.get('window').width;
const TRIP_ACTION_W = 144;  // 2 × 72px action buttons
const TRIP_CARD_W   = SCREEN_W - 48; // SCREEN_W - 2×spacing.xxl
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useStore from '../store';
import TripCard from '../components/TripCard';
import NewTripModal from '../modals/NewTripModal';
import AuthModal from '../modals/AuthModal';
import AddProfileModal from '../modals/AddProfileModal';
import { colors, spacing, radius, typography, shadow, gradients } from '../theme';
import { RELEASE_FLAGS } from '../config';
import { avatarColor, getAllMembers, fmt } from '../utils/helpers';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import KithovaWordmark from '../components/ui/KithovaWordmark';
import KithovaMark from '../components/ui/KithovaMark';
import FamilyStack from '../components/ui/FamilyStack';
import { select } from '../utils/feedback';

const PACE_LABELS = { relaxed: '🐢 Relaxed', moderate: '🚶 Moderate', packed: '🏃 Packed' };

// ─── Travelers tab content ────────────────────────────────────────

function TravelersTab() {
  const {
    travelers, groups,
    createTraveler, deleteTravelerFromLibrary,
    createGroup, updateGroup, deleteGroup,
    addTravelerToGroup, removeTravelerFromGroup,
  } = useStore();

  const [showAddProfile, setShowAddProfile] = useState(false);
  const [editTraveler, setEditTraveler]     = useState(null);
  const [showNewGroup, setShowNewGroup]     = useState(false);
  const [editGroup, setEditGroup]           = useState(null); // group object to edit

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
            const openActions = () => Alert.alert(tv.name, undefined, [
              { text: '✏️ Edit', onPress: () => { setEditTraveler(tv); setShowAddProfile(true); } },
              { text: '🗑️ Remove', style: 'destructive', onPress: () => confirmDeleteTraveler(tv) },
              { text: 'Cancel', style: 'cancel' },
            ]);
            return (
              <PressableScale key={tv.id} style={tt.travelerCard} onPress={openActions} haptic="light" scaleTo={0.98}>
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
                  <Text style={tt.travelerMore}>⋯</Text>
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
              </PressableScale>
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
              Group your travelers (e.g. &quot;Sharma Family&quot;). When planning a trip you can add a whole group in one tap.
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
                      {groupTravelers.length > 0
                        ? `${groupTravelers.length} member${groupTravelers.length !== 1 ? 's' : ''} · ${groupTravelers.map(tv => tv.name.split(' ')[0]).join(', ')}`
                        : 'No members yet'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditGroup(g)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={tt.actionBtn}
                  >
                    <Text>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDeleteGroup(g)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={tt.actionBtn}
                  >
                    <Text>🗑</Text>
                  </TouchableOpacity>
                </View>

                {/* Member chips — tap to see name, no remove inline */}
                {groupTravelers.length > 0 && (
                  <View style={tt.groupMembers}>
                    {groupTravelers.map(tv => (
                      <View key={tv.id} style={tt.groupMemberChip}>
                        <Text style={tt.groupMemberEmoji}>{tv.emoji || '👤'}</Text>
                        <Text style={tt.groupMemberName}>{tv.name.split(' ')[0]}</Text>
                      </View>
                    ))}
                    <TouchableOpacity style={tt.groupEditChip} onPress={() => setEditGroup(g)}>
                      <Text style={tt.groupEditChipText}>✏️ Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Empty group prompt */}
                {groupTravelers.length === 0 && (
                  <TouchableOpacity style={tt.groupEmptyPrompt} onPress={() => setEditGroup(g)}>
                    <Text style={tt.groupEmptyPromptText}>+ Add members</Text>
                  </TouchableOpacity>
                )}
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
      <EditGroupModal
        visible={!!editGroup}
        group={editGroup}
        travelers={travelers}
        onSave={(name, travelerIds) => updateGroup(editGroup.id, { name, travelerIds })}
        onClose={() => setEditGroup(null)}
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

// ─── Edit Group Modal ─────────────────────────────────────────────
function EditGroupModal({ visible, group, travelers, onSave, onClose }) {
  const [name, setName]       = useState('');
  const [selected, setSelected] = useState(new Set());

  React.useEffect(() => {
    if (visible && group) {
      setName(group.name || '');
      setSelected(new Set(group.travelerIds || []));
    }
  }, [visible, group]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const canSave = name.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={ng.header}>
            <TouchableOpacity onPress={onClose}><Text style={ng.cancel}>Cancel</Text></TouchableOpacity>
            <Text style={ng.title}>Edit Group</Text>
            <TouchableOpacity onPress={() => { if (canSave) { onSave(name.trim(), [...selected]); onClose(); } }} disabled={!canSave}>
              <Text style={[ng.create, !canSave && { opacity: 0.35 }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            {/* Group name */}
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

            {/* Traveler selection */}
            {travelers.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>No travelers in your library yet.</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Add travelers first, then add them to groups.</Text>
              </View>
            ) : (
              <>
                <Text style={ng.label}>Members ({selected.size} selected)</Text>
                {travelers.map(tv => {
                  const isMember = selected.has(tv.id);
                  return (
                    <TouchableOpacity
                      key={tv.id}
                      style={[ng.memberRow, isMember && ng.memberRowSelected]}
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
                      <View style={[ng.checkbox, isMember && ng.checkboxSelected]}>
                        {isMember && <Text style={ng.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Swipeable trip card wrapper ─────────────────────────────────
function SwipeableTripCard({ trip, status, onPress, onComplete, onDelete }) {
  const scrollRef = useRef(null);
  const close = () => scrollRef.current?.scrollTo({ x: 0, animated: true });

  const handleDelete = () => {
    Alert.alert(
      'Delete Trip',
      `Delete "${trip.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: close },
        { text: 'Delete', style: 'destructive', onPress: () => { close(); onDelete(); } },
      ],
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      snapToOffsets={[0, TRIP_ACTION_W]}
      decelerationRate="fast"
      scrollEventThrottle={32}
      contentContainerStyle={sw.row}
    >
      {/* Card */}
      <TripCard
        trip={trip}
        status={status}
        onPress={onPress}
        style={{ width: TRIP_CARD_W }}
      />

      {/* Action buttons */}
      <View style={sw.actions}>
        <TouchableOpacity
          style={[sw.action, { backgroundColor: trip.archived ? '#6b7280' : '#22c55e' }]}
          onPress={() => { close(); onComplete(); }}
        >
          <Text style={sw.actionIcon}>{trip.archived ? '↩' : '✓'}</Text>
          <Text style={sw.actionLabel}>{trip.archived ? 'Reopen' : 'Complete'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sw.action, { backgroundColor: '#ef4444' }]}
          onPress={handleDelete}
        >
          <Text style={sw.actionIcon}>🗑</Text>
          <Text style={sw.actionLabel}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const sw = StyleSheet.create({
  row:     { flexDirection: 'row' },
  actions: { width: TRIP_ACTION_W, flexDirection: 'row', marginBottom: spacing.lg },
  action:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4 },
  actionIcon:  { fontSize: 22, color: '#fff' },
  actionLabel: { fontSize: 10, color: '#fff', fontWeight: '700', textAlign: 'center' },
});

// ─── Home helpers ─────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Phase + human countdown label for a trip relative to today.
function tripStatus(trip) {
  const DAY = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(trip.startDate + 'T00:00:00');
  const end   = new Date(trip.endDate + 'T00:00:00');
  if (trip.archived) return { phase: 'past', label: 'Completed' };
  if (today > end)   return { phase: 'past', label: 'Ended' };
  if (today >= start && today <= end) {
    return { phase: 'ongoing', label: 'Happening now' };   // Phase-1: no per-day tracking
  }
  const days = Math.round((start - today) / DAY);
  const label = days === 0 ? 'Starts today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  return { phase: 'upcoming', label, days };
}

const VALUE_PROPS = [
  { icon: 'calendar', tint: colors.accent,  title: 'Easy to plan',  sub: 'Day-by-day itineraries, smart time slots, and a Discover search for every city.' },
  { icon: 'plane',    tint: colors.success, title: 'Fun to travel', sub: 'Everyone along for the ride — accessibility, dietary and pace needs handled per traveler.' },
  { icon: 'wallet',   tint: colors.smart,   title: 'Fair to share', sub: 'Costs split per family — hotels by rooms, transit by size — fairly, automatically.' },
];

// ─── Next-trip spotlight card ─────────────────────────────────────
function NextTripSpotlight({ trip, status, onOpen }) {
  const allMembers = getAllMembers(trip);
  const famCount   = trip.families.length;
  return (
    <PressableScale haptic="light" onPress={onOpen} style={styles.spotCard} scaleTo={0.985}>
      <LinearGradient
        colors={trip.bgColors || ['#e17055', '#fdcb6e']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.spotBand}
      >
        <View style={styles.spotEmojiWrap}><Text style={styles.spotEmoji}>{trip.emoji}</Text></View>
        <View style={styles.spotPill}><Text style={styles.spotPillText}>{status.label}</Text></View>
      </LinearGradient>
      <View style={styles.spotBody}>
        <Text style={styles.spotName} numberOfLines={1}>{trip.name}</Text>
        <View style={styles.spotMetaRow}>
          <Icon name="location" size={14} color={colors.subtle} />
          <Text style={styles.spotMeta} numberOfLines={1}>{trip.destination}</Text>
        </View>
        <View style={styles.spotMetaRow}>
          <Icon name="calendar" size={14} color={colors.subtle} />
          <Text style={styles.spotMeta}>{fmt(trip.startDate)} – {fmt(trip.endDate)} · {trip.days.length}d</Text>
        </View>
        <View style={styles.spotFooter}>
          <View style={styles.spotMetaRow}>
            <FamilyStack families={trip.families} size={26} />
            <Text style={styles.spotPeople}>
              {famCount} famil{famCount !== 1 ? 'ies' : 'y'} · {allMembers.length} {allMembers.length !== 1 ? 'people' : 'person'}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// ─── Main HomeScreen ──────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { trips, account, travelers, setCurrentTrip, deleteTrip, updateTrip } = useStore();
  const [activeTab, setActiveTab]       = useState('trips');
  const [showNewTrip, setShowNewTrip]   = useState(false);
  const [showAuth, setShowAuth]         = useState(false);
  const [seg, setSeg]                   = useState('upcoming');

  const openTrip = (tripId) => {
    setCurrentTrip(tripId);
    navigation.navigate('Trip');
  };

  const TAB_BAR_HEIGHT = 56;

  // Classify trips into active-now / upcoming / past. Active trips get their own Home group
  // (there can be several — this is a planner, so we don't track which day a trip is on).
  const withStatus = trips.map(t => ({ trip: t, status: tripStatus(t) }));
  const active = withStatus
    .filter(x => x.status.phase === 'ongoing')
    .sort((a, b) => new Date(a.trip.startDate) - new Date(b.trip.startDate));
  const upcoming = withStatus
    .filter(x => x.status.phase === 'upcoming')
    .sort((a, b) => new Date(a.trip.startDate) - new Date(b.trip.startDate));
  const past = withStatus
    .filter(x => x.status.phase === 'past')
    .sort((a, b) => new Date(b.trip.startDate) - new Date(a.trip.startDate));
  const spotlight     = upcoming[0] || null;
  const upcomingRest  = spotlight ? upcoming.slice(1) : upcoming;
  const list          = seg === 'upcoming' ? upcomingRest : past;
  const hasTrips      = trips.length > 0;
  const firstName     = account.loggedIn && account.name ? account.name.split(' ')[0] : '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Shared hero header */}
      <LinearGradient
        colors={gradients.hero}
        style={[styles.hero, { paddingTop: insets.top + 16 }, activeTab === 'trips' && hasTrips && styles.heroCompact]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={styles.heroNav}>
          <View>
            <View style={styles.logoRow}>
              <KithovaMark size={20} hub={colors.white} />
              <KithovaWordmark variant="onDark" size={22} />
            </View>
            <Text style={styles.brandTagline} numberOfLines={1} adjustsFontSizeToFit>Easy to plan. Fun to travel. Fair to share.</Text>
          </View>
          {/* Accounts are a freemium feature (RELEASE_FLAGS.accounts) — hidden in the
              free/local TestFlight build so there's no non-functional Sign In UI. */}
          {RELEASE_FLAGS.accounts && (
            account.loggedIn ? (
              <TouchableOpacity style={styles.creditPill} onPress={() => setShowAuth(true)}>
                <Text style={styles.creditPillText}>
                  {account.plan === 'pro' ? '⭐ Pro' : '🎁 Free'}  {account.name[0]?.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.signInBtn} onPress={() => setShowAuth(true)}>
                <Text style={styles.signInText}>Sign In</Text>
              </TouchableOpacity>
            )
          )}
        </View>

        {activeTab === 'trips' ? (
          hasTrips ? (
            <View style={styles.heroGreet}>
              <Text style={styles.heroGreetTitle}>{greeting()}{firstName ? `, ${firstName}` : ''} 👋</Text>
              <Text style={styles.heroSub}>
                {spotlight
                  ? `${trips.length} trip${trips.length !== 1 ? 's' : ''} · next ${spotlight.status.label.toLowerCase()}`
                  : `${trips.length} trip${trips.length !== 1 ? 's' : ''} planned`}
              </Text>
            </View>
          ) : (
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Plan Trips Together</Text>
              <Text style={styles.heroSub}>The only planner built for multi-family group travel</Text>
              <TouchableOpacity style={styles.heroCta} onPress={() => setShowNewTrip(true)}>
                <Text style={styles.heroCtaText}>Plan Your First Trip</Text>
              </TouchableOpacity>
            </View>
          )
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
            {!hasTrips ? (
              <View style={styles.onboard}>
                {VALUE_PROPS.map(v => (
                  <View key={v.title} style={styles.featureCard}>
                    <View style={[styles.featureIconWrap, { backgroundColor: v.tint + '1A' }]}>
                      <Icon name={v.icon} size={22} color={v.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureTitle}>{v.title}</Text>
                      <Text style={styles.featureSub}>{v.sub}</Text>
                    </View>
                  </View>
                ))}
                <PressableScale haptic="medium" style={styles.emptyBtn} onPress={() => setShowNewTrip(true)}>
                  <Icon name="add" size={20} color="#fff" />
                  <Text style={styles.emptyBtnText}>Create a Trip</Text>
                </PressableScale>
              </View>
            ) : (
              <>
                {/* Active now — currently-happening trips, surfaced at the top (can be several) */}
                {active.length > 0 && (
                  <>
                    <Text style={styles.spotCaption}>ACTIVE NOW</Text>
                    {active.map(({ trip, status }) => (
                      <SwipeableTripCard
                        key={trip.id}
                        trip={trip}
                        status={status}
                        onPress={() => openTrip(trip.id)}
                        onComplete={() => updateTrip(trip.id, { archived: !trip.archived })}
                        onDelete={() => deleteTrip(trip.id)}
                      />
                    ))}
                  </>
                )}

                {spotlight && (
                  <>
                    <Text style={styles.spotCaption}>NEXT TRIP</Text>
                    <NextTripSpotlight
                      trip={spotlight.trip}
                      status={spotlight.status}
                      onOpen={() => openTrip(spotlight.trip.id)}
                    />
                  </>
                )}

                {/* Upcoming / Past segmented filter */}
                <View style={styles.segWrap}>
                  {[
                    { k: 'upcoming', label: `Upcoming${upcomingRest.length ? ` (${upcomingRest.length})` : ''}` },
                    { k: 'past',     label: `Past${past.length ? ` (${past.length})` : ''}` },
                  ].map(t => (
                    <TouchableOpacity
                      key={t.k}
                      style={[styles.segBtn, seg === t.k && styles.segBtnActive]}
                      onPress={() => { select(); setSeg(t.k); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segText, seg === t.k && styles.segTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {list.length === 0 ? (
                  <Text style={styles.segEmpty}>
                    {seg === 'upcoming'
                      ? (spotlight ? 'No other upcoming trips — tap + New Trip to add one.' : 'No upcoming trips.')
                      : 'No past trips yet.'}
                  </Text>
                ) : (
                  list.map(({ trip, status }) => (
                    <SwipeableTripCard
                      key={trip.id}
                      trip={trip}
                      status={status}
                      onPress={() => openTrip(trip.id)}
                      onComplete={() => updateTrip(trip.id, { archived: !trip.archived })}
                      onDelete={() => deleteTrip(trip.id)}
                    />
                  ))
                )}
              </>
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
          { key: 'trips',     label: 'Trips',     icon: 'plane' },
          { key: 'travelers', label: 'Travelers', icon: 'people' },
        ].map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => { select(); setActiveTab(tab.key); }}
              activeOpacity={0.7}
            >
              {active && <View style={styles.tabIndicator} />}
              <Icon name={tab.icon} size={22} color={active ? colors.accent : colors.subtle} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* FAB — only on Trips tab */}
      {activeTab === 'trips' && (
        <PressableScale
          haptic="medium"
          style={[styles.fab, { bottom: insets.bottom + TAB_BAR_HEIGHT + 12 }]}
          onPress={() => setShowNewTrip(true)}
        >
          <Icon name="add" size={20} color="#fff" />
          <Text style={styles.fabText}>New Trip</Text>
        </PressableScale>
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
  heroCompact: { paddingBottom: spacing.xl },
  heroNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTagline: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.2, marginTop: 3 },
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

  // Compact returning-user greeting
  heroGreet: { paddingTop: spacing.xs },
  heroGreetTitle: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },

  scroll: { flex: 1 },
  content: { padding: spacing.xxl },

  // Next-trip spotlight
  spotCaption: { ...typography.overline, color: colors.subtle, marginBottom: spacing.sm },
  spotCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden',
    marginBottom: spacing.xl, ...shadow.lg,
  },
  spotBand: {
    height: 104, alignItems: 'center', justifyContent: 'center',
  },
  spotEmojiWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  spotEmoji: { fontSize: 36 },
  spotPill: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.full,
    paddingHorizontal: 11, paddingVertical: 5,
  },
  spotPillText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  spotBody: { padding: spacing.lg },
  spotName: { ...typography.h3, color: colors.ink, marginBottom: spacing.xs },
  spotMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  spotMeta: { ...typography.small, color: colors.subtle, flexShrink: 1 },
  spotFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  spotPeople: { ...typography.small, color: colors.body, fontWeight: '600' },
  spotOpen: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingLeft: 16, paddingRight: 12, paddingVertical: 9, ...shadow.sm,
  },
  spotOpenText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Upcoming / Past segmented control
  segWrap: {
    flexDirection: 'row', backgroundColor: colors.surface2 || '#eef0f2',
    borderRadius: radius.full, padding: 3, marginBottom: spacing.lg,
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.full },
  segBtnActive: { backgroundColor: '#fff', ...shadow.sm },
  segText: { ...typography.smallBold, color: colors.muted },
  segTextActive: { color: colors.text },
  segEmpty: { ...typography.body, color: colors.muted, textAlign: 'center', paddingVertical: 32 },

  // First-run onboarding (value props)
  onboard: { paddingTop: spacing.sm },
  featureCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.hairline,
    padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm,
  },
  featureIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { ...typography.bodyBold, color: colors.ink },
  featureSub: { ...typography.small, color: colors.subtle, marginTop: 2, lineHeight: 18 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingVertical: 15, marginTop: spacing.sm, ...shadow.md,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
    position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 10, paddingBottom: 6, position: 'relative',
  },
  tabLabel: { ...typography.caption, color: colors.subtle, marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: colors.accent, fontWeight: '800' },
  tabIndicator: {
    position: 'absolute', top: 0, left: '20%', right: '20%',
    height: 3, backgroundColor: colors.accent,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },

  fab: {
    position: 'absolute', right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingLeft: 18, paddingRight: 22, paddingVertical: 14, ...shadow.lg,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

// ── Travelers tab styles ──────────────────────────────────────────
const tt = StyleSheet.create({
  content: { padding: spacing.xxl, paddingBottom: 60 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.ink },
  sectionSub: { ...typography.small, color: colors.subtle, marginTop: 2 },
  addBtn: {
    backgroundColor: colors.accentSoft, borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  addBtnText: { ...typography.smallBold, color: colors.accent },

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
    ...shadow.sm,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  travelerName: { ...typography.bodyBold, color: colors.text },
  travelerMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  travelerMore: { fontSize: 18, color: colors.muted, paddingLeft: spacing.sm },
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
  groupEditChip: {
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.full,
    borderStyle: 'dashed', paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  groupEditChipText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  groupEmptyPrompt: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  groupEmptyPromptText: { ...typography.smallBold, color: colors.primary },
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
