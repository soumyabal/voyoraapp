/**
 * ErrorBoundary — catches render-time crashes so a bad state shows a friendly,
 * recoverable screen instead of a white/blank screen (which reads as "broken" to
 * an App Store reviewer and to users). React error boundaries must be classes.
 *
 * "Try again" clears the error (fixes transient crashes). "Reset saved data" wipes
 * the persisted store key — the escape hatch if a corrupted saved trip deterministically
 * crashes a screen on mount; the app reseeds its sample data on next launch.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, typography } from '../theme';
import { APP_NAME } from '../config';

const STORAGE_KEY = 'voyara-storage'; // must match store/index.js persist({ name })

export default class ErrorBoundary extends React.Component {
  state = { error: null, cleared: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Best-effort log; swap for a crash reporter (Sentry) when one is added.
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
  }

  tryAgain = () => this.setState({ error: null, cleared: false });

  resetData = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    this.setState({ cleared: true });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={s.wrap}>
        <Text style={s.emoji}>🧭</Text>
        <Text style={s.title}>{APP_NAME} hit a snag</Text>
        {this.state.cleared ? (
          <Text style={s.body}>
            Saved data was reset. Please close and reopen the app to start fresh.
          </Text>
        ) : (
          <>
            <Text style={s.body}>
              Something went wrong on this screen. Try again — or, if it keeps happening,
              reset the saved data.
            </Text>
            <TouchableOpacity style={s.btn} onPress={this.tryAgain} activeOpacity={0.85}>
              <Text style={s.btnText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={this.resetData} activeOpacity={0.7}>
              <Text style={s.linkText}>Reset saved data</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emoji: { fontSize: 48, marginBottom: spacing.lg },
  title: { ...typography.h3, color: colors.ink, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...typography.body, color: colors.body, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl, maxWidth: 320 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkBtn: { marginTop: spacing.lg, padding: spacing.sm },
  linkText: { color: colors.subtle, fontWeight: '600', fontSize: 13 },
});
