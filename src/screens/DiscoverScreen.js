/**
 * DiscoverScreen.js — the new (flag-gated) Lambus-style Discover surface.
 *
 * A hero "Trip of the Week" + horizontal rails (Popular Categories · Start your trip · Made for
 * groups) + an onboarding banner — the new-user front door. Presentation only: the REAL actions
 * call the existing engine entry points (PasteImportModal, NewTripModal); inspiration cards that
 * aren't built yet are honest "coming soon" toasts (never dead taps). No SVG in RN — heroes are
 * LinearGradient + emoji. Reachable only when RELEASE_FLAGS.newShell is on (see MainShell).
 *
 * Theme via useShellTheme (local light/dark for the new shell). The image-gradient cards keep their
 * fixed colors + white text in both modes (they sit on photos, not the surface).
 *
 * Contract: docs/ux-engine-contract.md · Design ref: prototypes/discover-rails.html
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import useStore, { showToast } from '../store';
import { spacing, radius, shadow } from '../theme';
import { useShellTheme } from '../shellTheme';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import NewTripModal from '../modals/NewTripModal';
import PasteImportModal from '../modals/PasteImportModal';

const CATEGORIES = [
  { label: 'Beaches',    emoji: '🏝️', g: ['#2bb3c0', '#0a7c91'] },
  { label: 'Road trips', emoji: '🚐', g: ['#d98a3d', '#a85a22'] },
  { label: 'City',       emoji: '🌆', g: ['#6d77c9', '#3a3f86'] },
  { label: 'Mountains',  emoji: '⛰️', g: ['#6f8f6a', '#3f5a3a'] },
];

const GROUP_TRIPS = [
  { title: 'Smoky Mountains Reunion', meta: '4 families · 5 days', emoji: '🏔️', g: ['#5f8f7a', '#2f5547'] },
  { title: 'SoCal Coast with Kids',   meta: '3 families · 7 days', emoji: '🌊', g: ['#2bb3c0', '#0a7c91'] },
  { title: 'Iceland Ring Road',       meta: '2 families · 8 days', emoji: '❄️', g: ['#7d8aa6', '#3c4a63'] },
];

const soon = (what) => showToast(`${what} — coming soon`, '✨');

export default function DiscoverScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { c, resolved } = useShellTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const setCurrentTrip = useStore((st) => st.setCurrentTrip);
  const [showPaste, setShowPaste]     = useState(false);
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showBanner, setShowBanner]   = useState(true);

  const openTrip = (tripId) => { setCurrentTrip(tripId); navigation.navigate('TripShell'); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 120 }}
      >
        {/* header */}
        <View style={s.header}>
          <Text style={s.h1}>Discover</Text>
          <View style={s.iconpill}>
            <TouchableOpacity style={s.iconbtn} onPress={() => soon('Search')}><Icon name="search" size={19} color={c.text} /></TouchableOpacity>
            <TouchableOpacity style={s.iconbtn} onPress={() => soon('Saved trips')}><Icon name="star" size={19} color={c.text} /></TouchableOpacity>
          </View>
        </View>

        {/* onboarding banner */}
        {showBanner && (
          <PressableScale haptic="light" style={s.banner} onPress={() => setShowPaste(true)}>
            <Text style={s.bannerEmoji}>👋</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>New to Kithova? Start in ~10 seconds</Text>
              <Text style={s.bannerSub}>Paste a plan, or spin up a group trip — costs auto-split.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowBanner(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="close" size={16} color={c.subtle} />
            </TouchableOpacity>
          </PressableScale>
        )}

        {/* HERO — Trip of the Week */}
        <PressableScale haptic="light" style={s.hero} onPress={() => soon('Curated trips')}>
          <LinearGradient colors={['#8a93a3', '#5c6675', '#3a4150']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={s.heroScene}>🏔️</Text>
          <View style={s.heroOverlay} />
          <Text style={s.heroEyebrow}>TRIP OF{'\n'}THE WEEK</Text>
          <View style={s.heroCard}>
            <Text style={s.heroTitle}>Georgia: The Pearl of the Caucasus</Text>
            <Text style={s.heroMeta}>Georgia · 6 stops · great for 3 families</Text>
          </View>
        </PressableScale>

        {/* RAIL — Popular Categories */}
        <Section s={s} title="Popular Categories" action="See all" onAction={() => soon('Categories')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {CATEGORIES.map((cat, i) => (
            <PressableScale key={cat.label} haptic="light" style={s.cat} onPress={() => soon(cat.label)}>
              <LinearGradient colors={cat.g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={s.catOverlay} />
              <Text style={s.catEmoji}>{cat.emoji}</Text>
              <View style={s.catNum}><Text style={s.catNumText}>{i + 1}</Text></View>
              <Text style={s.catLabel}>{cat.label}</Text>
            </PressableScale>
          ))}
        </ScrollView>

        {/* RAIL — Start your trip (the real onboarding) */}
        <Section s={s} title="Start your trip" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          <ActionCard s={s} emoji="✨" tint={c.smartSoft} title="Paste a plan" sub="From ChatGPT, a blog, anywhere" onPress={() => setShowPaste(true)} />
          <ActionCard s={s} emoji="👨‍👩‍👧‍👦" tint={c.primaryLight} title="Group trip" sub="Add families · costs auto-split" onPress={() => setShowNewTrip(true)} />
          <ActionCard s={s} emoji="🤖" tint={c.smartSoft} title="Plan with AI" sub="Day-by-day from your vibe" onPress={() => soon('AI planning')} />
          <ActionCard s={s} emoji="📋" tint={c.primaryLight} title="Templates" sub="Proven multi-family routes" onPress={() => soon('Templates')} />
        </ScrollView>

        {/* RAIL — Made for groups */}
        <Section s={s} title="Made for groups" action="See all" onAction={() => soon('Group itineraries')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
          {GROUP_TRIPS.map((t) => (
            <PressableScale key={t.title} haptic="light" style={s.gtrip} onPress={() => soon(t.title)}>
              <View style={s.gphoto}>
                <LinearGradient colors={t.g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={s.gemoji}>{t.emoji}</Text>
                <View style={s.gbadge}><Text style={s.gbadgeText}>{t.meta}</Text></View>
              </View>
              <View style={s.gbody}>
                <Text style={s.gtitle} numberOfLines={1}>{t.title}</Text>
                <View style={s.chipRow}>
                  <View style={s.chip}><Text style={s.chipText}>auto-split</Text></View>
                  <View style={s.chip}><Text style={s.chipText}>kid-friendly</Text></View>
                </View>
              </View>
            </PressableScale>
          ))}
        </ScrollView>

        <Text style={s.footnote}>Tap “Paste a plan” or “Group trip” to start — curated trips & templates are on the way.</Text>
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

function Section({ s, title, action, onAction }) {
  return (
    <View style={s.sec}>
      <Text style={s.secTitle}>{title}</Text>
      {action ? <TouchableOpacity onPress={onAction}><Text style={s.secAction}>{action}</Text></TouchableOpacity> : null}
    </View>
  );
}

function ActionCard({ s, emoji, tint, title, sub, onPress }) {
  return (
    <PressableScale haptic="light" style={s.act} onPress={onPress}>
      <View style={[s.actIcon, { backgroundColor: tint }]}><Text style={{ fontSize: 24 }}>{emoji}</Text></View>
      <View>
        <Text style={s.actTitle}>{title}</Text>
        <Text style={s.actSub}>{sub}</Text>
      </View>
    </PressableScale>
  );
}

const makeStyles = (c) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  h1: { fontSize: 36, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
  iconpill: { flexDirection: 'row', gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline, borderRadius: radius.full, padding: 8 },
  iconbtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: spacing.lg, marginBottom: spacing.xs, padding: 13, borderRadius: radius.lg, backgroundColor: c.smartSoft, borderWidth: 1, borderColor: c.hairline },
  bannerEmoji: { fontSize: 22 },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: c.smartDeep },
  bannerSub: { fontSize: 12, color: c.muted, marginTop: 1 },

  hero: { height: 320, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: 26, overflow: 'hidden', justifyContent: 'center', ...shadow.md },
  heroScene: { position: 'absolute', top: 26, alignSelf: 'center', fontSize: 120, opacity: 0.9 },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.22)' },
  heroEyebrow: { textAlign: 'center', color: '#fff', fontWeight: '800', fontSize: 38, lineHeight: 40, letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 14, marginBottom: 70 },
  heroCard: { position: 'absolute', left: 14, right: 50, bottom: 14, borderRadius: 16, padding: 13, backgroundColor: 'rgba(15,15,18,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  heroTitle: { color: '#fff', fontWeight: '800', fontSize: 17, lineHeight: 21 },
  heroMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 3 },

  sec: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  secTitle: { fontSize: 22, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
  secAction: { fontSize: 13, fontWeight: '700', color: c.accent },
  rail: { paddingHorizontal: spacing.lg, gap: 13 },

  cat: { width: 154, height: 118, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
  catOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' },
  catEmoji: { position: 'absolute', alignSelf: 'center', top: 26, fontSize: 44 },
  catNum: { position: 'absolute', left: 9, bottom: 8, width: 25, height: 25, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  catNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  catLabel: { position: 'absolute', left: 41, bottom: 12, color: '#fff', fontWeight: '800', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },

  act: { width: 150, height: 148, borderRadius: 20, padding: 15, justifyContent: 'space-between', borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface },
  actIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actTitle: { fontWeight: '800', fontSize: 15, color: c.text },
  actSub: { fontSize: 12, color: c.muted, marginTop: 3, lineHeight: 16 },

  gtrip: { width: 230, borderRadius: 20, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline },
  gphoto: { height: 126, justifyContent: 'flex-end' },
  gemoji: { position: 'absolute', alignSelf: 'center', top: 34, fontSize: 50 },
  gbadge: { position: 'absolute', top: 9, left: 9, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 5 },
  gbadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  gbody: { padding: 12 },
  gtitle: { fontWeight: '800', fontSize: 15, color: c.text },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.hairline, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700', color: c.accent },

  footnote: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, color: c.subtle, fontSize: 12, lineHeight: 18 },
});
