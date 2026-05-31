/**
 * NewTripModal.js
 *
 * 3-step trip creation wizard:
 *   Step 1 — Trip Header   (name, destination, dates)
 *   Step 2 — Travelers     (multi-family builder — add groups or new families)
 *   Step 3 — Plan Trip     (Manual | AI | Expert)
 */

import React, { useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { DateRangePicker, LocationSearchField } from '../components/ui';
import { avatarColor } from '../utils/helpers';
import { BYPASS_SUBSCRIPTION, PRO_MONTHLY_PRICE } from '../config';

const MODES = [
  { key: 'manual', icon: '✍️', label: 'Plan Manually',    desc: 'Build your itinerary from scratch — full control',     color: colors.primary },
  { key: 'ai',     icon: '🤖', label: 'Plan with AI',     desc: 'Get a smart itinerary based on your dates & travelers', color: colors.ai },
  { key: 'expert', icon: '🧳', label: 'Plan with Expert', desc: 'Connect with a travel consultant within 24 hrs',        color: colors.expert },
];

const PALETTE = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#e84393', '#e67e22', '#fdcb6e', '#74b9ff'];
const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Step 2: Multi-family Traveler Picker ────────────────────────
function TravelerStep({ travelers, groups, tripFamilies, setTripFamilies }) {
  // Inline UI state
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showNewFamilyForm, setShowNewFamilyForm] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');

  // Per-family member-adder state
  const [expandedFamilyId, setExpandedFamilyId] = useState(null);
  const [memberTab, setMemberTab] = useState('library'); // 'library' | 'new'
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberAge, setNewMemberAge] = useState('');
  const [newMemberSave, setNewMemberSave] = useState(true);

  // ── Helpers ───────────────────────────────────────────────────
  const addedGroupIds = new Set(tripFamilies.map(f => f.groupId).filter(Boolean));
  const totalMembers = tripFamilies.reduce((sum, f) => sum + f.members.length, 0);

  const getMembersInTrip = () => new Set(
    tripFamilies.flatMap(f => f.members.map(m => m.travelerId).filter(Boolean))
  );

  const nextColor = () => PALETTE[tripFamilies.length % PALETTE.length];

  // ── Add saved group ───────────────────────────────────────────
  const addGroup = (g) => {
    const groupTravelers = (g.travelerIds || [])
      .map(id => travelers.find(tv => tv.id === id))
      .filter(Boolean);
    setTripFamilies(prev => [...prev, {
      id: uid(),
      name: g.name,
      color: g.color,
      groupId: g.id,
      members: groupTravelers.map(tv => ({ id: uid(), name: tv.name, age: tv.age, travelerId: tv.id, saveToLibrary: false })),
    }]);
    setShowGroupPicker(false);
  };

  // ── Create new family ─────────────────────────────────────────
  const createFamily = () => {
    if (!newFamilyName.trim()) { showToast('Enter a family name', '⚠️'); return; }
    const fam = { id: uid(), name: newFamilyName.trim(), color: nextColor(), groupId: null, members: [] };
    setTripFamilies(prev => [...prev, fam]);
    setNewFamilyName('');
    setShowNewFamilyForm(false);
    setExpandedFamilyId(fam.id);
    setMemberTab('library');
  };

  // ── Remove family ─────────────────────────────────────────────
  const removeFamily = (famId) => {
    setTripFamilies(prev => prev.filter(f => f.id !== famId));
    if (expandedFamilyId === famId) setExpandedFamilyId(null);
  };

  // ── Add library traveler to family ────────────────────────────
  const addLibraryMember = (famId, tv) => {
    setTripFamilies(prev => prev.map(f => {
      if (f.id !== famId) return f;
      if (f.members.some(m => m.travelerId === tv.id)) return f; // already in
      return { ...f, members: [...f.members, { id: uid(), name: tv.name, age: tv.age, travelerId: tv.id, saveToLibrary: false }] };
    }));
  };

  // ── Remove library traveler from family ───────────────────────
  const removeMember = (famId, memberId) => {
    setTripFamilies(prev => prev.map(f =>
      f.id !== famId ? f : { ...f, members: f.members.filter(m => m.id !== memberId) }
    ));
  };

  // ── Add new (unlibrary) member ────────────────────────────────
  const addNewMember = (famId) => {
    if (!newMemberName.trim()) { showToast('Enter a name', '⚠️'); return; }
    const mem = {
      id: uid(),
      name: newMemberName.trim(),
      age: parseInt(newMemberAge) || null,
      travelerId: null,
      saveToLibrary: newMemberSave,
    };
    setTripFamilies(prev => prev.map(f =>
      f.id !== famId ? f : { ...f, members: [...f.members, mem] }
    ));
    setNewMemberName(''); setNewMemberAge(''); setNewMemberSave(true);
  };

  // ── Toggle member adder ───────────────────────────────────────
  const toggleExpand = (famId) => {
    if (expandedFamilyId === famId) {
      setExpandedFamilyId(null);
    } else {
      setExpandedFamilyId(famId);
      setMemberTab('library');
      setNewMemberName(''); setNewMemberAge(''); setNewMemberSave(true);
    }
  };

  const inTripIds = getMembersInTrip();

  return (
    <View>
      {/* ── Section header ────────────────────────────── */}
      <View style={t.sectionHeader}>
        <Text style={t.sectionTitle}>
          {totalMembers > 0 ? `${tripFamilies.length} group${tripFamilies.length !== 1 ? 's' : ''} · ${totalMembers} traveler${totalMembers !== 1 ? 's' : ''}` : 'Who\'s coming?'}
        </Text>
        <Text style={t.sectionSub}>You can also add travelers from the trip's People tab later</Text>
      </View>

      {/* ── Empty state ───────────────────────────────── */}
      {tripFamilies.length === 0 && !showGroupPicker && !showNewFamilyForm && (
        <View style={t.emptyState}>
          <Text style={t.emptyIcon}>✈️</Text>
          <Text style={t.emptyTitle}>Add your travel groups</Text>
          <Text style={t.emptyBody}>
            Each family or group can track their own budget, needs, and activities — all in one trip.
          </Text>
        </View>
      )}

      {/* ── Family cards ──────────────────────────────── */}
      {tripFamilies.map(fam => (
        <View key={fam.id} style={[t.familyCard, { borderLeftColor: fam.color }]}>

          {/* Card header */}
          <View style={t.cardHeader}>
            <View style={[t.colorDot, { backgroundColor: fam.color }]} />
            <Text style={t.familyName}>{fam.name}</Text>
            {fam.groupId && (
              <View style={t.libraryBadge}>
                <Text style={t.libraryBadgeText}>📚 Saved</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => removeFamily(fam.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={t.removeBtn}
            >
              <Text style={t.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Member chips */}
          {fam.members.length > 0 && (
            <View style={t.memberChips}>
              {fam.members.map(m => (
                <View key={m.id} style={t.chip}>
                  <View style={[t.chipAvatar, { backgroundColor: avatarColor(m.name) }]}>
                    <Text style={t.chipAvatarText}>{m.name[0]}</Text>
                  </View>
                  <Text style={t.chipName}>{m.name.split(' ')[0]}</Text>
                  {m.age ? <Text style={t.chipAge}>{m.age}</Text> : null}
                  <TouchableOpacity onPress={() => removeMember(fam.id, m.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={t.chipRemove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Add member button */}
          <TouchableOpacity
            style={t.addMemberBtn}
            onPress={() => toggleExpand(fam.id)}
          >
            <Text style={t.addMemberText}>
              {expandedFamilyId === fam.id ? '↑ Close' : '+ Add Member'}
            </Text>
          </TouchableOpacity>

          {/* Member adder — expands inline */}
          {expandedFamilyId === fam.id && (
            <View style={t.memberAdder}>
              {/* Tab toggle */}
              <View style={t.tabToggle}>
                {['library', 'new'].map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[t.tabBtn, memberTab === tab && t.tabBtnActive]}
                    onPress={() => setMemberTab(tab)}
                  >
                    <Text style={[t.tabBtnText, memberTab === tab && t.tabBtnTextActive]}>
                      {tab === 'library' ? '📚 From Library' : '✨ New Person'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Library tab */}
              {memberTab === 'library' && (
                travelers.length === 0 ? (
                  <Text style={t.emptyLib}>No travelers in your library yet — add via the Travelers tab on the home screen.</Text>
                ) : (
                  <View style={t.libraryList}>
                    {travelers.map(tv => {
                      const alreadyIn = fam.members.some(m => m.travelerId === tv.id);
                      const inOther = !alreadyIn && inTripIds.has(tv.id);
                      return (
                        <TouchableOpacity
                          key={tv.id}
                          style={[t.libRow, alreadyIn && t.libRowDone]}
                          onPress={() => !alreadyIn && addLibraryMember(fam.id, tv)}
                          activeOpacity={alreadyIn ? 1 : 0.7}
                          disabled={alreadyIn}
                        >
                          <View style={[t.libAvatar, { backgroundColor: avatarColor(tv.name) }]}>
                            <Text style={t.libAvatarText}>{tv.emoji || tv.name[0]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[t.libName, alreadyIn && { color: colors.muted }]}>{tv.name}</Text>
                            {tv.age ? <Text style={t.libMeta}>{tv.age}yo</Text> : null}
                          </View>
                          {alreadyIn
                            ? <Text style={t.addedTag}>✓ Added</Text>
                            : inOther
                              ? <Text style={[t.addedTag, { color: colors.muted }]}>In another group</Text>
                              : <Text style={t.addTag}>+ Add</Text>
                          }
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              )}

              {/* New person tab */}
              {memberTab === 'new' && (
                <View style={t.newPersonForm}>
                  <View style={t.newPersonRow}>
                    <TextInput
                      style={[t.input, { flex: 2 }]}
                      value={newMemberName}
                      onChangeText={setNewMemberName}
                      placeholder="Full name"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="words"
                      autoFocus
                    />
                    <TextInput
                      style={[t.input, { width: 68 }]}
                      value={newMemberAge}
                      onChangeText={setNewMemberAge}
                      placeholder="Age"
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={t.saveToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={t.saveToggleLabel}>Save to Traveler Library</Text>
                      <Text style={t.saveToggleSub}>Reuse this person on future trips</Text>
                    </View>
                    <Switch
                      value={newMemberSave}
                      onValueChange={setNewMemberSave}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                  <TouchableOpacity style={t.addPersonBtn} onPress={() => addNewMember(fam.id)}>
                    <Text style={t.addPersonBtnText}>Add to {fam.name}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      ))}

      {/* ── Inline group picker ───────────────────────── */}
      {showGroupPicker && (
        <View style={t.pickerPanel}>
          <View style={t.pickerHeader}>
            <Text style={t.pickerTitle}>Saved Groups</Text>
            <TouchableOpacity onPress={() => setShowGroupPicker(false)}>
              <Text style={t.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {groups.length === 0 ? (
            <Text style={t.emptyLib}>No saved groups yet. Create groups in the Travelers tab.</Text>
          ) : (
            groups.map(g => {
              const groupTvs = (g.travelerIds || [])
                .map(id => travelers.find(tv => tv.id === id)).filter(Boolean);
              const already = addedGroupIds.has(g.id);
              return (
                <View key={g.id} style={[t.groupPickerRow, already && { opacity: 0.5 }]}>
                  <View style={[t.colorDot, { backgroundColor: g.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={t.groupPickerName}>{g.name}</Text>
                    <Text style={t.groupPickerMembers}>
                      {groupTvs.map(tv => tv.name.split(' ')[0]).join(' · ') || 'No members'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[t.groupPickerBtn, already && { backgroundColor: colors.surface2 }]}
                    onPress={() => !already && addGroup(g)}
                    disabled={already}
                  >
                    <Text style={[t.groupPickerBtnText, already && { color: colors.muted }]}>
                      {already ? '✓ Added' : 'Add →'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ── New family inline form ─────────────────────── */}
      {showNewFamilyForm && (
        <View style={t.newFamilyForm}>
          <Text style={t.newFamilyTitle}>New Group Name</Text>
          <View style={t.newFamilyRow}>
            <TextInput
              style={[t.input, { flex: 1 }]}
              value={newFamilyName}
              onChangeText={setNewFamilyName}
              placeholder="e.g. Sharma Family, Team A..."
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createFamily}
            />
            <TouchableOpacity
              style={[t.createBtn, !newFamilyName.trim() && { opacity: 0.4 }]}
              onPress={createFamily}
              disabled={!newFamilyName.trim()}
            >
              <Text style={t.createBtnText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowNewFamilyForm(false); setNewFamilyName(''); }}>
              <Text style={t.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Primary CTAs ──────────────────────────────── */}
      {!showGroupPicker && !showNewFamilyForm && (
        <View style={t.ctaRow}>
          <TouchableOpacity
            style={t.ctaBtn}
            onPress={() => setShowGroupPicker(true)}
          >
            <Text style={t.ctaIcon}>📚</Text>
            <Text style={t.ctaLabel}>Add Saved Group</Text>
          </TouchableOpacity>
          <View style={t.ctaDivider} />
          <TouchableOpacity
            style={t.ctaBtn}
            onPress={() => setShowNewFamilyForm(true)}
          >
            <Text style={t.ctaIcon}>➕</Text>
            <Text style={t.ctaLabel}>New Family</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────
export default function NewTripModal({ visible, onClose, onCreated, onNeedAuth }) {
  const insets = useSafeAreaInsets();
  const {
    account, travelers, groups,
    createTrip, addFamilyFull, createTraveler, injectAIActivities,
    useAIPlannerCredit, upgradeToPro,
  } = useStore();

  // ── Wizard state ──────────────────────────────────────────────
  const [step, setStep]               = useState(1);
  const [mode, setMode]               = useState(null);
  const [name, setName]               = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Step 2 — list of families being built for this trip
  // Each: { id, name, color, groupId, members: [{ id, name, age, travelerId, saveToLibrary }] }
  const [tripFamilies, setTripFamilies] = useState([]);

  // Step 3
  const [generating, setGenerating] = useState(false);

  // ── Quota ─────────────────────────────────────────────────────
  const isPro = BYPASS_SUBSCRIPTION || account.plan === 'pro';
  const canUseAIPlanner = isPro || !account.aiPlannerUsed;

  // ── Reset ─────────────────────────────────────────────────────
  const reset = () => {
    setStep(1); setMode(null); setName(''); setDestination('');
    setStartDate(''); setEndDate('');
    setTripFamilies([]);
    setGenerating(false);
  };

  const handleClose = () => { reset(); onClose(); };
  const prevStep = () => setStep(s => s - 1);

  const nextStep = () => {
    if (step === 1) {
      if (!name.trim())        { showToast('Enter a trip name', '⚠️'); return; }
      if (!destination.trim()) { showToast('Enter a destination', '⚠️'); return; }
      if (!startDate || !endDate) { showToast('Set your travel dates', '⚠️'); return; }
      if (new Date(startDate) >= new Date(endDate)) { showToast('End date must be after start', '⚠️'); return; }
    }
    setStep(s => s + 1);
  };

  // ── Create trip ───────────────────────────────────────────────
  const handleCreate = () => {
    if (!mode) { showToast('Choose a planning mode', '⚠️'); return; }
    if (mode === 'ai' && !account.loggedIn) { handleClose(); onNeedAuth(); return; }

    const hasSelectedFamilies = tripFamilies.length > 0;
    const trip = createTrip({
      name, destination, startDate, endDate, mode,
      familyForms: [],
      skipDefaultFamily: hasSelectedFamilies,
    });

    // Persist new members flagged "Save to Library" and build families
    tripFamilies.forEach(fam => {
      const processedMembers = fam.members.map(m => {
        if (!m.travelerId && m.saveToLibrary) {
          const tvId = 'tv_' + uid();
          createTraveler({
            id: tvId, name: m.name, age: m.age || null,
            emoji: '👤', dietary: [], needs: [],
            pacePreference: 'moderate', interests: [], notes: '',
          });
          return { ...m, travelerId: tvId };
        }
        return m;
      });

      addFamilyFull(trip.id, {
        name: fam.name,
        color: fam.color,
        groupId: fam.groupId || null,
        members: processedMembers.map(m => ({
          name: m.name,
          age: m.age || 30,
          needs: [],
          travelerId: m.travelerId || null,
        })),
      });
    });

    if (mode === 'ai') {
      useAIPlannerCredit();
      setGenerating(true);
      setTimeout(() => {
        injectAIActivities(trip.id);
        setGenerating(false);
        reset();
        showToast('AI itinerary ready! 🤖', '✅');
        onCreated(trip);
      }, 2800);
    } else {
      reset();
      showToast(
        mode === 'expert' ? 'Trip created! Expert will reach out within 24 hrs 🧳' : 'Trip created! Start adding activities 🗺️',
        '✅',
      );
      onCreated(trip);
    }
  };

  const days = startDate && endDate
    ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1
    : 0;

  const totalTravelers = tripFamilies.reduce((sum, f) => sum + f.members.length, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.container, { paddingTop: insets.top }]}>

          {/* ── Header ───────────────────────────────── */}
          <View style={s.header}>
            <TouchableOpacity onPress={step > 1 ? prevStep : handleClose} style={s.headerBtn}>
              <Text style={s.backText}>{step > 1 ? '← Back' : 'Cancel'}</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>✈️ New Trip</Text>
            <View style={s.headerBtn} />
          </View>

          {/* ── Step indicator ───────────────────────── */}
          <View style={s.steps}>
            {[{ n: 1, label: 'Details' }, { n: 2, label: 'Travelers' }, { n: 3, label: 'Plan' }].map((st, idx) => (
              <React.Fragment key={st.n}>
                <View style={s.stepItem}>
                  <View style={[s.stepDot, step > st.n && s.stepDone, step === st.n && s.stepActive]}>
                    <Text style={[s.stepNum, step >= st.n && { color: '#fff' }]}>{st.n}</Text>
                  </View>
                  <Text style={[s.stepLabel, step === st.n && s.stepLabelActive, step > st.n && s.stepLabelDone]}>
                    {st.label}
                  </Text>
                </View>
                {idx < 2 && <View style={[s.stepLine, step > st.n && { backgroundColor: colors.green }]} />}
              </React.Fragment>
            ))}
          </View>

          {/* ── Generating overlay ───────────────────── */}
          {generating ? (
            <View style={s.generating}>
              <Text style={s.genIcon}>🤖</Text>
              <Text style={s.genTitle}>AI is Building Your Itinerary</Text>
              <Text style={s.genSub}>Analysing destinations, pacing for your travelers, estimating costs...</Text>
              <ActivityIndicator color={colors.ai} size="large" style={{ marginTop: 24 }} />
            </View>
          ) : (
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >

              {/* ══ STEP 1: Details ════════════════════════════ */}
              {step === 1 && (
                <>
                  <Text style={s.stepHint}>Tell us about your trip</Text>
                  <View style={s.formGroup}>
                    <Text style={s.label}>Trip Name *</Text>
                    <TextInput
                      style={s.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g. Bali Family Adventure"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="words"
                    />
                  </View>
                  <LocationSearchField
                    label="Destination *"
                    value={destination}
                    onSelect={setDestination}
                    placeholder="e.g. Bali, Indonesia"
                  />
                  <View style={s.formGroup}>
                    <Text style={s.label}>Travel Dates *</Text>
                    <TouchableOpacity style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
                      <Text style={s.dateBtnIcon}>📅</Text>
                      <Text style={[s.dateBtnText, (!startDate && !endDate) && s.datePlaceholder]}>
                        {startDate && endDate
                          ? `${startDate}  →  ${endDate}  (${days} day${days !== 1 ? 's' : ''})`
                          : 'Select start & end dates'}
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
                </>
              )}

              {/* ══ STEP 2: Travelers ══════════════════════════ */}
              {step === 2 && (
                <TravelerStep
                  travelers={travelers}
                  groups={groups}
                  tripFamilies={tripFamilies}
                  setTripFamilies={setTripFamilies}
                />
              )}

              {/* ══ STEP 3: Plan Trip ══════════════════════════ */}
              {step === 3 && (
                <>
                  <Text style={s.stepHint}>How would you like to plan this trip?</Text>

                  {/* Trip summary pill */}
                  <View style={s.summaryPill}>
                    <Text style={s.summaryText}>
                      📍 {destination}  ·  🗓 {days} day{days !== 1 ? 's' : ''}
                      {tripFamilies.length > 0 ? `  ·  👨‍👩‍👧 ${tripFamilies.length} group${tripFamilies.length !== 1 ? 's' : ''} · ${totalTravelers} traveler${totalTravelers !== 1 ? 's' : ''}` : ''}
                    </Text>
                  </View>

                  {MODES.map(m => {
                    const active = mode === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[s.modeCard, active && { borderColor: m.color, backgroundColor: m.color + '12' }]}
                        onPress={() => setMode(m.key)}
                        activeOpacity={0.75}
                      >
                        <View style={[s.modeIconWrap, active && { backgroundColor: m.color + '22' }]}>
                          <Text style={s.modeIcon}>{m.icon}</Text>
                        </View>
                        <View style={s.modeTextBlock}>
                          <Text style={[s.modeLabel, active && { color: m.color }]}>{m.label}</Text>
                          <Text style={s.modeDesc}>{m.desc}</Text>
                        </View>
                        <View style={[s.modeRadio, active && { borderColor: m.color }]}>
                          {active && <View style={[s.modeRadioDot, { backgroundColor: m.color }]} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* AI gate — not logged in */}
                  {mode === 'ai' && !account.loggedIn && (
                    <View style={s.aiGate}>
                      <Text style={s.aiGateIcon}>🤖</Text>
                      <Text style={s.aiGateTitle}>AI Planner requires an account</Text>
                      <Text style={s.aiGateSub}>Sign up free — includes 1 AI trip plan + 3 AI trip reviews.</Text>
                      <TouchableOpacity style={s.aiGateBtn} onPress={() => { handleClose(); onNeedAuth(); }}>
                        <Text style={s.aiGateBtnText}>Create Free Account</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* AI gate — quota exhausted */}
                  {mode === 'ai' && account.loggedIn && !canUseAIPlanner && (
                    <View style={[s.aiGate, { borderColor: '#e17055' }]}>
                      <Text style={s.aiGateIcon}>🔒</Text>
                      <Text style={s.aiGateTitle}>Free AI Plan Used</Text>
                      <Text style={s.aiGateSub}>Upgrade to Pro for unlimited AI planning.</Text>
                      <TouchableOpacity
                        style={[s.aiGateBtn, { backgroundColor: colors.ai }]}
                        onPress={() => { upgradeToPro(); showToast('Upgraded to Pro! 🎉', '✅'); }}
                      >
                        <Text style={s.aiGateBtnText}>Upgrade to Pro — {PRO_MONTHLY_PRICE}/mo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setMode('manual')} style={{ marginTop: 10 }}>
                        <Text style={{ ...typography.smallBold, color: colors.muted }}>Continue with Manual →</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* AI quota info */}
                  {mode === 'ai' && account.loggedIn && canUseAIPlanner && (
                    <View style={s.quotaInfo}>
                      <Text style={s.quotaText}>
                        {isPro ? '✅ Pro — unlimited AI plans' : '🎁 1 free AI plan remaining'}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {/* ── Footer ───────────────────────────────── */}
          {!generating && (
            <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
              {step < 3 ? (
                <TouchableOpacity style={s.primaryBtn} onPress={nextStep}>
                  <Text style={s.primaryBtnText}>
                    {step === 2 && tripFamilies.length > 0
                      ? `Next — ${tripFamilies.length} group${tripFamilies.length !== 1 ? 's' : ''} added →`
                      : step === 2 ? 'Skip for now →' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    s.primaryBtn,
                    !mode && { backgroundColor: colors.border },
                    mode === 'ai' && { backgroundColor: colors.ai },
                    mode === 'manual' && { backgroundColor: colors.green },
                    mode === 'expert' && { backgroundColor: colors.expert },
                  ]}
                  onPress={handleCreate}
                  disabled={!mode}
                >
                  <Text style={s.primaryBtnText}>
                    {mode === 'ai' ? '🤖 Generate AI Itinerary'
                      : mode === 'expert' ? '🧳 Request Expert Plan'
                      : '🗺️ Create Trip'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main modal styles ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn: { flex: 1 },
  backText: { ...typography.bodyBold, color: colors.primary },
  headerTitle: { flex: 2, ...typography.h4, color: colors.text, textAlign: 'center' },

  steps: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  stepItem: { flex: 3, alignItems: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepDone:   { backgroundColor: colors.green,   borderColor: colors.green },
  stepActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum:    { fontSize: 13, fontWeight: '700', color: colors.muted },
  stepLine:   { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4, marginTop: 13 },
  stepLabel:  { fontSize: 10, fontWeight: '600', color: colors.muted, marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.2, textAlign: 'center' },
  stepLabelActive: { color: colors.primary },
  stepLabelDone:   { color: colors.green },

  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  stepHint: { ...typography.small, color: colors.muted, marginBottom: spacing.lg, lineHeight: 18 },

  formGroup: { marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: colors.surface },
  dateBtnIcon: { fontSize: 16 },
  dateBtnText: { ...typography.small, color: colors.text, fontWeight: '600', flex: 1 },
  datePlaceholder: { color: colors.muted, fontWeight: '400' },

  summaryPill: { backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: 8, alignSelf: 'flex-start', marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  summaryText: { ...typography.small, color: colors.text, fontWeight: '600' },

  modeCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 14 },
  modeIconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  modeIcon: { fontSize: 26 },
  modeTextBlock: { flex: 1 },
  modeLabel: { ...typography.bodyBold, color: colors.text },
  modeDesc: { ...typography.small, color: colors.muted, marginTop: 2, lineHeight: 16 },
  modeRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  modeRadioDot: { width: 10, height: 10, borderRadius: 5 },

  aiGate: { backgroundColor: colors.aiLight, borderWidth: 2, borderColor: colors.ai, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.md },
  aiGateIcon: { fontSize: 36, marginBottom: 8 },
  aiGateTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 4 },
  aiGateSub: { ...typography.small, color: colors.muted, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  aiGateBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 11 },
  aiGateBtnText: { color: '#fff', fontWeight: '700' },

  quotaInfo: { backgroundColor: colors.greenLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.green },
  quotaText: { ...typography.small, color: colors.green, fontWeight: '600', textAlign: 'center' },

  generating: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  genIcon:  { fontSize: 56, marginBottom: 16 },
  genTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: 8 },
  genSub:   { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 22 },

  footer: { padding: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── Step 2 styles ─────────────────────────────────────────────────
const t = StyleSheet.create({
  sectionHeader: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h4, color: colors.text },
  sectionSub: { ...typography.small, color: colors.muted, marginTop: 3, lineHeight: 17 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 6, textAlign: 'center' },
  emptyBody: { ...typography.small, color: colors.muted, textAlign: 'center', lineHeight: 19 },

  // Family card
  familyCard: {
    backgroundColor: '#fff', borderLeftWidth: 4, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, overflow: 'hidden', ...shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  colorDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  familyName: { ...typography.bodyBold, color: colors.text, flex: 1 },
  libraryBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  libraryBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  removeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.muted, fontSize: 12, fontWeight: '700' },

  // Member chips
  memberChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  chipAvatar: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chipName: { ...typography.caption, color: colors.text, fontWeight: '700' },
  chipAge: { ...typography.tiny, color: colors.muted },
  chipRemove: { color: colors.muted, fontSize: 9, marginLeft: 2, fontWeight: '700' },

  // Add member button
  addMemberBtn: { paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  addMemberText: { ...typography.smallBold, color: colors.primary },

  // Member adder
  memberAdder: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 },
  tabToggle: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.primary, backgroundColor: '#fff' },
  tabBtnText: { ...typography.caption, color: colors.muted, fontWeight: '700' },
  tabBtnTextActive: { color: colors.primary },

  // Library tab
  emptyLib: { ...typography.small, color: colors.muted, padding: spacing.lg, textAlign: 'center', lineHeight: 18 },
  libraryList: {},
  libRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  libRowDone: { opacity: 0.55 },
  libAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  libAvatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  libName: { ...typography.bodyBold, color: colors.text },
  libMeta: { ...typography.small, color: colors.muted, marginTop: 1 },
  addTag: { ...typography.smallBold, color: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.full },
  addedTag: { ...typography.tiny, color: colors.green, fontWeight: '700' },

  // New person tab
  newPersonForm: { padding: spacing.md },
  newPersonRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: '#fff' },
  saveToggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#fff', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  saveToggleLabel: { ...typography.smallBold, color: colors.text },
  saveToggleSub: { ...typography.tiny, color: colors.muted, marginTop: 2 },
  addPersonBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  addPersonBtnText: { color: '#fff', fontWeight: '700' },

  // Group picker panel
  pickerPanel: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden', ...shadow.sm },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  pickerTitle: { ...typography.bodyBold, color: colors.text },
  pickerClose: { color: colors.muted, fontSize: 16, fontWeight: '700', padding: 4 },
  groupPickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  groupPickerName: { ...typography.bodyBold, color: colors.text },
  groupPickerMembers: { ...typography.small, color: colors.muted, marginTop: 1 },
  groupPickerBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  groupPickerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // New family form
  newFamilyForm: { backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', marginBottom: spacing.md },
  newFamilyTitle: { ...typography.smallBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm },
  newFamilyRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  createBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  createBtnText: { color: '#fff', fontWeight: '700' },
  cancelText: { ...typography.small, color: colors.muted, paddingHorizontal: 6 },

  // CTAs
  ctaRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.lg, overflow: 'hidden', marginTop: spacing.md },
  ctaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  ctaDivider: { width: 1.5, backgroundColor: colors.primary },
  ctaIcon: { fontSize: 16 },
  ctaLabel: { ...typography.bodyBold, color: colors.primary },
});
