/**
 * Snackbar — bottom toast with an optional action (e.g. Undo).
 *
 * Presentational + self-animating (springs up on mount). The parent owns
 * visibility and the auto-dismiss timer; remount with a new `key` to replay
 * the entrance when a fresh message replaces an existing one.
 *
 *   {snack && (
 *     <Snackbar key={snack.nonce} message={snack.message} icon={snack.icon}
 *       actionLabel="Undo" onAction={undo} bottom={88} />
 *   )}
 */
/* eslint-disable react-hooks/refs -- RN animation idiom: Animated.Value in a useRef, read
   during render (stable identity, effect-free). Compiler off → false positive. */
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography, shadow } from '../../theme';
import Icon from './Icon';
import { tapLight } from '../../utils/feedback';

export default function Snackbar({ message, icon, actionLabel = 'Undo', onAction, bottom = 24 }) {
  // Start fully visible (slightly offset) and spring up — no opacity fade, so
  // the toast can never get stuck invisible if the driver hiccups.
  const y = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
  }, []);

  return (
    <Animated.View
      style={[styles.wrap, { bottom, transform: [{ translateY: y }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {!!icon && <Icon name={icon} size={18} color="#fff" />}
        <Text style={styles.msg} numberOfLines={1}>{message}</Text>
        {!!onAction && (
          <TouchableOpacity
            style={styles.action}
            onPress={() => { tapLight(); onAction(); }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Icon name="back" size={14} color={colors.accentSoft} />
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: 10,
    maxWidth: 460, alignSelf: 'stretch', ...shadow.lg,
  },
  msg: { ...typography.bodyBold, color: '#fff', flex: 1 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
