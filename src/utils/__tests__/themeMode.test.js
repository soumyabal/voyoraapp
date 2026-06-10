/**
 * themeMode.test.js — the pure light/dark resolution for the new-shell theme.
 */
import { resolveTheme, isThemeMode, THEME_MODES } from '../themeMode';

describe('resolveTheme', () => {
  test('explicit light/dark wins regardless of OS scheme', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('light', 'light')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('dark', 'dark')).toBe('dark');
  });

  test('system follows the OS scheme', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  test('system defaults to light when the OS scheme is unknown (null/undefined)', () => {
    expect(resolveTheme('system', null)).toBe('light');
    expect(resolveTheme('system', undefined)).toBe('light');
  });

  test('an unknown mode is treated as system (follows OS, default light)', () => {
    expect(resolveTheme('bogus', 'dark')).toBe('dark');
    expect(resolveTheme(undefined, null)).toBe('light');
  });
});

describe('isThemeMode / THEME_MODES', () => {
  test('THEME_MODES is exactly the three supported modes', () => {
    expect(THEME_MODES).toEqual(['system', 'light', 'dark']);
  });

  test('isThemeMode guards persisted values', () => {
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(isThemeMode('Dark')).toBe(false);
  });
});
