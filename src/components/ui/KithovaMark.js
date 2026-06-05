/**
 * KithovaMark — the static "kith" constellation logomark: family-colored dots around a hub
 * (your people, together). The resting form of the splash animation, reusable in headers and
 * as the brief for the real app icon. Pure positioned <View>s — cheap, no deps, no animation.
 *
 * hub defaults to ink (for light backgrounds); pass hub={colors.white} on a dark header.
 */
import React from 'react';
import { View } from 'react-native';
import { colors, markColors } from '../../theme';

export default function KithovaMark({ size = 22, hub = colors.ink }) {
  const r = size * 0.34;
  const dot = Math.max(4, Math.round(size * 0.2));
  const hubD = Math.max(3, Math.round(size * 0.18));
  return (
    <View style={{ width: size, height: size }}>
      {markColors.map((c, i) => {
        const a = (i / markColors.length) * 2 * Math.PI - Math.PI / 2; // start at top
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: c,
              left: size / 2 - dot / 2 + r * Math.cos(a),
              top: size / 2 - dot / 2 + r * Math.sin(a),
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          width: hubD,
          height: hubD,
          borderRadius: hubD / 2,
          backgroundColor: hub,
          left: size / 2 - hubD / 2,
          top: size / 2 - hubD / 2,
        }}
      />
    </View>
  );
}
