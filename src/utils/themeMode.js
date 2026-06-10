/**
 * themeMode.js — pure theme-mode resolution for the new shell's light/dark palette.
 *
 * Kept RN/React-free so it's unit-testable in isolation (the provider in src/shellTheme.js wires it
 * to useColorScheme + AsyncStorage). `mode` is the user's choice (System/Light/Dark); `sys` is the
 * OS scheme ('light' | 'dark' | null). resolveTheme collapses the two into the palette to render.
 */
export const THEME_MODES = ['system', 'light', 'dark'];

export const isThemeMode = (m) => THEME_MODES.includes(m);

// 'light' | 'dark' explicit wins; 'system' (or any unknown) follows the OS, defaulting to light.
export function resolveTheme(mode, sys) {
  if (mode === 'light' || mode === 'dark') return mode;
  return sys === 'dark' ? 'dark' : 'light';
}
