import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { calcCreditEstimate } from '../utils/helpers';

const MODES = [
  { key: 'manual', icon: '✍️', label: 'Plan Manually',    desc: 'Build and edit your itinerary yourself',           color: colors.primary },
  { key: 'ai',     icon: '🤖', label: 'Plan with AI',     desc: 'Generate a smart itinerary — uses AI credits',     color: colors.ai },
  { key: 'expert', icon: '🧳', label: 'Plan with Expert', desc: 'A travel consultant will design your trip for you', color: colors.expert },
];

const CREDIT_PACKS = [
  { credits: 100,  price: '$0.99' },
  { credits: 500,  price: '$3.99', best: true },
  { credits: 1000, price: '$6.99' },
];

export default function ChangeModeModal({ visible, trip, onClose }) {
  const { account, updateTrip, injectAIActivities, deductCredits, addCredits } = useStore();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(null);
  const [showBuy, setShowBuy] = useState(false);

  if (!trip) return null;

  // Credit estimate for this trip based on existing travelers
  const days = Math.max(
    Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / (1000 * 60 * 60 * 24)) + 1,
    1,
  );
  const allMembers = trip.families.flatMap(f => f.members);
  const adults = Math.max(allMembers.filter(m => m.type !== 'child').length, 1);
  const children = allMembers.filter(m => m.type === 'child').length;
  const needsCount = allMembers.filter(m => m.needs?.length > 0).length;
  const creditEst = calcCreditEstimate(days, adults, children, needsCount);
  const hasEnough = account.credits >= creditEst.total;
  const shortfall = creditEst.total - account.credits;

  const handleClose = () => { setSelected(null); setShowBuy(false); onClose(); };

  const handleSelect = (key) => {
    if (key === trip.mode) return;
    if (key === 'ai' && !account.loggedIn) {
      showToast('Sign in to use AI planning', '⚠️'); return;
    }
    setSelected(key);
    setShowBuy(false);
  };

  const handleConfirm = () => {
    if (!selected || selected === trip.mode) return;

    if (selected === 'ai') {
      if (!hasEnough) { setShowBuy(true); return; }
      deductCredits(creditEst.total);
      updateTrip(trip.id, { mode: 'ai' });
      injectAIActivities(trip.id);
      showToast('AI itinerary generated! 🤖', '✅');
      handleClose();
      return;
    }

    updateTrip(trip.id, { mode: selected });
    showToast(
      selected === 'expert'
        ? 'Expert mode on — consultant will be in touch within 24hrs 🧳'
        : 'Switched to manual planning ✍️',
      '✅',
    );
    handleClose();
  };

  const confirmLabel = selected === 'ai' && !hasEnough && !showBuy ? 'Next →' : 'Confirm';
  const confirmDisabled = !selected || selected === trip.mode;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Switch Planning Mode</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={confirmDisabled}>
            <Text style={[styles.confirmText, confirmDisabled && styles.confirmDisabled]}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>

          <Text style={styles.hint}>
            Current mode: {trip.mode === 'ai' ? '🤖 AI Planned' : trip.mode === 'expert' ? '🧳 Expert' : '✍️ Manual'}
          </Text>

          {/* Mode cards */}
          {MODES.map(m => {
            const active = selected === m.key;
            const isCurrent = trip.mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.modeCard,
                  active && { borderColor: m.color, backgroundColor: m.color + '12' },
                  isCurrent && styles.modeCardCurrent,
                ]}
                onPress={() => handleSelect(m.key)}
                disabled={isCurrent}
                activeOpacity={0.75}
              >
                <View style={[styles.iconWrap, active && { backgroundColor: m.color + '22' }]}>
                  <Text style={styles.icon}>{m.icon}</Text>
                </View>
                <View style={styles.modeText}>
                  <View style={styles.modeLabelRow}>
                    <Text style={[styles.modeLabel, active && { color: m.color }]}>{m.label}</Text>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.modeDesc}>{m.desc}</Text>
                  {m.key === 'ai' && (
                    <Text style={[styles.creditHint, { color: hasEnough ? colors.green : colors.red }]}>
                      {hasEnough
                        ? `✓ ${creditEst.total} credits (you have ${account.credits})`
                        : `⚠️ Needs ${creditEst.total} cr — you have ${account.credits}`}
                    </Text>
                  )}
                </View>
                <View style={[styles.radio, active && { borderColor: m.color }]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: m.color }]} />}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Buy credits panel */}
          {showBuy && selected === 'ai' && (
            <View style={styles.buyPanel}>
              <Text style={styles.buyTitle}>Top up to switch to AI planning</Text>
              <Text style={styles.buySubtitle}>You need {shortfall} more credits for this trip</Text>

              {CREDIT_PACKS.map(pack => {
                const covers = account.credits + pack.credits >= creditEst.total;
                return (
                  <TouchableOpacity
                    key={pack.credits}
                    style={[styles.packRow, pack.best && styles.packRowBest]}
                    onPress={() => {
                      addCredits(pack.credits);
                      showToast(`${pack.credits} credits added!`, '💳');
                      if (covers) setShowBuy(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.packLeft}>
                      {pack.best && (
                        <View style={styles.bestBadge}>
                          <Text style={styles.bestBadgeText}>⭐ Best Value</Text>
                        </View>
                      )}
                      <Text style={[styles.packCredits, pack.best && { color: colors.primary }]}>
                        {pack.credits} credits
                      </Text>
                      <Text style={styles.packCovers}>
                        {covers ? '✓ Covers this trip' : `${account.credits + pack.credits} total after`}
                      </Text>
                    </View>
                    <View style={[styles.packPriceBtn, pack.best && styles.packPriceBtnBest]}>
                      <Text style={[styles.packPrice, pack.best && { color: '#fff' }]}>{pack.price}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity onPress={() => { setShowBuy(false); setSelected(null); }} style={styles.cancelBuy}>
                <Text style={styles.cancelBuyText}>Switch to Manual mode instead</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancelText: { ...typography.bodyBold, color: colors.muted, flex: 1 },
  title: { ...typography.h4, color: colors.text, flex: 2, textAlign: 'center' },
  confirmText: { ...typography.bodyBold, color: colors.primary, flex: 1, textAlign: 'right' },
  confirmDisabled: { color: colors.muted },

  content: { padding: spacing.xxl },
  hint: { ...typography.small, color: colors.muted, marginBottom: spacing.lg },

  // Mode cards
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  modeCardCurrent: { opacity: 0.6 },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  icon: { fontSize: 26 },
  modeText: { flex: 1 },
  modeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  modeLabel: { ...typography.bodyBold, color: colors.text },
  currentBadge: { backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  currentBadgeText: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  modeDesc: { ...typography.small, color: colors.muted },
  creditHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },

  // Buy panel
  buyPanel: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  buyTitle: { ...typography.bodyBold, color: colors.text, padding: spacing.lg, paddingBottom: 4 },
  buySubtitle: { ...typography.small, color: colors.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  packRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  packRowBest: { backgroundColor: colors.primaryLight + '18' },
  packLeft: { flex: 1 },
  bestBadge: { alignSelf: 'flex-start', backgroundColor: colors.yellow + '33', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  bestBadgeText: { fontSize: 10, fontWeight: '700', color: colors.yellow },
  packCredits: { ...typography.bodyBold, color: colors.text },
  packCovers: { fontSize: 11, fontWeight: '600', color: colors.green, marginTop: 2 },
  packPriceBtn: { backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  packPriceBtnBest: { backgroundColor: colors.primary, borderColor: colors.primary },
  packPrice: { ...typography.bodyBold, color: colors.text },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.small, color: colors.muted },

  cancelBuy: { padding: spacing.lg, alignItems: 'center' },
  cancelBuyText: { ...typography.bodyBold, color: colors.primary },
});
