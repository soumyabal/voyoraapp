import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import MainShell from '../screens/MainShell';
import TripScreen from '../screens/TripScreen';
import TripShellScreen from '../screens/TripShellScreen';
import { colors } from '../theme';
import { RELEASE_FLAGS } from '../config';

const Stack = createNativeStackNavigator();

// Flag-gated: the new Lambus-style app shell (bottom tabs + Discover) replaces the plain Home
// list as the root surface. OFF by default → identical to before. TripScreen is still pushed.
const RootHome = RELEASE_FLAGS.newShell ? MainShell : HomeScreen;

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Home"
        component={RootHome}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Trip"
        component={TripScreen}
        options={{ headerShown: false }}
      />
      {/* New-shell trip detail (flat header + segmented subtabs). Registered only with the flag;
          reached via navigation.navigate('TripShell') from the shell screens. Classic 'Trip' stays. */}
      {RELEASE_FLAGS.newShell && (
        <Stack.Screen
          name="TripShell"
          component={TripShellScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
