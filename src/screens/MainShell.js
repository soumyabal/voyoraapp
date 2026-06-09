/**
 * MainShell.js — the new (flag-gated) app shell: a custom bottom tab bar over four app-level
 * surfaces. No navigation library (state-based, Expo-Go-safe). Tabs stay mounted (display:none,
 * like TripScreen) so scroll is preserved. Rendered in place of the Home stack screen ONLY when
 * RELEASE_FLAGS.newShell is on — the existing app is otherwise untouched.
 *
 * Two-level nav: these are APP tabs; per-trip tabs (Itinerary/People/Split) live in TripScreen,
 * which is still pushed via navigation.navigate('Trip'). Contract: docs/ux-engine-contract.md
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from './HomeScreen';
import DiscoverScreen from './DiscoverScreen';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import { colors, radius, shadow } from '../theme';

const TABS = [
  { key: 'trips',    label: 'Trips',    icon: 'list' },
  { key: 'discover', label: 'Discover', icon: 'compass-outline' },
  { key: 'updates',  label: 'Updates',  icon: 'notifications-outline' },
  { key: 'profile',  label: 'Profile',  icon: 'person' },
];

function Placeholder({ emoji, title, sub }) {
  return (
    <View style={ph.wrap}>
      <Text style={ph.emoji}>{emoji}</Text>
      <Text style={ph.title}>{title}</Text>
      <Text style={ph.sub}>{sub}</Text>
    </View>
  );
}

export default function MainShell({ navigation }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('discover');
  const show = (key) => ({ flex: 1, display: tab === key ? 'flex' : 'none' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={show('trips')}><HomeScreen navigation={navigation} /></View>
      <View style={show('discover')}><DiscoverScreen navigation={navigation} /></View>
      <View style={show('updates')}>
        <Placeholder emoji="🔔" title="Updates" sub="Trip activity, expense nudges, and what your group changed — coming soon." />
      </View>
      <View style={show('profile')}>
        <Placeholder emoji="🙂" title="Profile" sub="Your traveler library, families, and saved trips — coming soon." />
      </View>

      {/* floating bottom tab bar */}
      <View style={[bar.wrap, { bottom: Math.max(insets.bottom, 10) + 4 }]}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <PressableScale key={t.key} haptic="light" style={bar.tab} onPress={() => setTab(t.key)}>
              <View style={[bar.ring, on && bar.ringOn]}>
                <Icon name={t.icon} size={23} color={on ? colors.accent : colors.muted} />
              </View>
              <Text style={[bar.label, { color: on ? colors.accent : colors.muted }]}>{t.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const ph = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emoji: { fontSize: 52 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 250, lineHeight: 20 },
});

const bar = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 14, right: 14, height: 64, borderRadius: 24,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', ...shadow.lg,
  },
  tab: { alignItems: 'center', gap: 3, paddingHorizontal: 8, minWidth: 60 },
  ring: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full },
  ringOn: { backgroundColor: colors.primaryLight },
  label: { fontSize: 10.5, fontWeight: '700' },
});
