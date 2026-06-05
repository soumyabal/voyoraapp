/**
 * LoadingScreen.js — the branded launch screen.
 *
 * A code-drawn Kithova logo (terracotta gradient "K" badge + wordmark + tagline) on a
 * warm cream field, with a polished entrance: the badge springs in, the name rises under
 * it, and three dots pulse while the app gets ready. Shows for HOLD_MS, then calls onDone.
 *
 * All theme-token driven (no hardcoded brand colors) so it travels with the design system
 * — and the "K" badge is intentionally app-icon-shaped so it can seed the real icon later.
 * Swap in a designer's logo image here whenever one exists.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, spacing } from '../theme';

const HOLD_MS = 1900; // how long the splash stays up before revealing the app

export default function LoadingScreen({ onDone }) {
  const badgeScale = useRef(new Animated.Value(0.6)).current;
  const badgeOp    = useRef(new Animated.Value(0)).current;
  const textOp     = useRef(new Animated.Value(0)).current;
  const textRise   = useRef(new Animated.Value(14)).current;
  const dots       = [useRef(new Animated.Value(0)).current,
                      useRef(new Animated.Value(0)).current,
                      useRef(new Animated.Value(0)).current];

  useEffect(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* haptics optional */ }

    // Entrance: badge springs + fades in, then the wordmark rises under it.
    Animated.sequence([
      Animated.parallel([
        Animated.spring(badgeScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(badgeOp, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOp, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(textRise, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Looping, staggered pulse for the three loader dots.
    const pulse = (v, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 440, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 440, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
    const loops = dots.map((v, i) => pulse(v, i * 160));
    loops.forEach((l) => l.start());

    const t = setTimeout(() => { if (onDone) onDone(); }, HOLD_MS);
    return () => { clearTimeout(t); loops.forEach((l) => l.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dotStyle = (v) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
  });

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <Animated.View style={{ opacity: badgeOp, transform: [{ scale: badgeScale }] }}>
        <LinearGradient
          colors={[colors.accent, colors.accentDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Text style={styles.badgeLetter}>K</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View style={[styles.textWrap, { opacity: textOp, transform: [{ translateY: textRise }] }]}>
        <Text style={styles.wordmark}>Kithova</Text>
        <Text style={styles.tagline}>everyone you travel with</Text>
      </Animated.View>

      <View style={styles.dots}>
        {dots.map((v, i) => (
          <Animated.View key={i} style={[styles.dot, dotStyle(v)]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 104,
    height: 104,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 12,
  },
  badgeLetter: { color: colors.white, fontSize: 54, fontWeight: '900', letterSpacing: -1, marginTop: -2 },
  textWrap: { alignItems: 'center' },
  wordmark: { marginTop: spacing.xxl, fontSize: 34, fontWeight: '900', letterSpacing: -0.5, color: colors.ink },
  tagline: { marginTop: spacing.xs, fontSize: 14, color: colors.subtle, letterSpacing: 0.2 },
  dots: { flexDirection: 'row', position: 'absolute', bottom: 64, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
