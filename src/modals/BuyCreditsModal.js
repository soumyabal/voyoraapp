import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { Badge } from '../components/ui';

const PACKS = [
  { id: 'starter',  label: 'Starter',  credits: 50,  priceStr: '₹199', popular: false, desc: 'Good for 1–2 AI trips' },
  { id: 'explorer', label: 'Explorer', credits: 150, priceStr: '₹499', popular: true,  desc: 'Best value — 3–5 AI trips' },
  { id: 'voyager',  label: 'Voyager',  credits: 400, priceStr: '₹999', popular: false, desc: 'Power user — 8+ AI trips' },
];

const HOW_ITEMS = [
  { label: 'Base cost', val: '20 credits' },
  { label: 'Per day planned', val: '+3 credits' },
  { label: 'Per traveler', val: '+2 credits' },
  { label: 'Accessibility needs', val: '+8 credits' },
  { label: 'Cost estimation', val: '+5 credits' },
];

const PackCard = ({ pack, selected, onSelect }) => (
  <TouchableOpacity
    style={[styles.packCard, selected && styles.packCardActive]}
    onPress={() => onSelect(pack.id)}
    activeOpacity={0.85}
  >
    {pack.popular && <Badge label="Most Popular" color="#fff" bgColor={colors.primary} style={styles.popularBadge} />}
    <View style={styles.packRow}>
      <View style={styles.packInfo}>
        <Text style={[styles.packLabel, selected && { color: colors.primary }]}>{pack.label}</Text>
        <Text style={styles.packDesc}>{pack.desc}</Text>
        <Text style={[styles.packCredits, selected && { color: colors.primary }]}>⚡ {pack.credits} credits</Text>
      </View>
      <View style={styles.priceCol}>
        <Text style={[styles.packPrice, selected && { color: colors.primary }]}>{pack.priceStr}</Text>
        <Text style={styles.priceSub}>one-time</Text>
      </View>
    </View>
  </TouchableOpacity>
);

export default function BuyCreditsModal({ visible, onClose }) {
  const { addCredits, account } = useStore();

  const [selectedPack, setSelectedPack] = useState('explorer');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClose = () => { setSelectedPack('explorer'); setLoading(false); setSuccess(false); onClose(); };

  const handlePurchase = async () => {
    const pack = PACKS.find(p => p.id === selectedPack);
    if (!pack) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    addCredits(pack.credits);
    setLoading(false);
    setSuccess(true);
    setTimeout(handleClose, 1800);
  };

  const pack = PACKS.find(p => p.id === selectedPack);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
          <Text style={styles.title}>Buy Credits</Text>
          <Badge label={`⚡ ${account.credits} left`} color="#9b6e00" bgColor={colors.yellowLight} />
        </View>

        {success ? (
          <View style={styles.successScreen}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>Credits Added!</Text>
            <Text style={styles.successSub}>+{pack?.credits} credits added to your account.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>

            <Text style={styles.sectionTitle}>Select a Pack</Text>
            {PACKS.map(p => (
              <PackCard key={p.id} pack={p} selected={selectedPack === p.id} onSelect={setSelectedPack} />
            ))}

            {/* How credits work */}
            <View style={styles.howCard}>
              <Text style={styles.howTitle}>⚡ How Credits Work</Text>
              {HOW_ITEMS.map(item => (
                <View key={item.label} style={styles.howRow}>
                  <Text style={styles.howLabel}>{item.label}</Text>
                  <Text style={styles.howVal}>{item.val}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.purchaseBtn, loading && { opacity: 0.7 }]}
              onPress={handlePurchase}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.purchaseBtnText}>Pay {pack?.priceStr} · Get {pack?.credits} Credits</Text>
              }
            </TouchableOpacity>

            <Text style={styles.disclaimer}>🔒 Payments are secure. Credits are non-refundable. This is a demo purchase.</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xxl, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeText: { fontSize: 18, color: colors.muted },
  title: { ...typography.h4, color: colors.text },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.lg },
  packCard: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.md, ...shadow.sm, overflow: 'hidden' },
  packCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  popularBadge: { position: 'absolute', top: 0, right: 0, borderRadius: 0, borderBottomLeftRadius: radius.sm },
  packRow: { flexDirection: 'row', alignItems: 'center' },
  packInfo: { flex: 1 },
  packLabel: { ...typography.h4, color: colors.text },
  packDesc: { ...typography.small, color: colors.muted, marginTop: 2 },
  packCredits: { ...typography.bodyBold, color: colors.text, marginTop: 8 },
  priceCol: { alignItems: 'flex-end' },
  packPrice: { fontSize: 22, fontWeight: '900', color: colors.text },
  priceSub: { ...typography.tiny, color: colors.muted },
  howCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, marginVertical: spacing.lg },
  howTitle: { ...typography.bodyBold, color: colors.text, marginBottom: spacing.md },
  howRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  howLabel: { ...typography.small, color: colors.muted },
  howVal: { ...typography.smallBold, color: colors.text },
  purchaseBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  purchaseBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disclaimer: { ...typography.tiny, color: colors.muted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  successEmoji: { fontSize: 64 },
  successTitle: { ...typography.h2, color: colors.text },
  successSub: { ...typography.body, color: colors.muted },
});
