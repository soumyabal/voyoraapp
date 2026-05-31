import React, { useState, useRef } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { calcCreditEstimate, NEEDS_OPTIONS } from '../utils/helpers';
import { DateRangePicker } from '../components/ui';

const CREDIT_PACKS = [
  { credits: 100,  price: '$0.99',  label: '100 credits' },
  { credits: 500,  price: '$3.99',  label: '500 credits', best: true },
  { credits: 1000, price: '$6.99',  label: '1000 credits' },
];

const MODES = [
  { key: 'manual', icon: '✍️', label: 'Plan Manually', desc: 'Build your itinerary from scratch' },
  { key: 'ai', icon: '🤖', label: 'Plan with AI', desc: 'Tell us your preferences, get a smart itinerary', color: colors.ai },
  { key: 'expert', icon: '🧳', label: 'Plan with Expert', desc: 'Connect with a travel consultant', color: colors.expert },
];

const EMPTY_MEMBER = { name: '', age: '', type: 'adult', needs: [] };

export default function NewTripModal({ visible, onClose, onCreated, onNeedAuth }) {
  const insets = useSafeAreaInsets();
  const { account, createTrip, injectAIActivities, deductCredits, addCredits } = useStore();
  const scrollRef = useRef(null);
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [familyForms, setFamilyForms] = useState([{ name: 'My Family', members: [{ ...EMPTY_MEMBER }], collapsed: false }]);
  const [generating, setGenerating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCreditBuy, setShowCreditBuy] = useState(false);

  const reset = () => {
    setStep(1); setMode(null); setName(''); setDestination('');
    setStartDate(''); setEndDate('');
    setFamilyForms([{ name: 'My Family', members: [{ ...EMPTY_MEMBER }], collapsed: false }]);
    setGenerating(false); setShowCreditBuy(false);
  };

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

  const addFamilyForm = () =>
    setFamilyForms(prev => [...prev, { name: `Family ${prev.length + 1}`, members: [{ ...EMPTY_MEMBER }], collapsed: false }]);

  const toggleFamilyCollapse = (fi) =>
    setFamilyForms(prev => prev.map((f, idx) => idx === fi ? { ...f, collapsed: !f.collapsed } : f));

  const updateFamilyName = (i, val) =>
    setFamilyForms(prev => prev.map((f, idx) => idx === i ? { ...f, name: val } : f));

  const addMember = (fi) =>
    setFamilyForms(prev => prev.map((f, idx) => idx !== fi ? f : { ...f, members: [...f.members, { ...EMPTY_MEMBER }] }));

  const updateMember = (fi, mi, field, val) =>
    setFamilyForms(prev => prev.map((f, idx) => idx !== fi ? f : {
      ...f, members: f.members.map((m, midx) => midx !== mi ? m : { ...m, [field]: val }),
    }));

  const removeMember = (fi, mi) =>
    setFamilyForms(prev => prev.map((f, idx) => idx !== fi ? f : {
      ...f, members: f.members.filter((_, midx) => midx !== mi),
    }));

  const toggleMemberNeed = (fi, mi, need) => {
    const fam = familyForms[fi];
    const member = fam.members[mi];
    const curr = member.needs || [];
    const next = curr.includes(need) ? curr.filter(n => n !== need) : [...curr, need];
    updateMember(fi, mi, 'needs', next);
  };

  // ── Credit estimation (reactive) ─────────────────────────────────
  const days = startDate && endDate
    ? Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  const namedMembers = familyForms.flatMap(f => f.members.filter(m => m.name.trim()));
  const adults = namedMembers.filter(m => m.type !== 'child').length;
  const children = namedMembers.filter(m => m.type === 'child').length;
  const needsCount = namedMembers.filter(m => m.needs?.length > 0).length;
  const travelers = adults + children || 1;

  const creditEst = mode === 'ai' && account.loggedIn && days > 0
    ? calcCreditEstimate(days, adults || 1, children, needsCount)
    : null;

  const handleCreate = () => {
    if (mode === 'ai' && creditEst) {
      if (account.credits < creditEst.total) {
        setShowCreditBuy(true);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }
    }

    const trip = createTrip({ name, destination, startDate, endDate, mode, familyForms });

    if (mode === 'ai' && creditEst) {
      deductCredits(creditEst.total);
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
      showToast(
        mode === 'expert'
          ? 'Trip created! Expert will contact you within 24hrs 🧳'
          : 'Trip created! Start adding activities 🗺️',
        '✅',
      );
      onCreated(trip);
    }
  };

  // ── Credit estimate card (reused in Step 2 and Step 3) ───────────
  const CreditEstCard = () => {
    if (!creditEst) return null;
    const enough = account.credits >= creditEst.total;
    return (
      <View style={[styles.estimator, { borderColor: enough ? colors.green : colors.red }]}>
        <View style={styles.estHeader}>
          <Text style={styles.estTitle}>💳 Credit Cost</Text>
          <Text style={[styles.estTotal, { color: enough ? colors.green : colors.red }]}>
            {creditEst.total} cr
          </Text>
        </View>
        <Text style={styles.estBalance}>
          Balance: {account.credits} cr → After: {account.credits - creditEst.total} cr
        </Text>
        {[
          { label: 'AI planning base', cr: creditEst.base },
          { label: `${days} day${days !== 1 ? 's' : ''} × 3 cr`, cr: creditEst.daysCost },
          adults > 0 && { label: `${adults} adult${adults !== 1 ? 's' : ''} × 3 cr`, cr: creditEst.adultsCost },
          children > 0 && { label: `${children} child${children !== 1 ? 'ren' : ''} × 1 cr`, cr: creditEst.childrenCost },
          needsCount > 0 && { label: `${needsCount} accessibility need${needsCount !== 1 ? 's' : ''} × 2 cr`, cr: creditEst.needsCost },
        ].filter(Boolean).map((item, i) => (
          <View key={i} style={styles.estItem}>
            <Text style={styles.estItemLabel}>{item.label}</Text>
            <Text style={styles.estItemCr}>{item.cr} cr</Text>
          </View>
        ))}
        {!enough && (
          <Text style={styles.estWarn}>⚠️ Not enough credits to generate this trip</Text>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={step > 1 ? () => setStep(s => s - 1) : handleClose}>
              <Text style={styles.backText}>{step > 1 ? '← Back' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>✈️ Start Planning</Text>
          <View style={styles.headerSide} />
        </View>

        {/* Step indicator */}
        <View style={styles.steps}>
          {[
            { n: 1, label: 'Mode' },
            { n: 2, label: 'Details' },
            { n: 3, label: 'Travelers' },
          ].map((s, idx) => (
            <React.Fragment key={s.n}>
              <View style={styles.stepItem}>
                <View style={[styles.stepDot, step > s.n && styles.stepDone, step === s.n && styles.stepActive]}>
                  <Text style={[styles.stepNum, step >= s.n && { color: '#fff' }]}>{s.n}</Text>
                </View>
                <Text numberOfLines={1} style={[
                  styles.stepLabel,
                  step === s.n && styles.stepLabelActive,
                  step > s.n && styles.stepLabelDone,
                ]}>{s.label}</Text>
              </View>
              {idx < 2 && <View style={[styles.stepLine, step > s.n && { backgroundColor: colors.green }]} />}
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
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: step === 1 ? insets.bottom + 24 : insets.bottom + 160 }]}
            scrollEnabled={step !== 1}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── STEP 1: Mode ─────────────────────────────────── */}
            {step === 1 && (
              <>
                <Text style={styles.stepHint}>How would you like to plan your trip?</Text>
                {MODES.map(m => {
                  const active = mode === m.key;
                  const accent = m.color || colors.primary;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.modeCard, active && { borderColor: accent, backgroundColor: accent + '12' }]}
                      onPress={() => setMode(m.key)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.modeIconWrap, active && { backgroundColor: accent + '22' }]}>
                        <Text style={styles.modeIcon}>{m.icon}</Text>
                      </View>
                      <View style={styles.modeTextBlock}>
                        <Text style={[styles.modeLabel, active && { color: accent }]}>{m.label}</Text>
                        <Text style={styles.modeDesc}>{m.desc}</Text>
                      </View>
                      <View style={[styles.modeRadio, active && { borderColor: accent }]}>
                        {active && <View style={[styles.modeRadioDot, { backgroundColor: accent }]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* ── STEP 2: Details + Dates ───────────────────────── */}
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
                      {startDate && endDate ? `${startDate}  →  ${endDate}` : startDate || 'Select dates'}
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

                {/* Credit estimate (Step 2 preview — travelers not set yet so shows base+days) */}
                <CreditEstCard />
              </>
            )}

            {/* ── STEP 3: Travelers ────────────────────────────── */}
            {step === 3 && (
              <>
                <Text style={styles.stepHint}>Add families and travelers. Select type and any special needs for each person.</Text>

                {familyForms.map((fam, fi) => {
                  const namedCount = fam.members.filter(m => m.name.trim()).length;
                  const memberSummary = namedCount > 0
                    ? fam.members.filter(m => m.name.trim()).map(m => m.name.trim()).join(', ')
                    : `${fam.members.length} member${fam.members.length !== 1 ? 's' : ''}`;

                  return (
                    <View key={fi} style={styles.familyForm}>
                      {/* Family header row */}
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

                      {/* Member cards */}
                      {!fam.collapsed && (
                        <>
                          {fam.members.map((m, mi) => (
                            <View key={mi} style={styles.memberCard}>
                              {/* Name + Age row */}
                              <View style={styles.memberInputRow}>
                                <TextInput
                                  style={[styles.input, { flex: 2 }]}
                                  value={m.name}
                                  onChangeText={v => updateMember(fi, mi, 'name', v)}
                                  placeholder="Full name"
                                  placeholderTextColor={colors.muted}
                                  autoCapitalize="words"
                                />
                                <TextInput
                                  style={[styles.input, { width: 64 }]}
                                  value={m.age}
                                  onChangeText={v => updateMember(fi, mi, 'age', v)}
                                  placeholder="Age"
                                  placeholderTextColor={colors.muted}
                                  keyboardType="numeric"
                                />
                                {fam.members.length > 1 && (
                                  <TouchableOpacity onPress={() => removeMember(fi, mi)}>
                                    <Text style={styles.removeText}>✕</Text>
                                  </TouchableOpacity>
                                )}
                              </View>

                              {/* Adult / Child toggle */}
                              <View style={styles.typeRow}>
                                <Text style={styles.typeLabel}>Type</Text>
                                <View style={styles.typeToggle}>
                                  {[
                                    { key: 'adult', label: '👤 Adult' },
                                    { key: 'child', label: '👧 Child' },
                                  ].map(t => (
                                    <TouchableOpacity
                                      key={t.key}
                                      style={[styles.typeBtn, m.type === t.key && styles.typeBtnActive]}
                                      onPress={() => updateMember(fi, mi, 'type', t.key)}
                                    >
                                      <Text style={[styles.typeBtnText, m.type === t.key && styles.typeBtnTextActive]}>
                                        {t.label}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>

                              {/* Special needs chips */}
                              <Text style={styles.needsLabel}>Special Needs / Accessibility</Text>
                              <View style={styles.needsGrid}>
                                {NEEDS_OPTIONS.map(need => {
                                  const sel = m.needs?.includes(need);
                                  return (
                                    <TouchableOpacity
                                      key={need}
                                      style={[styles.needChip, sel && styles.needChipActive]}
                                      onPress={() => toggleMemberNeed(fi, mi, need)}
                                    >
                                      <Text style={[styles.needChipText, sel && styles.needChipTextActive]}>
                                        {need}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          ))}

                          <TouchableOpacity style={styles.addMemberBtn} onPress={() => addMember(fi)}>
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

                {/* Credit estimate + buy panel */}
                {mode === 'ai' && (
                  <View style={styles.creditStep3Wrap}>
                    <CreditEstCard />
                    {!creditEst && (
                      <View style={styles.creditPlaceholder}>
                        <Text style={styles.creditPlaceholderText}>
                          💳 Credit cost will appear once dates are set
                        </Text>
                      </View>
                    )}

                    {/* Buy credits panel — shown when insufficient */}
                    {showCreditBuy && creditEst && account.credits < creditEst.total && (
                      <View style={styles.buyPanel}>
                        <Text style={styles.buyTitle}>Top up to unlock your AI itinerary</Text>
                        <Text style={styles.buySubtitle}>
                          You need {creditEst.total - account.credits} more credits to generate this trip
                        </Text>

                        {CREDIT_PACKS.map(pack => {
                          const coversShortfall = account.credits + pack.credits >= creditEst.total;
                          return (
                            <TouchableOpacity
                              key={pack.credits}
                              style={[styles.packRow, pack.best && styles.packRowBest]}
                              onPress={() => {
                                addCredits(pack.credits);
                                showToast(`${pack.credits} credits added!`, '💳');
                                if (coversShortfall) setShowCreditBuy(false);
                              }}
                              activeOpacity={0.8}
                            >
                              <View style={styles.packLeft}>
                                {pack.best && (
                                  <View style={styles.bestBadge}>
                                    <Text style={styles.bestBadgeText}>⭐ Best Value</Text>
                                  </View>
                                )}
                                <Text style={[styles.packCredits, pack.best && styles.packCreditsBest]}>
                                  {pack.credits} credits
                                </Text>
                                <Text style={styles.packCovers}>
                                  {coversShortfall ? '✓ Covers this trip' : `${account.credits + pack.credits} total`}
                                </Text>
                              </View>
                              <View style={[styles.packPriceBtn, pack.best && styles.packPriceBtnBest]}>
                                <Text style={[styles.packPrice, pack.best && styles.packPriceBest]}>{pack.price}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}

                        <View style={styles.buyDivider}>
                          <View style={styles.buyDividerLine} />
                          <Text style={styles.buyDividerText}>or</Text>
                          <View style={styles.buyDividerLine} />
                        </View>

                        <TouchableOpacity
                          style={styles.saveDraftBtn}
                          onPress={() => {
                            const trip = createTrip({ name, destination, startDate, endDate, mode: 'manual', familyForms });
                            reset();
                            showToast('Trip saved as draft — switch to AI anytime 📝', '✅');
                            onCreated(trip);
                          }}
                        >
                          <Text style={styles.saveDraftText}>Save as Draft (Manual mode)</Text>
                          <Text style={styles.saveDraftSub}>You can switch to AI planning later from the trip menu</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
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
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.green }]}
                onPress={handleCreate}
              >
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
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerSide: { flex: 1 },
  backText: { ...typography.bodyBold, color: colors.primary },
  headerTitle: { flex: 2, ...typography.h4, color: colors.text, textAlign: 'center' },

  steps: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  stepItem: { flex: 3, alignItems: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum: { fontSize: 13, fontWeight: '700', color: colors.muted },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4, marginTop: 13 },
  stepLabel: { fontSize: 10, fontWeight: '600', color: colors.muted, marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.2, textAlign: 'center' },
  stepLabelActive: { color: colors.primary },
  stepLabelDone: { color: colors.green },

  scroll: { flex: 1 },
  content: { padding: spacing.xxl },
  stepHint: { ...typography.small, color: colors.muted, marginBottom: spacing.lg, lineHeight: 18 },

  // Mode cards
  modeCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 14 },
  modeIconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  modeIcon: { fontSize: 26 },
  modeTextBlock: { flex: 1 },
  modeLabel: { ...typography.bodyBold, color: colors.text },
  modeDesc: { ...typography.small, color: colors.muted, marginTop: 2 },
  modeRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modeRadioDot: { width: 10, height: 10, borderRadius: 5 },

  // Form
  formGroup: { marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: colors.surface },
  dateBtnIcon: { fontSize: 16 },
  dateBtnText: { ...typography.small, color: colors.text, fontWeight: '600' },
  datePlaceholder: { color: colors.muted, fontWeight: '400' },

  // AI gate
  aiGate: { backgroundColor: colors.aiLight, borderWidth: 2, borderColor: colors.ai, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.md },
  aiGateIcon: { fontSize: 40, marginBottom: 10 },
  aiGateTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 6 },
  aiGateSub: { ...typography.small, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  aiGateBtn: { backgroundColor: colors.ai, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 11 },
  aiGateBtnText: { color: '#fff', fontWeight: '700' },

  // Credit estimator
  estimator: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  estHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  estTitle: { ...typography.bodyBold, color: colors.text },
  estTotal: { fontSize: 22, fontWeight: '900' },
  estBalance: { ...typography.tiny, color: colors.muted, marginBottom: spacing.md },
  estItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  estItemLabel: { ...typography.small, color: colors.muted },
  estItemCr: { ...typography.smallBold, color: colors.text },
  estWarn: { ...typography.smallBold, color: colors.red, marginTop: spacing.sm, textAlign: 'center' },
  creditStep3Wrap: { marginTop: spacing.md },
  creditPlaceholder: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderStyle: 'dashed' },
  creditPlaceholderText: { ...typography.small, color: colors.muted },

  // Family form
  familyForm: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  familyFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  familyNameInput: { flex: 1, marginBottom: 0 },
  collapseBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  collapseIcon: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  collapsedSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  collapsedSummaryText: { ...typography.small, color: colors.muted },
  expandHint: { ...typography.tiny, color: colors.primary },

  // Member card
  memberCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  memberInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: spacing.sm },
  removeText: { color: colors.muted, fontSize: 16, padding: 4 },
  removeFamText: { color: colors.muted, fontSize: 18, padding: 4 },

  // Adult / Child toggle
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  typeLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, width: 36 },
  typeToggle: { flexDirection: 'row', gap: 6 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  typeBtnActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  typeBtnText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  typeBtnTextActive: { color: colors.primary },

  // Needs chips
  needsLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  needsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  needChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  needChipActive: { backgroundColor: colors.greenLight, borderColor: colors.green },
  needChipText: { fontSize: 11, fontWeight: '600', color: colors.muted },
  needChipTextActive: { color: colors.green },

  addMemberBtn: { marginTop: spacing.sm },
  addMemberText: { ...typography.smallBold, color: colors.muted, paddingVertical: 4 },
  addFamBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginBottom: spacing.sm },
  addFamBtnText: { ...typography.bodyBold, color: colors.primary },

  // Buy credits panel
  buyPanel: { marginTop: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  buyTitle: { ...typography.bodyBold, color: colors.text, padding: spacing.lg, paddingBottom: 4 },
  buySubtitle: { ...typography.small, color: colors.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  packRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  packRowBest: { backgroundColor: colors.primaryLight + '18' },
  packLeft: { flex: 1 },
  bestBadge: { alignSelf: 'flex-start', backgroundColor: colors.yellow + '33', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  bestBadgeText: { fontSize: 10, fontWeight: '700', color: colors.yellow },
  packCredits: { ...typography.bodyBold, color: colors.text },
  packCreditsBest: { color: colors.primary },
  packCovers: { ...typography.tiny, color: colors.green, marginTop: 2 },
  packPriceBtn: { backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  packPriceBtnBest: { backgroundColor: colors.primary, borderColor: colors.primary },
  packPrice: { ...typography.bodyBold, color: colors.text },
  packPriceBest: { color: '#fff' },

  buyDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  buyDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  buyDividerText: { ...typography.small, color: colors.muted },

  saveDraftBtn: { padding: spacing.lg, alignItems: 'center' },
  saveDraftText: { ...typography.bodyBold, color: colors.primary },
  saveDraftSub: { ...typography.tiny, color: colors.muted, marginTop: 4, textAlign: 'center' },

  footer: { padding: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  generating: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  genIcon: { fontSize: 56, marginBottom: 16 },
  genTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: 8 },
  genSub: { ...typography.body, color: colors.muted, textAlign: 'center' },
});
