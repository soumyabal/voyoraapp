/**
 * ConfettiBurst — a one-shot celebration overlay for an EARNED moment (e.g. Trip Check turning
 * all-green). Renders only while celebrating; mount it conditionally and let onDone unmount it.
 *
 * Pure React Native Animated (useNativeDriver) + a success haptic — NO reanimated worklets, so
 * it's safe in Expo Go. Brand-coloured confetti bursts from centre and fades, with a short
 * "Trip's all set!" pill, then calls onDone (~1.6s) so the parent can clear it.
 */
/* eslint-disable react-hooks/purity, react-hooks/refs -- intentional RN Animated pattern:
   randomized confetti precomputed in a ref + interpolated in render (same as LoadingScreen). */
import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { markColors, colors, radius, spacing, typography } from '../../theme';

const N = 20;
const rand = (a, b) => a + Math.random() * (b - a);

export default function ConfettiBurst({ onDone, message = '🎉 Trip’s all set!' }) {
  const pieces = useRef(
    Array.from({ length: N }, (_, i) => ({
      v: new Animated.Value(0),
      angle: (i / N) * 2 * Math.PI + rand(-0.25, 0.25),
      dist: rand(90, 180),
      size: rand(7, 13),
      color: markColors[i % markColors.length],
      spin: (Math.random() < 0.5 ? -1 : 1) * rand(160, 380),
      delay: rand(0, 120),
    })),
  ).current;
  const label = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* optional */ }
    const burst = Animated.stagger(14, pieces.map((p) =>
      Animated.timing(p.v, { toValue: 1, duration: 1100, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ));
    const pill = Animated.sequence([
      Animated.spring(label, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.delay(950),
      Animated.timing(label, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    Animated.parallel([burst, pill]).start(() => onDone && onDone());
    return () => { burst.stop(); pill.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View pointerEvents="none" style={styles.layer}>
      <View style={styles.center}>
        {pieces.map((p, i) => {
          const tx = p.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] });
          const ty = p.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist] });
          const op = p.v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
          const rot = p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
          return (
            <Animated.View key={i} style={{
              position: 'absolute', width: p.size, height: p.size, borderRadius: 2,
              backgroundColor: p.color, opacity: op,
              transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }],
            }} />
          );
        })}
        <Animated.View style={[styles.pill, {
          opacity: label,
          transform: [{ scale: label.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
        }]}>
          <Text style={styles.pillText}>{message}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pill: {
    backgroundColor: colors.success, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  pillText: { ...typography.bodyBold, color: '#fff', fontSize: 15 },
});
