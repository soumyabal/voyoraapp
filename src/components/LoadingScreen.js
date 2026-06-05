/**
 * LoadingScreen.js — the branded launch screen.
 *
 * A little CELEBRATION that completes and calms: on launch, a one-shot confetti puff of
 * brand-colored circles bursts from the center (with a light haptic) and fades — then the
 * familiar "kith" constellation (family-colored dots orbiting a hub) keeps the screen alive
 * while the wordmark "Kithova" reveals in a terracotta→indigo→green gradient and microcopy
 * cycles. Reveals the app after HOLD_MS.
 *
 * Built for Expo Go: no native gradient-text (SVG/masked-view unavailable) — the wordmark
 * "gradient" is per-letter nested <Text> colors (kerning preserved). All animation is
 * native-driver (transform/opacity only); colors are static (animating color drops to the
 * JS thread and stutters). Theme-token driven, no new deps. Swap in a designer's logo later.
 *
 * Panel note: the BIG celebration is best earned — a confetti moment on "trip settled /
 * trip complete" INSIDE the app — this launch version is deliberately one-shot + restrained.
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
const CONFETTI = 14;                  // one-shot burst particle count

// Wordmark gradient: a terracotta→indigo arc landing on green (brand anchors + smooth
// bridges), NOT a rainbow. Indigo lands on the round "o". Static (never animated).
const RAMP = [colors.accent, '#d65f33', '#bf6b6f', '#9a66b0', colors.smart, '#3f8a8e', colors.success];
const WORD = 'Kithova';

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
  // One-shot confetti — angle/distance/size/spin precomputed once so it's stable across renders.
  const confetti = useRef(
    Array.from({ length: CONFETTI }, (_, i) => ({
      v: new Animated.Value(0),
      angle: (i / CONFETTI) * 2 * Math.PI + (Math.random() - 0.5) * 0.5,
      dist: 64 + Math.random() * 64,
      size: 6 + Math.random() * 6,
      color: DOT_COLORS[i % N],
      spin: (Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 200),
      delay: Math.random() * 90,
    }))
  ).current;
  const [phrase, setPhrase] = useState(0);

  useEffect(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }

    // One-shot celebration burst (fires once, settles — never loops).
    const burst = Animated.stagger(
      18,
      confetti.map((p) =>
        Animated.timing(p.v, { toValue: 1, duration: 900, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true })
      )
    );
    burst.start();

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
      burst.stop();
      orbit.stop();
      pulseLoops.forEach((l) => l.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const bloom = enter.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.cluster}>
        {/* one-shot confetti burst, emitted from center, behind the constellation */}
        <View pointerEvents="none" style={styles.burstLayer}>
          {confetti.map((p, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: FIELD / 2 - p.size / 2,
                top: FIELD / 2 - p.size / 2,
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                backgroundColor: p.color,
                opacity: p.v.interpolate({ inputRange: [0, 0.12, 0.65, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] }) },
                  { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist + 26] }) },
                  { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
                  { scale: p.v.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 1, 0.85] }) },
                ],
              }}
            />
          ))}
        </View>

        {/* the kith constellation */}
        <Animated.View style={[styles.field, { opacity: enter, transform: [{ scale: bloom }, { rotate }] }]}>
          {DOT_COLORS.map((c, i) => {
            const angle = (i / N) * 2 * Math.PI;
            const x = ORBIT * Math.cos(angle);
            const y = ORBIT * Math.sin(angle);
            const scale = pulses[i].interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { backgroundColor: c, left: FIELD / 2 - DOT / 2 + x, top: FIELD / 2 - DOT / 2 + y, transform: [{ scale }] }]}
              />
            );
          })}
          <View style={[styles.dot, styles.hub, { left: FIELD / 2 - CENTER / 2, top: FIELD / 2 - CENTER / 2 }]} />
        </Animated.View>
      </View>

      <Animated.View style={[styles.textWrap, { opacity: textOp, transform: [{ translateY: textRise }] }]}>
        <Text style={styles.wordmark} allowFontScaling={false}>
          {WORD.split('').map((ch, i) => (
            <Text key={i} style={{ color: RAMP[i] }}>{ch}</Text>
          ))}
        </Text>
      </Animated.View>

      <Animated.Text style={[styles.copy, { opacity: copyOp }]}>{PHRASES[phrase]}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  cluster: { width: FIELD, height: FIELD, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  burstLayer: { position: 'absolute', width: FIELD, height: FIELD, overflow: 'visible' },
  field: { width: FIELD, height: FIELD },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
  hub: { width: CENTER, height: CENTER, borderRadius: CENTER / 2, backgroundColor: colors.ink, opacity: 0.85 },
  textWrap: { alignItems: 'center' },
  wordmark: { marginTop: spacing.xl, fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  copy: { marginTop: spacing.sm, fontSize: 14, color: colors.subtle, letterSpacing: 0.2 },
});
