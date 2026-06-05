/**
 * KithovaWordmark — the ONE canonical wordmark, used wherever "Kithova" appears so the
 * brand reads the same on every surface (splash, header, future share artifacts).
 *
 * Two-tone: "Kith" (your people) is the warm tone, "ova" the neutral — and the warm tone
 * never sits on a warm background, so it stays legible on both cream and the dark hero:
 *   onLight (cream): Kith = terracotta, ova = ink
 *   onDark  (hero):  Kith = white,      ova = terracotta
 *
 * Nested <Text> keeps a single text layout pass (kerning + letterSpacing preserved) — do
 * NOT switch to a row of separate <Text>, which breaks kerning/baseline.
 */
import React from 'react';
import { Text } from 'react-native';
import { colors } from '../../theme';

const VARIANTS = {
  onLight: { kith: colors.accent, ova: colors.ink },
  onDark:  { kith: colors.white,  ova: colors.accent },
};

export default function KithovaWordmark({ variant = 'onLight', size = 32, style }) {
  const v = VARIANTS[variant] || VARIANTS.onLight;
  return (
    <Text
      allowFontScaling={false}
      accessibilityRole="header"
      accessibilityLabel="Kithova"
      style={[{ fontSize: size, fontWeight: '900', letterSpacing: -0.5 }, style]}
    >
      <Text style={{ color: v.kith }}>Kith</Text>
      <Text style={{ color: v.ova }}>ova</Text>
    </Text>
  );
}
