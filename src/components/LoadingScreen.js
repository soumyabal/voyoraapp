/**
 * LoadingScreen.js — the branded launch screen.
 *
 * An animated "kith" constellation: family-colored dots orbit a warm hub (your people,
 * together — the brand idea, and deliberately NOT a letter-in-a-rounded-square so it
 * doesn't read like a generic travel-app badge). The cluster blooms in and keeps orbiting
 * + pulsing the whole time it's up, with cycling microcopy beneath, so a load of any
 * length stays interesting. Reveals the app after HOLD_MS (or whenever the parent is ready).
 *
 * Theme-token driven; no image asset, no new deps. Swap in a designer's logo here later.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { colors, spacing } from '../theme';

const HOLD_MS = 2000;                 // minimum brand moment before revealing the app
const DOT_COLORS = [colors.accent, colors.smart, colors.success, colors.warn, colors.accentDark];
const N = DOT_COLORS.length;
const FIELD = 132;                    // constellation container (px)
const ORBIT = 40;                     // orbit radius
const DOT = 18;                       // dot diameter
const CENTER = 12;                    // hub diameter

const PHRASES = [
  'Gathering your crew…',
  'Plotting the days…',
  'Splitting it fair…',
  'Packing the snacks…',
];

export default function LoadingScreen({ onDone }) {
  const enter    = useRef(new Animated.Value(0)).current;  // cluster bloom (scale + opacity)
  const spin     = useRef(new Animated.Value(0)).current;  // continuous orbit
  const textOp   = useRef(new Animated.Value(0)).current;  // wordmark fade
  const textRise = useRef(new Animated.Value(12)).current; // wordmark rise
  const copyOp   = useRef(new Animated.Value(0)).current;  // microcopy crossfade
  const pulses   = useRef(DOT_COLORS.map(() => new Animated.Value(0))).current;
  const [phrase, setPhrase] = useState(0);

  useEffect(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }

    // Entrance: cluster blooms, wordmark rises, copy fades in.
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(240),
        Animated.parallel([
          Animated.timing(textOp, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(textRise, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
      Animated.timing(copyOp, { toValue: 1, duration: 360, delay: 460, useNativeDriver: true }),
    ]).start();

    // Continuous orbit + staggered pulse — keeps the screen alive for any load length.
    const orbit = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })
    );
    orbit.start();
    const pulseLoops = pulses.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 130),
        Animated.timing(v, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]))
    );
    pulseLoops.forEach((l) => l.start());

    // Cycle the microcopy with a quick crossfade.
    const interval = setInterval(() => {
      Animated.timing(copyOp, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setPhrase((p) => (p + 1) % PHRASES.length);
        Animated.timing(copyOp, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      });
    }, 1500);

    const t = setTimeout(() => { if (onDone) onDone(); }, HOLD_MS);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
      orbit.stop();
      pulseLoops.forEach((l) => l.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const bloom = enter.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <Animated.View style={[styles.field, { opacity: enter, transform: [{ scale: bloom }, { rotate }] }]}>
        {DOT_COLORS.map((c, i) => {
          const angle = (i / N) * 2 * Math.PI;
          const x = ORBIT * Math.cos(angle);
          const y = ORBIT * Math.sin(angle);
          const scale = pulses[i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] });
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: c, left: FIELD / 2 - DOT / 2 + x, top: FIELD / 2 - DOT / 2 + y, transform: [{ scale }] },
              ]}
            />
          );
        })}
        <View style={[styles.dot, styles.hub, { left: FIELD / 2 - CENTER / 2, top: FIELD / 2 - CENTER / 2 }]} />
      </Animated.View>

      <Animated.View style={[styles.textWrap, { opacity: textOp, transform: [{ translateY: textRise }] }]}>
        <Text style={styles.wordmark}>Kithova</Text>
      </Animated.View>

      <Animated.Text style={[styles.copy, { opacity: copyOp }]}>{PHRASES[phrase]}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  field: { width: FIELD, height: FIELD },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
  hub: { width: CENTER, height: CENTER, borderRadius: CENTER / 2, backgroundColor: colors.ink, opacity: 0.85 },
  textWrap: { alignItems: 'center' },
  wordmark: { marginTop: spacing.xl, fontSize: 34, fontWeight: '900', letterSpacing: -0.5, color: colors.ink },
  copy: { marginTop: spacing.sm, fontSize: 14, color: colors.subtle, letterSpacing: 0.2 },
});
