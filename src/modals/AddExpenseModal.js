import React, { useState, useMemo } from 'react';
import { Modal, View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Switch, Text, TouchableOpacity } from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { uid, CATEGORY_OPTIONS, getAllMembers, avatarColor } from '../utils/helpers';
import { ModalHeader, FormField, Avatar, FamilyRow } from '../components/ui';

export default function AddExpenseModal({ visible, trip, onClose }) {
  const { addExpense } = useStore();
  const tripMode = trip.splitMode || 'individual';
  const allMembers = getAllMembers(trip);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('🎯');
  const [paidById, setPaidById] = useState(allMembers[0]?.id || '');
  const [splitMode, setSplitMode] = useState(null); // null = inherit trip

  // Family participation (for both modes)
  const [participatingFamilyIds, setParticipatingFamilyIds] = useState(
    trip.families.map(f => f.id)
  );

  // Individual participation (individual mode only; null = all in participating families)
  const [participatingMemberIds, setParticipatingMemberIds] = useState(null);

  const effectiveMode = splitMode || tripMode;

  const reset = () => {
    setName(''); setAmount(''); setCategory('🎯'); setSplitMode(null);
    setPaidById(allMembers[0]?.id || '');
    setParticipatingFamilyIds(trip.families.map(f => f.id));
    setParticipatingMemberIds(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Participant helpers ──────────────────────────────────────────

  const toggleFamily = (famId) => {
    setParticipatingFamilyIds(prev => {
      if (prev.includes(famId)) return prev.length === 1 ? prev : prev.filter(id => id !== famId);
      return [...prev, famId];
    });
    // When a family is excluded in individual mode, also remove its members
    if (effectiveMode === 'individual') {
      const fam = trip.families.find(f => f.id === famId);
      if (fam && participatingFamilyIds.includes(famId)) {
        const famMemberIds = fam.members.map(m => m.id);
        setParticipatingMemberIds(prev => {
          const base = prev ?? allMembers.map(m => m.id);
          return base.filter(id => !famMemberIds.includes(id)).length
            ? base.filter(id => !famMemberIds.includes(id))
            : base;
        });
      }
    }
  };

  const toggleMember = (memberId, fam) => {
    const allFamIds = allMembers.map(m => m.id);
    const base = participatingMemberIds ?? allFamIds;
    const next = base.includes(memberId)
      ? (base.length === 1 ? base : base.filter(id => id !== memberId))
      : [...base, memberId];
    setParticipatingMemberIds(next);
  };

  const toggleAllFamMembers = (fam, addAll) => {
    const allFamIds = allMembers.map(m => m.id);
    const base = participatingMemberIds ?? allFamIds;
    const famMemberIds = fam.members.map(m => m.id);
    const next = addAll
      ? [...new Set([...base, ...famMemberIds])]
      : base.filter(id => !famMemberIds.includes(id));
    setParticipatingMemberIds(next.length ? next : base);
  };

  const handlePayerChange = (memberId) => {
    setPaidById(memberId);
    // Auto-include payer's family
    const payerFamily = trip.families.find(f => f.members.some(m => m.id === memberId));
    if (payerFamily && !participatingFamilyIds.includes(payerFamily.id)) {
      setParticipatingFamilyIds(prev => [...prev, payerFamily.id]);
    }
    // Auto-include payer member in individual mode
    if (effectiveMode === 'individual') {
      const allFamIds = allMembers.map(m => m.id);
      const base = participatingMemberIds ?? allFamIds;
      if (!base.includes(memberId)) {
        setParticipatingMemberIds([...base, memberId]);
      }
    }
  };

  // ── Share calculations ───────────────────────────────────────────

  const partFamilies = trip.families.filter(f => participatingFamilyIds.includes(f.id));
  const partMembers = useMemo(() => {
    if (effectiveMode === 'individual' && participatingMemberIds != null) {
      return partFamilies.flatMap(f => f.members).filter(m => participatingMemberIds.includes(m.id));
    }
    return partFamilies.flatMap(f => f.members);
  }, [effectiveMode, partFamilies, participatingMemberIds]);

  const totalAmt = parseFloat(amount) || 0;
  const sharePerFamily = partFamilies.length > 0 && totalAmt > 0
    ? (totalAmt / partFamilies.length) : 0;
  const sharePerPerson = partMembers.length > 0 && totalAmt > 0
    ? (totalAmt / partMembers.length) : 0;

  const handleAdd = () => {
    if (!name.trim() || !amount || totalAmt <= 0) return;
    addExpense(trip.id, {
      id: uid(),
      name: name.trim(),
      amount: totalAmt,
      category,
      paidBy: paidById,
      splitMode,
      participatingFamilies: participatingFamilyIds,
      participatingMembers: effectiveMode === 'individual' ? participatingMemberIds : null,
      source: 'manual',
      date: new Date().toISOString().split('T')[0],
    });
    handleClose();
  };

  const canAdd = name.trim() && totalAmt > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <ModalHeader
            title="Add Expense"
            onClose={handleClose}
            onAction={handleAdd}
            actionDisabled={!canAdd}
          />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            <FormField label="Description *" value={name} onChangeText={setName} placeholder="e.g. Dinner at Jimbaran" autoFocus />
            <FormField
              label="Total Amount *"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              inputStyle={styles.amountInput}
            />

            {/* Category */}
            <Text style={styles.sectionLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={styles.chipRow}>
                {CATEGORY_OPTIONS.map(c => (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.catChip, category === c.value && styles.catChipActive]}
                    onPress={() => setCategory(c.value)}
                  >
                    <Text style={styles.catChipText}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Split mode override */}
            <Text style={styles.sectionLabel}>SPLIT MODE</Text>
            <View style={styles.overrideRow}>
              {[
                { key: null,         label: `Auto (${tripMode === 'family' ? 'By Group' : 'By Person'})` },
                { key: 'individual', label: '👤 By Person' },
                { key: 'family',     label: '👨‍👩‍👧 By Group' },
              ].map(opt => (
                <TouchableOpacity
                  key={String(opt.key)}
                  style={[styles.overrideChip, splitMode === opt.key && styles.overrideChipActive]}
                  onPress={() => setSplitMode(opt.key)}
                >
                  <Text style={[styles.overrideChipText, splitMode === opt.key && styles.overrideChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Paid by */}
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>PAID BY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <View style={styles.chipRow}>
                {trip.families.map(fam =>
                  fam.members.map(m => {
                    const active = paidById === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.payerChip, active && { borderColor: fam.color, backgroundColor: fam.color + '18' }]}
                        onPress={() => handlePayerChange(m.id)}
                      >
                        <Avatar name={m.name} size={24} />
                        <View>
                          <Text style={[styles.payerName, active && { color: fam.color }]}>{m.name.split(' ')[0]}</Text>
                          <Text style={styles.payerFam}>{fam.name.split(' ')[0]}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>

            {/* Split between */}
            <Text style={styles.sectionLabel}>SPLIT BETWEEN</Text>

            {effectiveMode === 'family' ? (
              // ── Family mode: toggle families ──
              <View style={styles.splitCard}>
                {trip.families.map((fam, i) => {
                  const included = participatingFamilyIds.includes(fam.id);
                  const share = included && sharePerFamily > 0 ? `$${sharePerFamily.toFixed(2)}` : null;
                  const subtitle = `${fam.members.length} member${fam.members.length !== 1 ? 's' : ''}${share ? `  ·  ${share}/group` : ''}`;
                  return (
                    <FamilyRow
                      key={fam.id}
                      family={fam}
                      subtitle={subtitle}
                      last={i === trip.families.length - 1}
                      right={
                        <Switch
                          value={included}
                          onValueChange={() => toggleFamily(fam.id)}
                          trackColor={{ false: colors.border, true: fam.color + '88' }}
                          thumbColor={included ? fam.color : '#ccc'}
                        />
                      }
                    />
                  );
                })}
              </View>
            ) : (
              // ── Individual mode: toggle per member, grouped by family ──
              <View style={styles.splitCard}>
                {trip.families.map((fam, fi) => {
                  const famMemberIds = fam.members.map(m => m.id);
                  const effIds = participatingMemberIds ?? allMembers.map(m => m.id);
                  const allFamIn = famMemberIds.every(id => effIds.includes(id));
                  const isLastFam = fi === trip.families.length - 1;
                  return (
                    <View key={fam.id} style={[styles.famGroup, !isLastFam && styles.famGroupBorder]}>
                      {/* Family header */}
                      <View style={styles.famGroupHeader}>
                        <View style={[styles.famDot, { backgroundColor: fam.color }]} />
                        <Text style={[styles.famGroupName, { color: fam.color }]}>{fam.name}</Text>
                        <TouchableOpacity onPress={() => toggleAllFamMembers(fam, !allFamIn)}>
                          <Text style={[styles.allText, { color: fam.color }]}>
                            {allFamIn ? 'Remove all' : 'Add all'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Members */}
                      {fam.members.map((m, mi) => {
                        const effMIds = participatingMemberIds ?? allMembers.map(m => m.id);
                        const included = effMIds.includes(m.id);
                        const share = included && sharePerPerson > 0 ? `$${sharePerPerson.toFixed(2)}` : null;
                        return (
                          <View key={m.id} style={[styles.memberRow, mi < fam.members.length - 1 && styles.memberRowBorder]}>
                            <View style={[styles.memberAvatarSm, { backgroundColor: avatarColor(m.name) }]}>
                              <Text style={styles.memberAvatarSmText}>{m.name[0]}</Text>
                            </View>
                            <Text style={[styles.memberRowName, !included && { color: colors.muted }]}>{m.name.split(' ')[0]}</Text>
                            {share && <Text style={styles.memberRowShare}>{share}</Text>}
                            <Switch
                              value={included}
                              onValueChange={() => toggleMember(m.id, fam)}
                              trackColor={{ false: colors.border, true: fam.color + '88' }}
                              thumbColor={included ? fam.color : '#ccc'}
                              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Summary pill */}
            {totalAmt > 0 && (
              <View style={styles.splitSummary}>
                <Text style={styles.splitSummaryText}>
                  {effectiveMode === 'family'
                    ? `${fmtShare(sharePerFamily)}/group · ${partFamilies.length} group${partFamilies.length !== 1 ? 's' : ''}`
                    : `${fmtShare(sharePerPerson)}/person · ${partMembers.length} person${partMembers.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
            )}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function fmtShare(n) {
  return n > 0 ? `$${n.toFixed(2)}` : '$0';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  amountInput: { fontSize: 22, fontWeight: '800', color: colors.primary },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },

  chipRow: { flexDirection: 'row', gap: 8 },

  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  catChipText: { fontSize: 12, fontWeight: '600', color: colors.text },

  overrideRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  overrideChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  overrideChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  overrideChipText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  overrideChipTextActive: { color: colors.primary },

  payerChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  payerName: { fontSize: 13, fontWeight: '600', color: colors.text },
  payerFam: { fontSize: 10, color: colors.muted },

  splitCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md },

  famGroup: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  famGroupBorder: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md },
  famGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  famDot: { width: 8, height: 8, borderRadius: 4 },
  famGroupName: { ...typography.tinyBold, flex: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
  allText: { fontSize: 11, fontWeight: '700' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  memberAvatarSm: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  memberAvatarSmText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  memberRowName: { ...typography.smallBold, flex: 1, color: colors.text },
  memberRowShare: { ...typography.tinyBold, color: colors.primary },

  splitSummary: { backgroundColor: colors.greenLight, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  splitSummaryText: { fontSize: 13, fontWeight: '700', color: colors.green },
});
