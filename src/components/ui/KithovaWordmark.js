/**
 * KithovaWordmark — the ONE canonical wordmark, used wherever "Kithova" appears so the
 * brand reads the same on every surface (splash, header, future share artifacts).
 *
 * Two-tone: "Kith" (your people) is ALWAYS the warm terracotta tone — consistent everywhere,
 * so the brand reads the same on the splash and the header — and "ova" is the neutral that
 * flips with the background so the pair stays legible:
 *   onLight (cream): Kith = terracotta, ova = ink
 *   onDark  (hero):  Kith = terracotta, ova = white
 * (The dark hero's wordmark sits in its dark top-left corner, so terracotta stays legible.)
 *
 * Nested <Text> keeps a single text layout pass (kerning + letterSpacing preserved) — do
 * NOT switch to a row of separate <Text>, which breaks kerning/baseline.
 */
import React from 'react';
import { Text } from 'react-native';
import { colors } from '../../theme';

const VARIANTS = {
  onLight: { kith: colors.accent, ova: colors.ink },
  onDark:  { kith: colors.accent, ova: colors.white },
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
