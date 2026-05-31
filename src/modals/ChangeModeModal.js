import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { BYPASS_SUBSCRIPTION, PRO_MONTHLY_PRICE } from '../config';

const MODES = [
  { key: 'manual', icon: '✍️', label: 'Plan Manually',    desc: 'Build and edit your itinerary yourself',            color: colors.primary },
  { key: 'ai',     icon: '🤖', label: 'Plan with AI',     desc: 'Generate a smart AI itinerary for this trip',       color: colors.ai },
  { key: 'expert', icon: '🧳', label: 'Plan with Expert', desc: 'A travel consultant will design your trip for you',  color: colors.expert },
];

export default function ChangeModeModal({ visible, trip, onClose }) {
  const { account, updateTrip, injectAIActivities, useAIPlannerCredit, upgradeToPro } = useStore();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(null);

  if (!trip) return null;

  const isPro = BYPASS_SUBSCRIPTION || account.plan === 'pro';
  const canUseAIPlanner = isPro || !account.aiPlannerUsed;

  const handleClose = () => { setSelected(null); onClose(); };

  const handleSelect = (key) => {
    if (key === trip.mode) return;
    if (key === 'ai' && !account.loggedIn) {
      showToast('Sign in to use AI planning', '⚠️'); return;
    }
    setSelected(key);
  };

  const handleConfirm = () => {
    if (!selected || selected === trip.mode) return;

    if (selected === 'ai') {
      if (!canUseAIPlanner) {
        showToast('Upgrade to Pro for unlimited AI planning', '🔒'); return;
      }
      useAIPlannerCredit();
      updateTrip(trip.id, { mode: 'ai' });
      injectAIActivities(trip.id);
      showToast('AI itinerary generated! 🤖', '✅');
      handleClose();
      return;
    }

    updateTrip(trip.id, { mode: selected });
    showToast(
      selected === 'expert'
        ? 'Expert mode on — consultant will be in touch within 24 hrs 🧳'
        : 'Switched to manual planning ✍️',
      '✅',
    );
    handleClose();
  };

  const confirmDisabled = !selected || selected === trip.mode;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[st.container, { paddingTop: insets.top }]}>

        <View style={st.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={st.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={st.title}>Switch Planning Mode</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={confirmDisabled}>
            <Text style={[st.confirmText, confirmDisabled && st.confirmDisabled]}>Confirm</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={st.hint}>
            Current mode: {trip.mode === 'ai' ? '🤖 AI Planned' : trip.mode === 'expert' ? '🧳 Expert' : '✍️ Manual'}
          </Text>

          {MODES.map(m => {
            const active = selected === m.key;
            const isCurrent = trip.mode === m.key;
            const blocked = m.key === 'ai' && !canUseAIPlanner && account.loggedIn;
            return (
              <TouchableOpacity
                key={m.key}
                style={[
                  st.modeCard,
                  active && { borderColor: m.color, backgroundColor: m.color + '12' },
                  isCurrent && st.modeCardCurrent,
                ]}
                onPress={() => handleSelect(m.key)}
                disabled={isCurrent}
                activeOpacity={0.75}
              >
                <View style={[st.iconWrap, active && { backgroundColor: m.color + '22' }]}>
                  <Text style={st.icon}>{m.icon}</Text>
                </View>
                <View style={st.modeText}>
                  <View style={st.modeLabelRow}>
                    <Text style={[st.modeLabel, active && { color: m.color }]}>{m.label}</Text>
                    {isCurrent && (
                      <View style={st.currentBadge}>
                        <Text style={st.currentBadgeText}>Current</Text>
                      </View>
                    )}
                    {blocked && (
                      <View style={[st.currentBadge, { backgroundColor: '#e1705522' }]}>
                        <Text style={[st.currentBadgeText, { color: '#e17055' }]}>Upgrade required</Text>
                      </View>
                    )}
                  </View>
                  <Text style={st.modeDesc}>{m.desc}</Text>
                  {m.key === 'ai' && account.loggedIn && (
                    <Text style={[st.quotaHint, { color: canUseAIPlanner ? colors.green : '#e17055' }]}>
                      {isPro ? '✅ Pro — unlimited AI plans' : canUseAIPlanner ? '🎁 1 free AI plan available' : '🔒 Free plan used — upgrade to Pro'}
                    </Text>
                  )}
                </View>
                <View style={[st.radio, active && { borderColor: m.color }]}>
                  {active && <View style={[st.radioDot, { backgroundColor: m.color }]} />}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Upgrade panel — shown when AI selected but quota exhausted */}
          {selected === 'ai' && !canUseAIPlanner && (
            <View style={st.upgradePanel}>
              <Text style={st.upgradeTitle}>🚀 Upgrade to Voyara Pro</Text>
              <Text style={st.upgradeSub}>
                Unlimited AI trip plans · Unlimited AI trip reviews · {PRO_MONTHLY_PRICE}/month · Cancel anytime
              </Text>
              <TouchableOpacity
                style={st.upgradeBtn}
                onPress={() => { upgradeToPro(); showToast('Upgraded to Pro! 🎉', '✅'); handleClose(); }}
              >
                <Text style={st.upgradeBtnText}>Upgrade to Pro — {PRO_MONTHLY_PRICE}/mo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelected('manual')} style={{ marginTop: 10, alignItems: 'center' }}>
                <Text style={st.cancelBuyText}>Switch to Manual instead</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancelText: { ...typography.bodyBold, color: colors.muted, flex: 1 },
  title: { ...typography.h4, color: colors.text, flex: 2, textAlign: 'center' },
  confirmText: { ...typography.bodyBold, color: colors.primary, flex: 1, textAlign: 'right' },
  confirmDisabled: { color: colors.muted },

  content: { padding: spacing.xxl },
  hint: { ...typography.small, color: colors.muted, marginBottom: spacing.lg },

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
  quotaHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },

  upgradePanel: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.ai, backgroundColor: colors.aiLight, padding: spacing.xl, alignItems: 'center' },
  upgradeTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 6 },
  upgradeSub: { ...typography.small, color: colors.muted, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 18 },
  upgradeBtn: { backgroundColor: colors.ai, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12 },
  upgradeBtnText: { color: '#fff', fontWeight: '700' },
  cancelBuyText: { ...typography.smallBold, color: colors.muted },
});
