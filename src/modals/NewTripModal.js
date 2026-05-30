import React, { useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { calcCreditEstimate } from '../utils/helpers';
import { DateRangePicker } from '../components/ui';

const MODES = [
  { key: 'manual', icon: '✍️', label: 'Plan Manually', desc: 'Build your itinerary from scratch' },
  { key: 'ai', icon: '🤖', label: 'Plan with AI', desc: 'Tell us your preferences, get a smart itinerary', color: colors.ai },
  { key: 'expert', icon: '🧳', label: 'Plan with Expert', desc: 'Connect with a travel consultant', color: colors.expert },
];

export default function NewTripModal({ visible, onClose, onCreated, onNeedAuth }) {
  const insets = useSafeAreaInsets();
  const { account, createTrip, injectAIActivities, deductCredits } = useStore();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [familyForms, setFamilyForms] = useState([{ name: 'My Family', members: [{ name: '', age: '' }], collapsed: false }]);
  const [generating, setGenerating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const reset = () => { setStep(1); setMode(null); setName(''); setDestination(''); setStartDate(''); setEndDate(''); setFamilyForms([{ name: 'My Family', members: [{ name: '', age: '' }], collapsed: false }]); setGenerating(false); };

  const handleClose = () => { reset(); onClose(); };

  const nextStep = () => {
    if (step === 1 && !mode) { showToast('Please choose a planning mode', '⚠️'); return; }
    if (step === 2) {
      if (!name.trim()) { showToast('Please enter a trip name', '⚠️'); return; }
      if (!destination.trim()) { showToast('Please enter a destination', '⚠️'); return; }
      if (!startDate || !endDate) { showToast('Please set start & end dates', '⚠️'); return; }
      if (new Date(startDate) >= new Date(endDate)) { showToast('End date must be after start date', '⚠️'); return; }
      if (mode === 'ai' && !account.loggedIn) { handleClose(); onNeedAuth(); return; }
    }
    setStep(s => s + 1);
  };

  const addFamilyForm = () => setFamilyForms(prev => [...prev, { name: `Family ${prev.length + 1}`, members: [{ name: '', age: '' }], collapsed: false }]);
  const toggleFamilyCollapse = (fi) => setFamilyForms(prev => prev.map((f, idx) => idx === fi ? { ...f, collapsed: !f.collapsed } : f));
  const updateFamilyName = (i, val) => setFamilyForms(prev => prev.map((f, idx) => idx === i ? { ...f, name: val } : f));
  const addMember = (fi) => setFamilyForms(prev => prev.map((f, idx) => idx === fi ? { ...f, members: [...f.members, { name: '', age: '' }] } : f));
  const updateMember = (fi, mi, field, val) => setFamilyForms(prev => prev.map((f, idx) => idx !== fi ? f : { ...f, members: f.members.map((m, midx) => midx !== mi ? m : { ...m, [field]: val }) }));
  const removeMember = (fi, mi) => setFamilyForms(prev => prev.map((f, idx) => idx !== fi ? f : { ...f, members: f.members.filter((_, midx) => midx !== mi) }));

  const handleCreate = () => {
    if (mode === 'ai') {
      const days = startDate && endDate ? Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1 : 7;
      const travelers = familyForms.reduce((s, f) => s + f.members.filter(m => m.name).length, 0) || 1;
      const est = calcCreditEstimate(days, travelers, 0, false);
      if (account.credits < est.total) { showToast(`Need ${est.total} credits, have ${account.credits}`, '⚠️'); return; }
    }

    const trip = createTrip({ name, destination, startDate, endDate, mode, familyForms });

    if (mode === 'ai') {
      const days = startDate && endDate ? Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1 : 7;
      const travelers = familyForms.reduce((s, f) => s + f.members.filter(m => m.name).length, 0) || 1;
      const est = calcCreditEstimate(days, travelers, 0, false);
      deductCredits(est.total);
      setGenerating(true);
      setTimeout(() => {
        injectAIActivities(trip.id);
        setGenerating(false);
        reset();
        showToast('AI itinerary with cost estimates ready!', '🤖');
        onCreated(trip);
      }, 3000);
    } else {
      reset();
      showToast(mode === 'expert' ? 'Trip created! Expert will contact you within 24hrs 🧳' : 'Trip created! Start adding activities 🗺️', '✅');
      onCreated(trip);
    }
  };

  const days = startDate && endDate ? Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1 : 0;
  const travelers = familyForms.reduce((s, f) => s + f.members.filter(m => m.name).length, 0) || 1;
  const creditEst = mode === 'ai' && account.loggedIn && days > 0 ? calcCreditEstimate(days, travelers, 0, false) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={step > 1 ? () => setStep(s => s - 1) : handleClose}>
            <Text style={styles.backText}>{step > 1 ? '← Back' : 'Cancel'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>✈️ Start Planning</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step indicator */}
        <View style={styles.steps}>
          {[1, 2, 3].map(s => (
            <React.Fragment key={s}>
              <View style={[styles.stepDot, step > s && styles.stepDone, step === s && styles.stepActive]}>
                <Text style={[styles.stepNum, (step >= s) && { color: '#fff' }]}>{s}</Text>
              </View>
              {s < 3 && <View style={[styles.stepLine, step > s && { backgroundColor: colors.green }]} />}
            </React.Fragment>
          ))}
        </View>

        {generating ? (
          <View style={styles.generating}>
            <Text style={styles.genIcon}>⚙️</Text>
            <Text style={styles.genTitle}>AI is Building Your Itinerary</Text>
            <Text style={styles.genSub}>Analyzing preferences and estimating costs...</Text>
            <ActivityIndicator color={colors.ai} size="large" style={{ marginTop: 20 }} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">

            {/* STEP 1: Mode */}
            {step === 1 && (
              <>
                <Text style={styles.stepHint}>How would you like to plan your trip?</Text>
                {MODES.map(m => (
                  <TouchableOpacity key={m.key} style={[styles.modeCard, mode === m.key && { borderColor: m.color || colors.primary, backgroundColor: (m.color || colors.primary) + '15' }]} onPress={() => setMode(m.key)}>
                    <Text style={styles.modeIcon}>{m.icon}</Text>
                    <Text style={styles.modeLabel}>{m.label}</Text>
                    <Text style={styles.modeDesc}>{m.desc}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* STEP 2: Details */}
            {step === 2 && (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Trip Name</Text>
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Bali Family Adventure" placeholderTextColor={colors.muted} />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Destination</Text>
                  <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholder="e.g. Bali, Indonesia" placeholderTextColor={colors.muted} />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Travel Dates</Text>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateBtnIcon}>📅</Text>
                    <Text style={[styles.dateBtnText, (!startDate && !endDate) && styles.datePlaceholder]}>
                      {startDate && endDate
                        ? `${startDate}  →  ${endDate}`
                        : startDate || 'Select dates'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <DateRangePicker
                  visible={showDatePicker}
                  startDate={startDate}
                  endDate={endDate}
                  onConfirm={(start, end) => { setStartDate(start); setEndDate(end); }}
                  onClose={() => setShowDatePicker(false)}
                />

                {/* AI Login Gate */}
                {mode === 'ai' && !account.loggedIn && (
                  <View style={styles.aiGate}>
                    <Text style={styles.aiGateIcon}>🤖</Text>
                    <Text style={styles.aiGateTitle}>AI Planner requires an account</Text>
                    <Text style={styles.aiGateSub}>Sign up free and get 100 credits instantly.</Text>
                    <TouchableOpacity style={styles.aiGateBtn} onPress={() => { handleClose(); onNeedAuth(); }}>
                      <Text style={styles.aiGateBtnText}>🚀 Sign Up — 100 Free Credits</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Credit Estimator */}
                {creditEst && (
                  <View style={[styles.estimator, { borderColor: account.credits >= creditEst.total ? colors.green : colors.red }]}>
                    <View style={styles.estHeader}>
                      <Text style={styles.estTitle}>💳 Credit Cost Estimate</Text>
                      <Text style={[styles.estTotal, { color: account.credits >= creditEst.total ? colors.green : colors.red }]}>{creditEst.total} cr</Text>
                    </View>
                    <Text style={styles.estBalance}>Balance: {account.credits} cr → After: {account.credits - creditEst.total} cr</Text>
                    {[
                      { label: 'Base generation', cr: creditEst.base },
                      { label: `${days} days × 3 cr`, cr: creditEst.daysCost },
                      { label: `${travelers} travelers × 2 cr`, cr: creditEst.travelersCost },
                      { label: 'Cost estimation layer', cr: creditEst.costEstimation },
                    ].filter(i => i.cr > 0).map((item, i) => (
                      <View key={i} style={styles.estItem}>
                        <Text style={styles.estItemLabel}>{item.label}</Text>
                        <Text style={styles.estItemCr}>{item.cr} cr</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* STEP 3: Travelers */}
            {step === 3 && (
              <>
                <Text style={styles.stepHint}>Add the families and members joining this trip.</Text>
                {familyForms.map((fam, fi) => {
                  const namedCount = fam.members.filter(m => m.name.trim()).length;
                  const memberSummary = namedCount > 0
                    ? fam.members.filter(m => m.name.trim()).map(m => m.name.trim()).join(', ')
                    : `${fam.members.length} member${fam.members.length !== 1 ? 's' : ''}`;

                  return (
                    <View key={fi} style={styles.familyForm}>
                      {/* Collapsible header */}
                      <View style={styles.familyFormHeader}>
                        <TouchableOpacity onPress={() => toggleFamilyCollapse(fi)} style={styles.collapseBtn}>
                          <Text style={styles.collapseIcon}>{fam.collapsed ? '▸' : '▾'}</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.input, styles.familyNameInput]}
                          value={fam.name}
                          onChangeText={v => updateFamilyName(fi, v)}
                          placeholder="Family name"
                          placeholderTextColor={colors.muted}
                        />
                        {familyForms.length > 1 && (
                          <TouchableOpacity onPress={() => setFamilyForms(prev => prev.filter((_, i) => i !== fi))}>
                            <Text style={styles.removeFamText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Collapsed summary */}
                      {fam.collapsed && (
                        <TouchableOpacity onPress={() => toggleFamilyCollapse(fi)} style={styles.collapsedSummary}>
                          <Text style={styles.collapsedSummaryText}>👥 {memberSummary}</Text>
                          <Text style={styles.expandHint}>Tap to expand</Text>
                        </TouchableOpacity>
                      )}

                      {/* Member rows — hidden when collapsed */}
                      {!fam.collapsed && (
                        <>
                          {fam.members.map((m, mi) => (
                            <View key={mi} style={styles.memberInputRow}>
                              <TextInput style={[styles.input, { flex: 2 }]} value={m.name} onChangeText={v => updateMember(fi, mi, 'name', v)} placeholder="Name" placeholderTextColor={colors.muted} />
                              <TextInput style={[styles.input, { flex: 1 }]} value={m.age} onChangeText={v => updateMember(fi, mi, 'age', v)} placeholder="Age" placeholderTextColor={colors.muted} keyboardType="numeric" />
                              {fam.members.length > 1 && (
                                <TouchableOpacity onPress={() => removeMember(fi, mi)}>
                                  <Text style={styles.removeText}>✕</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                          <TouchableOpacity onPress={() => addMember(fi)}>
                            <Text style={styles.addMemberText}>+ Add Person</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })}
                <TouchableOpacity style={styles.addFamBtn} onPress={addFamilyForm}>
                  <Text style={styles.addFamBtnText}>+ Add Another Family</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {/* Footer */}
        {!generating && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            {step < 3 ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={nextStep}>
                <Text style={styles.primaryBtnText}>Next →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.green }]} onPress={handleCreate}>
                <Text style={styles.primaryBtnText}>🚀 Create Trip</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  backText: { ...typography.bodyBold, color: colors.primary, width: 60 },
  headerTitle: { ...typography.h4, color: colors.text },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum: { fontSize: 13, fontWeight: '700', color: colors.muted },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 8 },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl },
  stepHint: { ...typography.small, color: colors.muted, marginBottom: spacing.lg },
  modeCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.md, alignItems: 'center' },
  modeIcon: { fontSize: 36, marginBottom: 8 },
  modeLabel: { ...typography.bodyBold, color: colors.text },
  modeDesc: { ...typography.small, color: colors.muted, marginTop: 4, textAlign: 'center' },
  formGroup: { marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: colors.surface },
  dateBtnIcon: { fontSize: 16 },
  dateBtnText: { ...typography.small, color: colors.text, fontWeight: '600' },
  datePlaceholder: { color: colors.muted, fontWeight: '400' },
aiGate: { backgroundColor: colors.aiLight, borderWidth: 2, borderColor: colors.ai, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.md },
  aiGateIcon: { fontSize: 40, marginBottom: 10 },
  aiGateTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 6 },
  aiGateSub: { ...typography.small, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  aiGateBtn: { backgroundColor: colors.ai, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11 },
  aiGateBtnText: { color: '#fff', fontWeight: '700' },
  estimator: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  estHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  estTitle: { ...typography.bodyBold, color: colors.text },
  estTotal: { fontSize: 22, fontWeight: '900' },
  estBalance: { ...typography.tiny, color: colors.muted, marginBottom: spacing.md },
  estItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  estItemLabel: { ...typography.small, color: colors.muted },
  estItemCr: { ...typography.smallBold, color: colors.text },
  familyForm: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  familyFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  familyNameInput: { flex: 1, marginBottom: 0 },
  collapseBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  collapseIcon: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  collapsedSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2, paddingBottom: 4 },
  collapsedSummaryText: { ...typography.small, color: colors.muted },
  expandHint: { ...typography.tiny, color: colors.primary },
  memberInputRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  removeText: { color: colors.muted, fontSize: 16, padding: 4 },
  removeFamText: { color: colors.muted, fontSize: 18, padding: 4 },
  addMemberText: { ...typography.smallBold, color: colors.muted, paddingTop: 4 },
  addFamBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  addFamBtnText: { ...typography.bodyBold, color: colors.primary },
  footer: { padding: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  generating: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  genIcon: { fontSize: 56, marginBottom: 16 },
  genTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: 8 },
  genSub: { ...typography.body, color: colors.muted, textAlign: 'center' },
});
