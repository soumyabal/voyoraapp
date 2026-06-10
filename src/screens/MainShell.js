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
import UpdatesScreen from './UpdatesScreen';
import ProfileScreen from './ProfileScreen';
import Icon from '../components/ui/Icon';
import PressableScale from '../components/ui/PressableScale';
import { colors, radius, shadow } from '../theme';

const TABS = [
  { key: 'trips',    label: 'Trips',    icon: 'list' },
  { key: 'discover', label: 'Discover', icon: 'compass-outline' },
  { key: 'updates',  label: 'Updates',  icon: 'notifications-outline' },
  { key: 'profile',  label: 'Profile',  icon: 'person' },
];

export default function MainShell({ navigation }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('discover');
  const show = (key) => ({ flex: 1, display: tab === key ? 'flex' : 'none' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={show('trips')}><HomeScreen navigation={navigation} /></View>
      <View style={show('discover')}><DiscoverScreen navigation={navigation} /></View>
      <View style={show('updates')}><UpdatesScreen navigation={navigation} /></View>
      <View style={show('profile')}><ProfileScreen navigation={navigation} /></View>

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
