/**
 * AddActivityModal.js
 *
 * Compact, family-first activity editor.
 *
 * Key design decisions:
 *   - 4×2 type grid — all 8 types visible without scrolling
 *   - Transport subtypes: Flight / Drive / Train / Ship
 *   - Cost mode: Per Person  OR  Per Family (the USP)
 *   - No accessibility field (handled by AI agents, not manual entry)
 *   - Notes + Reminder at the bottom
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Dimensions, FlatList, ActivityIndicator,
} from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { uid, defaultNightsFor } from '../utils/helpers';
import { estimateDuration, formatDuration } from '../utils/tripValidator';
import { geocodeAddress, reverseGeocode } from '../utils/places';
import { APP_NAME } from '../config';
import { SLOTS, getSlotKey, getSuggestedTime, getSlotCount } from '../utils/slots';
import { ModalHeader } from '../components/ui';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE_GAP = 8;
const TILE_W   = Math.floor((SCREEN_W - spacing.xxl * 2 - TILE_GAP * 3) / 4);

// ─── Activity type grid (4 per row) ──────────────────────────────────────────
const TILES = [
  { type: 'transport', subtype: 'flight', icon: '✈️', label: 'Flight',   color: '#3b82f6' },
  { type: 'transport', subtype: 'car',    icon: '🚗', label: 'Drive',    color: '#3b82f6' },
  { type: 'transport', subtype: 'train',  icon: '🚂', label: 'Train',    color: '#3b82f6' },
  { type: 'transport', subtype: 'ship',   icon: '🚢', label: 'Ship',     color: '#3b82f6' },
  { type: 'stay',      subtype: null,     icon: '🏨', label: 'Stay',     color: '#8b5cf6' },
  { type: 'food',      subtype: null,     icon: '🍽️', label: 'Meal',     color: '#f97316' },
  { type: 'activity',  subtype: null,     icon: '🎯', label: 'Activity', color: '#10b981' },
  { type: 'transport', subtype: 'pitstop', icon: '⛽', label: 'Pit Stop', color: '#3b82f6' },
];

function tileKey(t) { return `${t.type}:${t.subtype || ''}` ; }

// The 5 transport sub-modes collapse under ONE primary "Transport" tile, so the
// top row is the 4 mental categories of a trip (Activity/Meal/Stay/Transport) and
// the modes (✈️🚗🚂🚢⛽) reveal inline only when Transport is chosen.
const TRANSPORT_MODES = TILES.filter(t => t.type === 'transport');
const PRIMARY_TYPES = [
  TILES.find(t => t.type === 'activity'),
  TILES.find(t => t.type === 'food'),
  TILES.find(t => t.type === 'stay'),
  { type: 'transport', subtype: 'car', icon: '🚗', label: 'Transport', color: '#3b82f6' },
];

// ─── Outlook-style time picker ────────────────────────────────────────────────
const SLOT_H = 44;
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

function TimePickerInput({ value, onChange }) {
  const [open, setOpen]   = useState(false);
  const [draft, setDraft] = useState(value || '09:00');
  const listRef           = useRef(null);

  useEffect(() => { setDraft(value || '09:00'); }, [value]);

  // Auto-insert colon inside the picker input: "0930" → "09:30"
  const handleDraftChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setDraft(digits.length <= 2 ? digits : digits.slice(0, 2) + ':' + digits.slice(2));
  };

  // Clamp to valid HH:MM and commit
  const commitDraft = (d = draft) => {
    const [hStr, mStr] = d.split(':');
    const h = Math.min(23, Math.max(0, parseInt(hStr) || 0));
    const m = Math.min(59, Math.max(0, parseInt(mStr) || 0));
    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setDraft(formatted);
    onChange(formatted);
    return formatted;
  };

  const handleOpen = () => {
    setOpen(true);
    setDraft(value || '09:00');
    const idx = TIME_SLOTS.indexOf(value);
    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, (idx >= 0 ? idx : 18) - 2) * SLOT_H,
        animated: false,
      });
    }, 60);
  };

  const handleSelect = (slot) => { onChange(slot); setDraft(slot); setOpen(false); };
  const handleDone   = () => { commitDraft(); setOpen(false); };

  return (
    <>
      {/* ── Display row — entire row tappable ── */}
      <TouchableOpacity style={tp.row} onPress={handleOpen} activeOpacity={0.75}>
        <Text style={tp.clock}>🕐</Text>
        <Text style={[tp.displayText, !value && { color: colors.muted }]}>
          {value || '09:00'}
        </Text>
        <Text style={tp.chevron}>▾</Text>
      </TouchableOpacity>

      {/* ── Slot picker ── */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={tp.overlay} activeOpacity={1} onPress={handleDone}>
          <View style={tp.card} onStartShouldSetResponder={() => true}>

            {/* Custom time input at top of picker */}
            <View style={tp.cardHeader}>
              <Text style={tp.cardTitle}>Time</Text>
              <View style={tp.customRow}>
                <TextInput
                  style={tp.customInput}
                  value={draft}
                  onChangeText={handleDraftChange}
                  onBlur={() => commitDraft()}
                  keyboardType="number-pad"
                  maxLength={5}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.muted}
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={handleDone}
                />
                <TouchableOpacity onPress={handleDone} style={tp.doneBtn}>
                  <Text style={tp.cardDone}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Slot list */}
            <FlatList
              ref={listRef}
              data={TIME_SLOTS}
              keyExtractor={item => item}
              getItemLayout={(_, index) => ({ length: SLOT_H, offset: SLOT_H * index, index })}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: SLOT_H * 6.5 }}
              renderItem={({ item }) => {
                const sel = item === value;
                return (
                  <TouchableOpacity
                    style={[tp.slot, sel && tp.slotSel]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[tp.slotText, sel && tp.slotSelText]}>{item}</Text>
                    {sel && <Text style={tp.slotCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Duration picker ──────────────────────────────────────────────────────────
// Common duration slots shown in the picker list
const DURATION_SLOTS = [
  { mins: 0,    label: 'Auto' },
  { mins: 15,   label: '15 min' },
  { mins: 30,   label: '30 min' },
  { mins: 45,   label: '45 min' },
  { mins: 60,   label: '1h' },
  { mins: 90,   label: '1h 30min' },
  { mins: 120,  label: '2h' },
  { mins: 150,  label: '2h 30min' },
  { mins: 180,  label: '3h' },
  { mins: 240,  label: '4h' },
  { mins: 300,  label: '5h' },
  { mins: 360,  label: '6h' },
  { mins: 420,  label: '7h' },
  { mins: 480,  label: '8h' },
  { mins: 600,  label: '10h' },
  { mins: 720,  label: '12h' },
  { mins: 840,  label: '14h' },
  { mins: 960,  label: '16h' },
  { mins: 1080, label: '18h' },
  { mins: 1200, label: '20h' },
  { mins: 1440, label: '24h' },
  { mins: 1680, label: '28h' },
  { mins: 1800, label: '30h' },
  { mins: 2160, label: '36h' },
  { mins: 2880, label: '48h' },
];

function formatDurDisplay(mins) {
  if (!mins) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function DurationPickerInput({ value, onChange, autoLabel }) {
  const [open, setOpen]       = useState(false);
  const [draftH, setDraftH]   = useState('');
  const [draftM, setDraftM]   = useState('');
  const listRef               = useRef(null);

  const displayLabel = value > 0 ? formatDurDisplay(value) : null;

  const handleOpen = () => {
    setOpen(true);
    setDraftH(value > 0 ? String(Math.floor(value / 60)) : '');
    setDraftM(value > 0 ? String(value % 60) : '');
    const idx = DURATION_SLOTS.findIndex(s => s.mins === value);
    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, (idx >= 0 ? idx : 0)) * SLOT_H,
        animated: false,
      });
    }, 60);
  };

  const commitCustom = () => {
    const h = parseInt(draftH) || 0;
    const m = Math.min(59, parseInt(draftM) || 0);
    const total = h * 60 + m;
    onChange(total > 0 ? total : 0);
    setOpen(false);
  };

  const handleSelect = (mins) => { onChange(mins); setOpen(false); };

  return (
    <>
      <TouchableOpacity style={tp.row} onPress={handleOpen} activeOpacity={0.75}>
        <Text style={tp.clock}>⏱</Text>
        <Text style={[tp.displayText, !displayLabel && { color: colors.muted }]}>
          {displayLabel || `Auto (${autoLabel})`}
        </Text>
        {displayLabel && (
          <TouchableOpacity
            onPress={() => onChange(0)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
          >
            <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700', marginRight: 4 }}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={tp.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={tp.overlay} activeOpacity={1} onPress={commitCustom}>
          <View style={tp.card} onStartShouldSetResponder={() => true}>

            {/* Custom H : M inputs */}
            <View style={tp.cardHeader}>
              <Text style={tp.cardTitle}>Duration</Text>
              <View style={tp.customRow}>
                <TextInput
                  style={[tp.customInput, { flex: 1 }]}
                  value={draftH}
                  onChangeText={v => setDraftH(v.replace(/\D/g, '').slice(0, 3))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  selectTextOnFocus
                />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.muted }}>h</Text>
                <TextInput
                  style={[tp.customInput, { width: 52 }]}
                  value={draftM}
                  onChangeText={v => setDraftM(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  selectTextOnFocus
                />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.muted }}>min</Text>
                <TouchableOpacity onPress={commitCustom} style={tp.doneBtn}>
                  <Text style={tp.cardDone}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Preset slots */}
            <FlatList
              ref={listRef}
              data={DURATION_SLOTS}
              keyExtractor={item => String(item.mins)}
              getItemLayout={(_, index) => ({ length: SLOT_H, offset: SLOT_H * index, index })}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: SLOT_H * 6.5 }}
              renderItem={({ item }) => {
                const sel = item.mins === value;
                return (
                  <TouchableOpacity
                    style={[tp.slot, sel && tp.slotSel]}
                    onPress={() => handleSelect(item.mins)}
                    activeOpacity={0.7}
                  >
                    <Text style={[tp.slotText, sel && tp.slotSelText]}>
                      {item.mins === 0 ? `Auto (${autoLabel})` : item.label}
                    </Text>
                    {sel && <Text style={tp.slotCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function findTile(type, subtype) {
  return TILES.find(t => t.type === type && t.subtype === (subtype || null))
      || TILES.find(t => t.type === type)
      || TILES[6]; // default: Activity
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function AddActivityModal({ visible, trip, currentDay, onClose, editActivity, defaultTime, seed }) {
  const { addActivity, updateActivity } = useStore();
  const isEdit = !!editActivity;

  // Type / subtype
  const [tile, setTile]           = useState(TILES[6]);  // Activity default

  // Core fields
  const [name, setName]           = useState('');
  const [nameTouched, setNameTouched] = useState(false);  // user typed their own → don't auto-fill from the type
  const [time, setTime]           = useState(defaultTime || '09:00');
  // timeLocked: an EXACT time the user picked (vs a soft slot suggestion) is a fixed
  // anchor "Plan my day" never moves. Picking a time via the time picker sets it;
  // choosing a slot pill clears it (slots are soft "around this time"). User-overridable.
  const [timeExplicit, setTimeExplicit] = useState(false);
  const pickExactTime = (t) => { setTime(t); setTimeExplicit(true); };
  const [arriveTime, setArriveTime] = useState('');
  const [detail, setDetail]       = useState('');

  // Scheduling (Add mode only) — which day(s) + which smart slot
  const [dayIdx, setDayIdx]       = useState(currentDay ?? 0);
  const [allDays, setAllDays]     = useState(false);
  const [slotKey, setSlotKey]     = useState(getSlotKey(defaultTime || '09:00'));


  // Cost
  const [costMode, setCostMode]   = useState('per_person'); // 'per_person' | 'per_family'
  const [costInput, setCostInput] = useState('');

  // Manual duration override (0 = use auto-estimate)
  const [durationMins, setDurationMins] = useState(0);

  // Meal slot for food (null = auto from opening hours when ✨ Arrange runs)
  const [meal, setMeal]           = useState(null);

  // Hotel nights (stay only) — drives lodgingForNight() coverage + day-routing anchors
  const [nights, setNights]       = useState(1);

  // Notes + Reminder
  const [memo, setMemo]           = useState('');
  const [reminder, setReminder]   = useState('');

  // Address + geocode (for Airbnb / off-Places stops → lat/lng for scheduling)
  const [address, setAddress]     = useState('');
  const [geo, setGeo]             = useState(null);     // {lat,lng} once located
  const [geoStatus, setGeoStatus] = useState('idle');   // idle | loading | ok | fail

  // Secondary fields (Details, Notes, Reminder) collapsed by default
  const [showMore, setShowMore]   = useState(false);

  // Seed fields on open
  useEffect(() => {
    if (!visible) return;
    if (editActivity) {
      setTile(findTile(editActivity.type, editActivity.subtype));
      setName(editActivity.name || '');
      setNameTouched(true);   // existing name — never auto-overwrite on a type change
      setTime(editActivity.time || '09:00');
      setTimeExplicit(!!editActivity.timeLocked);   // preserve an existing lock
      setArriveTime(editActivity.arriveTime || '');
      setDetail(editActivity.detail || '');
      setCostMode(editActivity.costMode || 'per_person');
      setCostInput(editActivity.costAmount > 0 ? String(editActivity.costAmount) : '');
      setMemo(editActivity.memo || '');
      setReminder(editActivity.reminder || '');
      setDurationMins(editActivity.durationMins > 0 ? editActivity.durationMins : 0);
      setMeal(editActivity.meal || null);
      setNights(editActivity.nights > 0 ? editActivity.nights : 1);
      setShowMore(!!(editActivity.detail || editActivity.memo || editActivity.reminder));
      setAddress(editActivity.address || '');
      const hasGeo = editActivity.lat != null && editActivity.lng != null;
      setGeo(hasGeo ? { lat: editActivity.lat, lng: editActivity.lng } : null);
      setGeoStatus(hasGeo ? 'ok' : 'idle');
    } else {
      // seed: { name?, address?, lat?, lng?, tile? } — from the Discover "add
      // manually" bridge (name only) OR a dropped map pin (lat/lng, maybe address).
      setTile(seed?.tile ? (findTile(seed.tile, null) || TILES[6]) : TILES[6]);
      setName(seed?.name || '');   // prefilled when opened from the Discover "add manually" bridge
      setNameTouched(!!seed?.name);   // a seeded name is the user's → don't clobber on a type change
      setTime(defaultTime || '09:00');
      setArriveTime('');
      setDetail('');
      setCostMode('per_person');
      setCostInput('');
      setDurationMins(0);
      setMeal(null);
      setNights(defaultNightsFor(trip, currentDay ?? 0));   // cover the rest of the trip by default
      setMemo('');
      setReminder('');
      setShowMore(false);
      setDayIdx(currentDay ?? 0);
      setAllDays(false);
      setSlotKey(getSlotKey(defaultTime || '09:00'));
      setAddress(seed?.address || '');
      const hasGeo = seed?.lat != null && seed?.lng != null;
      setGeo(hasGeo ? { lat: seed.lat, lng: seed.lng } : null);
      setGeoStatus(hasGeo ? 'ok' : 'idle');
    }
  }, [visible, editActivity, defaultTime, currentDay, seed]);

  // A dropped map pin arrives with coords but no address — fill it in for display.
  useEffect(() => {
    if (!visible || isEdit) return;
    if (seed?.lat != null && seed?.lng != null && !seed?.address) {
      reverseGeocode(seed.lat, seed.lng).then(a => { if (a) setAddress(a); }).catch(() => {});
    }
  }, [visible, seed, isEdit]);

  // Geocode the typed address → lat/lng so the stop schedules with the rest of the day.
  const locate = async () => {
    const q = address.trim();
    if (!q) return;
    setGeoStatus('loading');
    const r = await geocodeAddress(q);
    if (r) {
      setGeo({ lat: r.lat, lng: r.lng });
      setAddress(r.formattedAddress);
      setGeoStatus('ok');
    } else {
      setGeo(null);
      setGeoStatus('fail');
    }
  };

  // ── Cost calculations ──────────────────────────────────────────────────────
  const totalMembers  = trip.families.reduce((s, f) => s + f.members.length, 0);
  const familyCount   = trip.families.length;
  const avgFamilySize = familyCount > 0 ? totalMembers / familyCount : 1;
  const parsedCost    = parseFloat(costInput) || 0;

  // costPerPerson is always the per-person value stored in the activity
  const costPerPerson = parsedCost > 0
    ? costMode === 'per_person'
      ? parsedCost
      : costMode === 'per_family'
        ? parsedCost / avgFamilySize   // family cost → approximate per person
        : parsedCost / (totalMembers || 1) // total cost → divide by all members
    : 0;

  // Display hint
  const costHintText = parsedCost > 0 && (
    costMode === 'per_person'
      ? `${totalMembers} travellers → est. $${(parsedCost * totalMembers).toFixed(0)} total`
      : costMode === 'per_family'
        ? `${familyCount} famil${familyCount !== 1 ? 'ies' : 'y'} → est. $${(parsedCost * familyCount).toFixed(0)} total`
        : `Shared total · $${costPerPerson.toFixed(2)}/person across ${totalMembers} travellers`
  );

  const syncNote = trip.itineraryPushed
    ? isEdit ? '✅ Splitwise expense updates automatically'
              : parsedCost > 0 ? '✅ Will be added to Splitwise automatically' : null
    : null;

  // ── Duration ───────────────────────────────────────────────────────────────
  // Auto-estimate based on current name + type — shown in picker as "Auto (Xh)"
  const autoEstimateMins  = estimateDuration({ type: tile.type, subtype: tile.subtype, name, detail });
  const autoEstimateLabel = formatDuration(autoEstimateMins);
  // How much room this activity needs — drives smart placement + Full detection.
  const needMins = durationMins > 0 ? durationMins : autoEstimateMins;

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    // Name is never required — like Calendar/Reminders/Things, an un-named entry
    // still saves, defaulted from the type (+ place/time so a day of them stays
    // distinct). So the primary button is never disabled / never a silent dead-end.
    const place = address.trim().split(',')[0].trim();
    const finalName = name.trim() || (place ? `${tile.label} · ${place}` : `${tile.label} · ${time}`);
    const base = {
      type:         tile.type,
      subtype:      tile.subtype || null,
      name:         finalName,
      arriveTime:   tile.type === 'transport' && tile.subtype !== 'pitstop' && arriveTime ? arriveTime : null,
      durationMins: durationMins > 0 ? durationMins : null,
      meal:         tile.type === 'food' ? (meal || null) : null,
      nights:       tile.type === 'stay' ? Math.max(1, nights) : undefined,
      detail:       detail.trim(),
      costMode,
      costAmount:   parsedCost,
      costPerPerson,
      memo:         memo.trim() || null,
      reminder:     reminder.trim() || null,
      access:       '',
      address:      address.trim() || null,
      lat:          geo ? geo.lat : (isEdit ? (editActivity.lat ?? null) : null),
      lng:          geo ? geo.lng : (isEdit ? (editActivity.lng ?? null) : null),
    };

    if (isEdit) {
      updateActivity(trip.id, editActivity.id, { ...base, time, timeLocked: timeExplicit });
    } else if (allDays) {
      // Add to every day, smart-placing in the chosen slot so it fits each day → soft.
      (trip.days || []).forEach((_, i) => {
        const t = getSuggestedTime(trip, i, slotKey, needMins);
        addActivity(trip.id, i, { ...base, time: t, timeLocked: false, id: uid() });
      });
    } else {
      addActivity(trip.id, dayIdx, { ...base, time, timeLocked: timeExplicit, id: uid() });
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>

          <ModalHeader
            title={isEdit ? 'Edit Activity' : 'Add Activity'}
            onClose={onClose}
            onAction={handleSave}
            actionLabel={isEdit ? 'Save' : allDays ? `Add ×${(trip.days || []).length}` : 'Add'}
          />

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── Type — 4 categories; Transport expands its modes inline ── */}
            <Text style={s.sectionLabel}>TYPE</Text>
            <View style={s.tileGrid}>
              {PRIMARY_TYPES.map(p => {
                const active = p.type === 'transport' ? tile.type === 'transport' : tileKey(p) === tileKey(tile);
                return (
                  <TouchableOpacity
                    key={p.type}
                    style={[s.tile, active && { borderColor: p.color, backgroundColor: p.color + '18' }]}
                    onPress={() => {
                      // Transport keeps the last-picked mode (default Drive); the rest set their type.
                      const next = p.type === 'transport'
                        ? (tile.type === 'transport' ? tile : TILES.find(t => t.subtype === 'car'))
                        : p;
                      setTile(next);
                      // Prefill an editable name from the type so the field is satisfied without typing.
                      if (!nameTouched) setName(next.label);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={p.type === 'transport' ? 'Transport, choose a mode' : p.label}
                  >
                    <Text style={s.tileIcon}>{p.icon}</Text>
                    <Text style={[s.tileLabel, active && { color: p.color, fontWeight: '700' }]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Transport modes — revealed only when Transport is the chosen type */}
            {tile.type === 'transport' && (
              <View style={s.subTypeRow}>
                {TRANSPORT_MODES.map(t => {
                  const active = tileKey(t) === tileKey(tile);
                  return (
                    <TouchableOpacity
                      key={tileKey(t)}
                      style={[s.subTypeChip, active && { borderColor: t.color, backgroundColor: t.color + '18' }]}
                      onPress={() => { setTile(t); if (!nameTouched) setName(t.label); }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t.label}
                    >
                      <Text style={s.subTypeIcon}>{t.icon}</Text>
                      <Text style={[s.subTypeLabel, active && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Name ── (optional — defaults from the type if left blank) */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>
              NAME <Text style={s.optional}>(optional — we'll name it from the type)</Text>
            </Text>
            <TextInput
              style={s.nameInput}
              value={name}
              onChangeText={v => { setName(v); setNameTouched(true); }}
              placeholder={tile.type === 'transport' ? `e.g. ${tile.label} to Paris` : tile.type === 'stay' ? 'e.g. Marriott Downtown' : tile.type === 'food' ? 'e.g. Breakfast at hotel' : 'e.g. Visit Eiffel Tower'}
              placeholderTextColor={colors.muted}
              selectTextOnFocus
              returnKeyType="next"
            />

            {/* ── Nights (stay only) — sets which nights this hotel covers, so each
                   day knows where you sleep + where the next day's route starts ── */}
            {tile.type === 'stay' && (
              <>
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>
                  NIGHTS <Text style={s.optional}>(how many nights at this hotel)</Text>
                </Text>
                <View style={s.nightsRow}>
                  <TouchableOpacity style={s.nightsBtn} onPress={() => setNights(n => Math.max(1, n - 1))} activeOpacity={0.7}>
                    <Text style={s.nightsBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.nightsValue}>🌙 {nights} night{nights !== 1 ? 's' : ''}</Text>
                  <TouchableOpacity style={s.nightsBtn} onPress={() => setNights(n => n + 1)} activeOpacity={0.7}>
                    <Text style={s.nightsBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Day + smart When picker (Add mode only) ── */}
            {!isEdit && (trip.days || []).length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>DAY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayRow}>
                  {(trip.days || []).length > 1 && (
                    <TouchableOpacity
                      style={[s.dayBtn, s.dayBtnAll, allDays && s.dayBtnActive]}
                      onPress={() => setAllDays(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.dayBtnLabel, allDays && s.dayBtnLabelActive]}>🗓 ALL</Text>
                      <Text style={[s.dayBtnDate, allDays && { color: colors.primary }]}>{(trip.days || []).length} days</Text>
                    </TouchableOpacity>
                  )}
                  {(trip.days || []).map((d, i) => {
                    const active = !allDays && dayIdx === i;
                    return (
                      <TouchableOpacity
                        key={d.date || i}
                        style={[s.dayBtn, active && s.dayBtnActive]}
                        onPress={() => {
                          setAllDays(false);
                          setDayIdx(i);
                          setTime(getSuggestedTime(trip, i, slotKey, needMins));
                          setTimeExplicit(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.dayBtnLabel, active && s.dayBtnLabelActive]}>{d.label}</Text>
                        <Text style={[s.dayBtnDate, active && { color: colors.primary }]}>{d.date?.slice(5)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>WHEN</Text>
                {/* One compact pill row (was a 2×2 grid). The selected slot's smart
                    time + fullness show on the meta line below; others carry a
                    fullness dot. Tapping still sets the gap-aware suggested time. */}
                <View style={s.slotPillRow}>
                  {SLOTS.map(slot => {
                    const count    = allDays ? 0 : getSlotCount(trip, dayIdx, slot.key);
                    const suggested= allDays ? slot.defaultTime : getSuggestedTime(trip, dayIdx, slot.key, needMins);
                    const isActive = slotKey === slot.key;
                    const dotColor = allDays ? null : count === 0 ? '#22c55e' : count <= 2 ? '#86efac' : '#fb923c';
                    return (
                      <TouchableOpacity
                        key={slot.key}
                        style={[s.slotPill, isActive && s.slotPillActive]}
                        onPress={() => { setSlotKey(slot.key); setTime(suggested); setTimeExplicit(false); }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={allDays
                          ? `${slot.label}, around ${slot.defaultTime}`
                          : `${slot.label}, suggested ${suggested}, ${count === 0 ? 'open' : `${count} ${count === 1 ? 'activity' : 'activities'} planned`}`}
                      >
                        <Text style={s.slotPillEmoji}>{slot.emoji}</Text>
                        <Text style={[s.slotPillLabel, isActive && { color: colors.primary, fontWeight: '800' }]} numberOfLines={1}>{slot.label}</Text>
                        {dotColor && !isActive && <View style={[s.slotDot, { backgroundColor: dotColor }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {(() => {
                  const lbl = SLOTS.find(sl => sl.key === slotKey)?.label || '';
                  if (allDays) return <Text style={s.slotPillMeta}>~{SLOTS.find(sl => sl.key === slotKey)?.defaultTime} in {lbl.toLowerCase()} each day</Text>;
                  const c = getSlotCount(trip, dayIdx, slotKey);
                  return <Text style={s.slotPillMeta}>{lbl} · Add at {getSuggestedTime(trip, dayIdx, slotKey, needMins)} · {c === 0 ? 'Open' : `${c} ${c === 1 ? 'activity' : 'activities'}`}</Text>;
                })()}
                {allDays && (
                  <Text style={s.allDaysHint}>
                    Adds “{name.trim() || 'this activity'}” to all {(trip.days || []).length} days at the best open time in {SLOTS.find(sl => sl.key === slotKey)?.label?.toLowerCase()} each day.
                  </Text>
                )}
              </>
            )}

            {/* ── Departs + Arrives ── (transport essentials; the generic TIME
                   fine-tune + DURATION live under "+ Details" — the slot already
                   set a smart time and the duration auto-estimates). */}
            {!allDays && tile.type === 'transport' && tile.subtype !== 'pitstop' && (
              <View style={s.inlineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionLabel}>DEPARTS</Text>
                  <TimePickerInput value={time} onChange={pickExactTime} />
                </View>
                <View style={s.arrowSep}>
                  <Text style={s.arrowSepText}>→</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionLabel}>
                    ARRIVES <Text style={s.optional}>(local)</Text>
                  </Text>
                  <TimePickerInput value={arriveTime || ''} onChange={setArriveTime} />
                  {!!arriveTime && arriveTime < time && (
                    <Text style={s.nextDayHint}>🌙 Arrives next day</Text>
                  )}
                </View>
              </View>
            )}

            {/* ── Time ── EDIT mode has no WHEN slot picker, so the time control
                   stays above the fold here (Add mode sets it via the slot, and
                   keeps the fine-tune under "+ Details"). */}
            {isEdit && !(tile.type === 'transport' && tile.subtype !== 'pitstop') && (
              <View style={s.inlineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionLabel}>TIME</Text>
                  <TimePickerInput value={time} onChange={pickExactTime} />
                </View>
              </View>
            )}

            {/* ── Meal (food only) — auto from opening hours, or pin it ── */}
            {tile.type === 'food' && (
              <>
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>MEAL</Text>
                <View style={s.mealRow}>
                  {[{ k: null, l: 'Auto' }, { k: 'breakfast', l: '🍳 Breakfast' }, { k: 'lunch', l: '🥪 Lunch' }, { k: 'dinner', l: '🍽️ Dinner' }].map(m => {
                    const active = meal === m.k;
                    return (
                      <TouchableOpacity
                        key={m.l}
                        style={[s.mealBtn, active && s.mealBtnActive]}
                        onPress={() => setMeal(m.k)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.mealBtnText, active && s.mealBtnTextActive]}>{m.l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.mealHint}>
                  {meal ? `Pinned to ${meal} — ✨ Arrange keeps it there.` : 'Auto picks breakfast/lunch/dinner from the place’s opening hours.'}
                </Text>
              </>
            )}

            {/* ── Cost ── */}
            <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>COST</Text>

            {/* Cost mode toggle */}
            <View style={s.costModeRow}>
              <TouchableOpacity
                style={[s.costModeBtn, costMode === 'per_person' && s.costModeBtnActive]}
                onPress={() => setCostMode('per_person')}
              >
                <Text style={[s.costModeBtnText, costMode === 'per_person' && s.costModeBtnTextActive]}>
                  👤 Per Person
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costModeBtn, costMode === 'per_family' && s.costModeBtnActive]}
                onPress={() => setCostMode('per_family')}
              >
                <Text style={[s.costModeBtnText, costMode === 'per_family' && s.costModeBtnTextActive]}>
                  👨‍👩‍👧 Per Family
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costModeBtn, costMode === 'total' && s.costModeBtnActiveTotal]}
                onPress={() => setCostMode('total')}
              >
                <Text style={[s.costModeBtnText, costMode === 'total' && s.costModeBtnTextActiveTotal]}>
                  💰 Total
                </Text>
              </TouchableOpacity>
            </View>

            {/* Cost amount */}
            <View style={s.costInputWrap}>
              <Text style={s.costCurrency}>$</Text>
              <TextInput
                style={s.costInput}
                value={costInput}
                onChangeText={setCostInput}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              <Text style={s.costSuffix}>
                {costMode === 'per_person' ? '/ person' : costMode === 'per_family' ? '/ family' : 'total'}
              </Text>
            </View>

            {/* Cost hint */}
            {!!costHintText && (
              <View style={s.costHint}>
                <Text style={s.costHintText}>📊 {costHintText}</Text>
                {costMode === 'per_family' && (
                  <Text style={s.costHintSub}>Each family pays equally — the {APP_NAME} moat ✦</Text>
                )}
                {costMode === 'total' && (
                  <Text style={s.costHintSub}>Total shared cost — ideal for Airbnbs, vans, group tickets ✦</Text>
                )}
              </View>
            )}

            {/* Splitwise sync */}
            {!!syncNote && (
              <View style={s.syncNote}>
                <Text style={s.syncNoteText}>{syncNote}</Text>
              </View>
            )}

            {/* ── Details toggle ── */}
            <TouchableOpacity
              style={s.moreToggle}
              onPress={() => setShowMore(v => !v)}
              activeOpacity={0.7}
            >
              <View style={s.moreLine} />
              <Text style={s.moreToggleText}>
                {showMore ? '− Less' : `+ Details${detail || memo || reminder || address || durationMins ? ' ·  filled' : ''}`}
              </Text>
              <View style={s.moreLine} />
            </TouchableOpacity>

            {/* ── Secondary fields (collapsed by default) ── */}
            {showMore && (
              <>
                {/* Address → geocode (for Airbnb / off-map stops) — non-transport */}
                {tile.type !== 'transport' && (
                  <>
                    <Text style={[s.sectionLabel, { marginTop: spacing.sm }]}>
                      ADDRESS <Text style={s.optional}>(Airbnb / off-map — locates it for scheduling)</Text>
                    </Text>
                    <View style={s.addrRow}>
                      <TextInput
                        style={s.addrInput}
                        value={address}
                        onChangeText={t => { setAddress(t); setGeo(null); setGeoStatus('idle'); }}
                        placeholder="123 River Rd, Wisconsin Dells…"
                        placeholderTextColor={colors.muted}
                        returnKeyType="search"
                        onSubmitEditing={locate}
                      />
                      <TouchableOpacity
                        style={[s.addrFind, geoStatus === 'ok' && s.addrFindOk]}
                        onPress={locate}
                        disabled={geoStatus === 'loading' || !address.trim()}
                        activeOpacity={0.85}
                      >
                        {geoStatus === 'loading'
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={s.addrFindText}>{geoStatus === 'ok' ? '✓ Located' : 'Find'}</Text>}
                      </TouchableOpacity>
                    </View>
                    {geoStatus === 'ok' && (
                      <Text style={s.addrOk}>📍 Pinned — this stop schedules with the rest of the day.</Text>
                    )}
                    {geoStatus === 'fail' && (
                      <Text style={s.addrFail}>Couldn't find that address — try a fuller one (street, city).</Text>
                    )}
                  </>
                )}

                {/* Time fine-tune (Add mode, non-transport; Edit shows TIME above the
                    fold since it has no slot picker; transport sets Departs/Arrives) */}
                {!isEdit && !allDays && !(tile.type === 'transport' && tile.subtype !== 'pitstop') && (
                  <View style={[s.inlineRow, { marginTop: spacing.lg }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sectionLabel}>TIME <Text style={s.optional}>(fine-tune)</Text></Text>
                      <TimePickerInput value={time} onChange={pickExactTime} />
                    </View>
                  </View>
                )}

                {/* Duration — auto-estimates by type; override here if needed */}
                <View style={[s.inlineRow, { marginTop: spacing.lg }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sectionLabel}>DURATION</Text>
                    <DurationPickerInput
                      value={durationMins}
                      onChange={setDurationMins}
                      autoLabel={autoEstimateLabel}
                    />
                  </View>
                </View>

                {/* Details */}
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>DETAILS <Text style={s.optional}>(optional)</Text></Text>
                <TextInput
                  style={s.detailInput}
                  value={detail}
                  onChangeText={setDetail}
                  placeholder="Booking ref, meeting point, what to expect…"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />

                {/* Notes */}
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>NOTES <Text style={s.optional}>(personal)</Text></Text>
                <TextInput
                  style={s.detailInput}
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="Pack sunscreen, book tickets in advance…"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />

                {/* Reminder */}
                <Text style={[s.sectionLabel, { marginTop: spacing.lg }]}>REMINDER <Text style={s.optional}>(optional)</Text></Text>
                <View style={s.reminderWrap}>
                  <Text style={s.reminderIcon}>🔔</Text>
                  <TextInput
                    style={s.reminderInput}
                    value={reminder}
                    onChangeText={setReminder}
                    placeholder="Book 2 weeks ahead · Check passport…"
                    placeholderTextColor={colors.muted}
                    returnKeyType="done"
                  />
                </View>
              </>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── TimePickerInput styles ───────────────────────────────────────────────────
const tp = StyleSheet.create({
  // ── Display row (entire row = tap target) ──
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#fff', borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  clock:       { fontSize: 16 },
  displayText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  chevron:     { fontSize: 14, color: colors.muted, fontWeight: '700' },

  // ── Picker overlay + card ──
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    overflow: 'hidden', ...shadow.sm,
  },

  // Picker header: title + custom HH:MM input + Done
  cardHeader: {
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface2, gap: spacing.sm,
  },
  cardTitle: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  customInput: {
    flex: 1, borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: 18, fontWeight: '700', color: colors.primary,
  },
  doneBtn:  { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  cardDone: { fontSize: 14, fontWeight: '800', color: colors.primary },

  // ── Slot rows ──
  slot: {
    height: SLOT_H, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  slotSel:     { backgroundColor: colors.primaryLight },
  slotText:    { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  slotSelText: { color: colors.primary, fontWeight: '800' },
  slotCheck:   { fontSize: 15, color: colors.primary, fontWeight: '800' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll:    { flex: 1 },
  content:   { padding: spacing.xxl, paddingBottom: 60 },

  sectionLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  optional:     { fontSize: 9, fontWeight: '400', color: '#c0c8d0', textTransform: 'none', letterSpacing: 0 },

  // Type grid
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: {
    width: TILE_W,
    height: TILE_W * 0.85,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    ...shadow.sm,
  },
  tileIcon:  { fontSize: 22 },
  tileLabel: { fontSize: 10, color: colors.muted, fontWeight: '600', textAlign: 'center' },
  // Transport sub-mode chips (revealed when Transport is the chosen type)
  subTypeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  subTypeChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full, backgroundColor: '#fff', paddingHorizontal: spacing.md, paddingVertical: 7 },
  subTypeIcon:  { fontSize: 14 },
  subTypeLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  // Compact WHEN slot pills (one row; replaced the tall 2×2 grid)
  slotPillRow:   { flexDirection: 'row', gap: spacing.sm },
  slotPill:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', paddingVertical: 8, minHeight: 52 },
  slotPillActive:{ borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primary + '12' },
  slotPillEmoji: { fontSize: 16 },
  slotPillLabel: { fontSize: 11, fontWeight: '700', color: colors.text },
  slotDot:       { width: 6, height: 6, borderRadius: 3, marginTop: 1 },
  slotPillMeta:  { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: spacing.sm, textAlign: 'center' },

  // Name
  nameInput: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    ...shadow.sm,
  },

  // Address → geocode row
  addrRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  addrInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.text,
    ...shadow.sm,
  },
  addrFind: {
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    minWidth: 76,
  },
  addrFindOk:   { backgroundColor: colors.success || '#10b981' },
  addrFindText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  addrOk:   { marginTop: spacing.xs, fontSize: 12, color: colors.success || '#10b981', fontWeight: '600' },
  addrFail: { marginTop: spacing.xs, fontSize: 12, color: colors.danger || '#ef4444', fontWeight: '600' },

  // Nights stepper (stay)
  nightsRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nightsBtn:    { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  nightsBtnText:{ fontSize: 22, fontWeight: '700', color: colors.accent, lineHeight: 24 },
  nightsValue:  { fontSize: 15, fontWeight: '700', color: colors.text, minWidth: 96, textAlign: 'center' },

  // Day picker (chips) + smart When slot grid
  dayRow:    { gap: spacing.sm, paddingBottom: spacing.xs },
  dayBtn:    { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: '#fff', alignItems: 'center', minWidth: 64 },
  dayBtnAll: { borderStyle: 'dashed' },
  dayBtnActive:      { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  dayBtnLabel:       { ...typography.caption, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  dayBtnLabelActive: { color: colors.primary },
  dayBtnDate:        { fontSize: 10, color: colors.muted, marginTop: 1 },
  slotGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotBtn:      { width: '48%', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: '#fff', padding: spacing.md, gap: 3 },
  // Fullness hint: more activities → warmer tint (green → light green → orange).
  slotFree:     { borderColor: '#22c55e', backgroundColor: '#dcfce7' },  // 0 — open
  slotSome:     { borderColor: '#86efac', backgroundColor: '#f0fdf4' },  // 1–2 — filling
  slotBusy:     { borderColor: '#fb923c', backgroundColor: '#fff7ed' },  // 3+ — busy
  slotBtnActive:{ borderColor: colors.primary, borderWidth: 2 },
  slotBtnTop:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotEmoji:    { fontSize: 16 },
  slotLabel:    { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  slotOwl:      { fontSize: 13, marginLeft: 'auto' },
  slotMeta:     { fontSize: 13, fontWeight: '700', color: colors.primary },
  slotCount:    { fontSize: 10, color: colors.muted },
  allDaysHint:  { fontSize: 11, color: '#9b6e00', fontWeight: '600', marginTop: spacing.sm, lineHeight: 16 },

  // Inline row
  inlineRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignItems: 'flex-start' },

  // Arrow separator between DEPARTS and ARRIVES
  arrowSep:     { paddingTop: 28, alignItems: 'center', paddingHorizontal: 2 },
  arrowSepText: { fontSize: 18, color: colors.muted, fontWeight: '600' },

  // Next-day hint below arrives picker
  nextDayHint: { fontSize: 10, color: '#d97706', fontWeight: '700', marginTop: 4, textAlign: 'center' },

  // Time
  timeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  timeIcon:  { fontSize: 16 },
  timeInput: { fontSize: 16, color: colors.text, fontWeight: '600', minWidth: 60 },

  // Detail / Memo
  detailInput: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.text,
    minHeight: 64,
    ...shadow.sm,
  },

  // Meal picker (food only)
  mealRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealBtn:           { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  mealBtnActive:     { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  mealBtnText:       { fontSize: 12, fontWeight: '600', color: colors.muted },
  mealBtnTextActive: { color: colors.primary, fontWeight: '800' },
  mealHint:          { fontSize: 11, color: colors.muted, marginTop: spacing.xs },

  // Cost mode toggle
  costModeRow:        { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  costModeBtn:        { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center' },
  costModeBtnActive:       { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  costModeBtnActiveTotal:  { borderColor: '#059669', backgroundColor: '#d1fae5' },
  costModeBtnText:         { fontSize: 12, fontWeight: '600', color: colors.muted },
  costModeBtnTextActive:   { color: colors.primary, fontWeight: '800' },
  costModeBtnTextActiveTotal: { color: '#059669', fontWeight: '800' },

  // Cost input
  costInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  costCurrency: { fontSize: 18, fontWeight: '700', color: colors.muted },
  costInput:    { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  costSuffix:   { fontSize: 13, color: colors.muted, fontWeight: '500' },

  // Cost hint
  costHint: {
    backgroundColor: colors.yellowLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#f0d080',
  },
  costHintText: { fontSize: 12, color: '#9b6e00', fontWeight: '600' },
  costHintSub:  { fontSize: 11, color: '#b8860b', marginTop: 2 },

  // Sync note
  syncNote: {
    backgroundColor: '#e8f5e9',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  syncNoteText: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },

  // More / Less toggle
  moreToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.xl, marginBottom: spacing.xs,
  },
  moreLine:       { flex: 1, height: 1, backgroundColor: colors.border },
  moreToggleText: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.3 },

  // Reminder
  reminderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  reminderIcon:  { fontSize: 16 },
  reminderInput: { flex: 1, fontSize: 14, color: colors.text },
});
