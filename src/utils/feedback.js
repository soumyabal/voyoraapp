/**
 * feedback.js — tiny haptic helpers.
 *
 * Always fire-and-forget (haptics can reject on web / unsupported devices,
 * so every call swallows errors). Use sparingly: confirmations, selections,
 * and primary actions — not on every tap.
 */
import * as Haptics from 'expo-haptics';

export const tapLight  = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const tapMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
export const select    = () => Haptics.selectionAsync().catch(() => {});
export const success    = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const warn       = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
