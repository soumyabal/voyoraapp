import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { avatarColor } from '../../utils/helpers';

/**
 * Avatar
 * Circular badge showing a person's initial, coloured by name hash.
 *
 * Props:
 *   name    string   — used to derive colour and initial
 *   size    number   — diameter in px (default 36)
 *   color   string   — override auto colour
 *   style   object   — extra styles on the circle
 */
export default function Avatar({ name = '?', size = 36, color, style }) {
  const bg = color || avatarColor(name);
  const fontSize = Math.round(size * 0.38);

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }, style]}>
      <Text style={[styles.initial, { fontSize }]}>{name[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '700' },
});
