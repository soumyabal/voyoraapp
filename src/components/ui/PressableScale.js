/**
 * PressableScale — a Pressable that springs down slightly on press.
 *
 * The small scale + optional haptic gives touchable surfaces (cards, CTAs)
 * a tactile, "modern app" feel. Uses the RN Animated API on the native
 * driver — no reanimated dependency, runs at 60fps off the JS thread.
 *
 *   <PressableScale style={styles.card} onPress={open} haptic="light">…</PressableScale>
 */
/* eslint-disable react-hooks/refs -- RN animation idiom: Animated.Value in a useRef, read
   during render (stable identity, effect-free). Compiler off → false positive. */
import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import { tapLight, tapMedium, select } from '../../utils/feedback';

const HAPTICS = { light: tapLight, medium: tapMedium, select };

export default function PressableScale({
  children, onPress, style, scaleTo = 0.97, haptic, disabled, ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      onPress={(e) => { if (haptic && HAPTICS[haptic]) HAPTICS[haptic](); onPress && onPress(e); }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
