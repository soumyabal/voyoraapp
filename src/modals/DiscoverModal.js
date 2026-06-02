/**
 * DiscoverModal.js
 *
 * "Find nearby" activity discovery for manual planning.
 * Queries Google Places Text Search for the trip's destination,
 * shows tappable results, and adds them as activities in one tap.
 *
 * Reuses the same Places API pattern as ExperienceAgent.js.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, FlatList, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GOOGLE_PLACES_API_KEY } from '../config';
import useStore from '../store';
import { uid } from '../utils/helpers';
import { colors, spacing, radius, typography, shadow } from '../theme';

// ─── Category chips ───────────────────────────────────────────────
const CATEGORIES = [
  { key: 'attractions', label: '🏛️ Attractions', query: 'top tourist attractions and landmarks' },
  { key: 'food',        label: '🍽️ Restaurants', query: 'best restaurants' },
  { key: 'cafes',       label: '☕ Cafes',        query: 'cafes and coffee shops' },
  { key: 'nature',      label: '🌿 Nature',       query: 'parks nature reserves and outdoor activities' },
  { key: 'activities',  label: '🎡 Activities',   query: 'fun family activities and entertainment' },
  { key: 'shopping',    label: '🛍️ Shopping',    query: 'shopping centers markets and malls' },
  { key: 'hotels',      label: '🏨 Hotels',       query: 'highly rated hotels and resorts' },
];

// ─── Dietary filter chips ─────────────────────────────────────────
const FILTER_OPTS = [
  { key: 'vegetarian',  label: '🥦 Veg',       bias: 'vegetarian friendly' },
  { key: 'vegan',       label: '🌱 Vegan',      bias: 'vegan friendly' },
  { key: 'no-alcohol',  label: '🍺 No Alcohol', bias: 'non-alcoholic' },
  { key: 'gluten-free', label: '🌾 GF',         bias: 'gluten free' },
];

// ─── Dietary bias helpers ─────────────────────────────────────────
function getDietaryBias(families = []) {
  const all = families.flatMap(f => f.dietary || []);
  const biases = [];
  if (all.includes('vegetarian') || all.includes('vegan')) biases.push('vegetarian friendly');
  if (all.includes('vegan'))       biases.push('vegan');
  if (all.includes('no-alcohol'))  biases.push('non-alcoholic options');
  if (all.includes('gluten-free')) biases.push('gluten free options');
  return biases.join(' ');
}

function getFilterBias(activeFilters) {
  return activeFilters.map(k => FILTER_OPTS.find(f => f.key === k)?.bias).filter(Boolean).join(' ');
}

// ─── Veg-friendly detection ───────────────────────────────────────
const VEG_NAME_RE = /vegetarian|vegan|veggie|plant.based|organic|salad|juice|smoothie|falafel/i;
const VEG_TYPES   = new Set(['cafe', 'bakery', 'juice_bar', 'health', 'natural_goods']);

function isVegFriendly(place) {
  if (VEG_NAME_RE.test(place.name)) return true;
  return (place.types || []).some(t => VEG_TYPES.has(t));
}

// ─── Price level → cost per person ───────────────────────────────
const PRICE_TO_COST = {
  PRICE_LEVEL_FREE:           0,
  PRICE_LEVEL_INEXPENSIVE:    15,
  PRICE_LEVEL_MODERATE:       35,
  PRICE_LEVEL_EXPENSIVE:      75,
  PRICE_LEVEL_VERY_EXPENSIVE: 150,
};

// ─── Place types → activity type ─────────────────────────────────
function inferActivityType(types = []) {
  if (types.some(t => ['restaurant', 'food', 'meal_takeaway', 'bakery', 'cafe'].includes(t))) return 'food';
  if (types.some(t => ['lodging', 'hotel', 'resort_hotel', 'motel'].includes(t))) return 'stay';
  return 'activity';
}

// ─── Places API fetch ─────────────────────────────────────────────
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.accessibilityOptions',
  'places.websiteUri',
  'places.location',
].join(',');

async function fetchPlaces(textQuery) {
  if (!GOOGLE_PLACES_API_KEY) return [];
  try {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, maxResultCount: 20 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.places ?? []).map(p => {
      const place = {
        name:          p.displayName?.text ?? 'Place',
        address:       p.formattedAddress ?? '',
        rating:        p.rating ?? null,
        ratingCount:   p.userRatingCount ?? 0,
        costPerPerson: PRICE_TO_COST[p.priceLevel] ?? 0,
        types:         p.types ?? [],
        activityType:  inferActivityType(p.types ?? []),
        wheelchairOk:  p.accessibilityOptions?.wheelchairAccessibleEntrance ?? null,
        url:           p.websiteUri ?? '',
        lat:           p.location?.latitude ?? null,
        lng:           p.location?.longitude ?? null,
      };
      place.vegFriendly = isVegFriendly(place);
      return place;
    });
  } catch (e) {
    console.warn('[DiscoverModal] Places fetch error:', e.message);
    return [];
  }
}

// ─── Result card ──────────────────────────────────────────────────
function PlaceCard({ place, onAdd, added, lateStartGroup, defaultTime }) {
  const typeEmoji =
    place.activityType === 'food'  ? '🍽️' :
    place.activityType === 'stay'  ? '🏨' : '🎯';

  // Dim the "Add to Morning" affordance if group has late wakers and defaultTime is morning
  const isMorningSlot = !defaultTime || defaultTime < '12:00';
  const dimMorning    = lateStartGroup && isMorningSlot;

  return (
    <View style={[card.wrap, dimMorning && card.wrapDimmed]}>
      <View style={card.body}>
        <View style={card.nameRow}>
          <Text style={card.typeIcon}>{typeEmoji}</Text>
          <Text style={card.name} numberOfLines={2}>{place.name}</Text>
          {place.vegFriendly && (
            <View style={card.vegBadge}>
              <Text style={card.vegBadgeText}>🥦 Veg</Text>
            </View>
          )}
        </View>

        <View style={card.meta}>
          {place.rating != null && (
            <Text style={card.rating}>⭐ {place.rating.toFixed(1)}</Text>
          )}
          {place.costPerPerson > 0 && (
            <View style={card.costBadge}>
              <Text style={card.costText}>~${place.costPerPerson}/p</Text>
            </View>
          )}
          {place.costPerPerson === 0 && (
            <View style={[card.costBadge, { backgroundColor: '#dcfce7' }]}>
              <Text style={[card.costText, { color: '#15803d' }]}>Free</Text>
            </View>
          )}
          {place.wheelchairOk && (
            <Text style={card.badge}>♿</Text>
          )}
        </View>

        {!!place.address && (
          <Text style={card.address} numberOfLines={1}>📍 {place.address}</Text>
        )}
      </View>

      <TouchableOpacity
        style={[card.addBtn, added && card.addBtnDone, dimMorning && card.addBtnDimmed]}
        onPress={() => !added && onAdd(place)}
        activeOpacity={added ? 1 : 0.7}
      >
        <Text style={[card.addBtnText, added && { color: '#15803d' }]}>
          {added ? '✓' : dimMorning ? '🦉' : '+'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────
export default function DiscoverModal({ visible, onClose, trip, dayIndex, defaultTime }) {
  const insets = useSafeAreaInsets();
  const { addActivity } = useStore();

  const [activeCategory, setActiveCategory] = useState('attractions');
  const [searchText, setSearchText]         = useState('');
  const [results, setResults]               = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [addedNames, setAddedNames]         = useState(new Set());
  const [activeFilters, setActiveFilters]   = useState([]);
  const searchTimeout = useRef(null);

  const destination  = trip?.destination ?? '';
  const families     = trip?.families ?? [];

  // Compute group dietary profile for header badge
  const allDietary  = families.flatMap(f => f.dietary || []);
  const hasVeg      = allDietary.some(d => d === 'vegetarian' || d === 'vegan');
  const hasNoAlco   = allDietary.includes('no-alcohol');
  const dietaryBadgeParts = [
    hasVeg    && '🥦 Veg',
    hasNoAlco && '🍺 No Alcohol',
  ].filter(Boolean);

  // Late-start group: any family with wakeTime === 'late'
  const lateStartGroup = families.some(f => f.wakeTime === 'late');

  // Seed filter chips from group dietary profile on open
  useEffect(() => {
    if (!visible) return;
    setSearchText('');
    setAddedNames(new Set());
    const seeded = FILTER_OPTS
      .filter(f => allDietary.includes(f.key))
      .map(f => f.key);
    setActiveFilters(seeded);
  }, [visible]);

  // Re-search when category changes or modal opens
  useEffect(() => {
    if (!visible) return;
    runSearch(searchText, activeCategory, activeFilters);
  }, [visible, activeCategory]);

  const runSearch = async (text, catKey, filters) => {
    const cat      = CATEGORIES.find(c => c.key === catKey);
    const baseQ    = text.trim()
      ? `${text.trim()} near ${destination}`
      : `${cat?.query ?? 'places'} in ${destination}`;
    const dietBias = getDietaryBias(families);
    const filtBias = getFilterBias(filters);
    const bias     = [dietBias, filtBias].filter(Boolean).join(' ');
    const query    = bias ? `${baseQ} ${bias}` : baseQ;

    setLoading(true);
    setError(null);
    const places = await fetchPlaces(query);
    setResults(places);
    setLoading(false);
    if (!places.length) setError(text.trim()
      ? `No results for "${text.trim()}". Try a different search.`
      : 'No results found. Try another category or search term.');
  };

  const handleSearchChange = (text) => {
    setSearchText(text);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(text, activeCategory, activeFilters), 600);
  };

  const toggleFilter = (key) => {
    const next = activeFilters.includes(key)
      ? activeFilters.filter(k => k !== key)
      : [...activeFilters, key];
    setActiveFilters(next);
    runSearch(searchText, activeCategory, next);
  };

  const handleAdd = (place) => {
    const activity = {
      id:           uid(),
      type:         place.activityType,
      time:         defaultTime ?? '09:00',
      name:         place.name,
      detail:       '',
      costPerPerson: place.costPerPerson,
      costMode:     'per_person',
      costAmount:   place.costPerPerson,
      address:      place.address,
      url:          place.url,
      rating:       place.rating,
      lat:          place.lat,
      lng:          place.lng,
      note:         null,
      status:       null,
    };
    addActivity(trip.id, dayIndex, activity);
    setAddedNames(prev => new Set([...prev, place.name]));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.container, { paddingTop: insets.top + 8 }]}>

          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Discover</Text>
              <Text style={s.subtitle} numberOfLines={1}>📍 {destination}</Text>
              {dietaryBadgeParts.length > 0 && (
                <Text style={s.dietBadge}>{dietaryBadgeParts.join(' · ')} · filtered</Text>
              )}
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={s.searchRow}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              value={searchText}
              onChangeText={handleSearchChange}
              placeholder={`Search in ${destination}…`}
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              onSubmitEditing={() => runSearch(searchText, activeCategory, activeFilters)}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
            style={s.chipsScroll}
          >
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[s.chip, activeCategory === cat.key && s.chipActive]}
                onPress={() => { setSearchText(''); setActiveCategory(cat.key); }}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, activeCategory === cat.key && s.chipTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Dietary filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterChips}
            style={s.filterRow}
          >
            {FILTER_OPTS.map(f => {
              const on = activeFilters.includes(f.key);
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[s.filterChip, on && s.filterChipActive]}
                  onPress={() => toggleFilter(f.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.filterChipText, on && s.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Late-start group hint */}
          {lateStartGroup && (!defaultTime || defaultTime < '12:00') && (
            <View style={s.lateHint}>
              <Text style={s.lateHintText}>🦉 Some families wake late — morning slots are dimmed</Text>
            </View>
          )}

          {/* Results */}
          {loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={s.loadingText}>Searching {destination}…</Text>
            </View>
          ) : error ? (
            <View style={s.center}>
              <Text style={s.errorEmoji}>🔍</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item, i) => `${item.name}-${i}`}
              contentContainerStyle={s.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <PlaceCard
                  place={item}
                  onAdd={handleAdd}
                  added={addedNames.has(item.name)}
                  lateStartGroup={lateStartGroup}
                  defaultTime={defaultTime}
                />
              )}
              ListHeaderComponent={
                results.length > 0 ? (
                  <Text style={s.resultCount}>{results.length} places found</Text>
                ) : null
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bg },
  header:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.xxl, paddingBottom: spacing.md,
  },
  title:       { ...typography.h3, color: colors.text },
  subtitle:    { ...typography.small, color: colors.muted, marginTop: 2, maxWidth: 260 },
  closeBtn:    {
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: 8, marginTop: 4,
  },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  searchRow:   {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.xxl, marginBottom: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon:  { fontSize: 15, marginRight: spacing.xs },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 6 },

  chipsScroll: { maxHeight: 44, marginBottom: spacing.sm },
  chips:       { paddingHorizontal: spacing.xxl, gap: spacing.xs, alignItems: 'center' },
  chip:        {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: '#fff',
  },
  chipActive:  { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText:    { fontSize: 13, color: colors.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  list:        { paddingHorizontal: spacing.xxl, paddingBottom: 32 },
  resultCount: { ...typography.caption, color: colors.muted, marginBottom: spacing.sm },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  loadingText: { ...typography.body, color: colors.muted, marginTop: spacing.lg },
  errorEmoji:  { fontSize: 36, marginBottom: spacing.md },
  errorText:   { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 22 },

  // Dietary badge under subtitle
  dietBadge: { fontSize: 11, color: '#15803d', fontWeight: '700', marginTop: 3 },

  // Dietary filter chips row
  filterRow:      { maxHeight: 40, marginBottom: spacing.xs },
  filterChips:    { paddingHorizontal: spacing.xxl, gap: spacing.xs, alignItems: 'center' },
  filterChip:     {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: '#fff',
  },
  filterChipActive:     { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  filterChipText:       { fontSize: 12, color: colors.muted, fontWeight: '600' },
  filterChipTextActive: { color: '#15803d', fontWeight: '700' },

  // Late-start group hint bar
  lateHint: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xs,
    backgroundColor: '#fef9c3',
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#fde047',
  },
  lateHintText: { fontSize: 11, color: '#713f12', fontWeight: '600' },
});

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm, padding: spacing.md,
    gap: spacing.sm, ...shadow.sm,
  },
  body:     { flex: 1, gap: 4 },
  nameRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  typeIcon: { fontSize: 16, marginTop: 1 },
  name:     { ...typography.bodyBold, color: colors.text, flex: 1, lineHeight: 20 },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rating:   { fontSize: 12, color: '#92400e', fontWeight: '600' },
  costBadge:{ backgroundColor: '#e0faf4', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  costText: { fontSize: 11, fontWeight: '700', color: colors.green },
  badge:    { fontSize: 13 },
  address:  { ...typography.caption, color: colors.muted, lineHeight: 16 },

  addBtn:   {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  addBtnDone:   { backgroundColor: '#dcfce7' },
  addBtnDimmed: { backgroundColor: '#e5e7eb', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  addBtnText:   { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },

  wrapDimmed: { opacity: 0.65 },

  vegBadge:     { backgroundColor: '#dcfce7', borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
  vegBadgeText: { fontSize: 10, color: '#15803d', fontWeight: '700' },
});
