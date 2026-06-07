// eslint-disable-next-line import/no-duplicates -- load-bearing: gesture-handler requires this bare side-effect import to be the FIRST line of the app; the named import below is intentionally separate.
import 'react-native-gesture-handler';
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// eslint-disable-next-line import/no-duplicates -- see note above; this named import is distinct from the required top-of-file side-effect import.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import ToastProvider from './src/components/Toast';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoadingScreen from './src/components/LoadingScreen';
import { tzSupported, deviceTz } from './src/utils/tz';

// Phase-0 timezone spike (docs/timezone-model.md §4): report whether THIS runtime's Hermes
// honors Intl { timeZone }. Dev-only, runs once. PASS → the tz engine works in pure JS (no lib).
if (__DEV__) {
  console.log(`[tz spike] Intl timeZone supported: ${tzSupported()} · device zone: ${deviceTz()}`);
}

export default function App() {
  const [ready, setReady] = useState(false);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          {ready ? (
            <NavigationContainer>
              <StatusBar style="light" />
              <AppNavigator />
              <ToastProvider />
            </NavigationContainer>
          ) : (
            <LoadingScreen onDone={() => setReady(true)} />
          )}
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
