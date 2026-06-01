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
    return (data.places ?? []).map(p => ({
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
    }));
  } catch (e) {
    console.warn('[DiscoverModal] Places fetch error:', e.message);
    return [];
  }
}

// ─── Result card ──────────────────────────────────────────────────
function PlaceCard({ place, onAdd, added }) {
  const typeEmoji =
    place.activityType === 'food'  ? '🍽️' :
    place.activityType === 'stay'  ? '🏨' : '🎯';

  return (
    <View style={card.wrap}>
      <View style={card.body}>
        <View style={card.nameRow}>
          <Text style={card.typeIcon}>{typeEmoji}</Text>
          <Text style={card.name} numberOfLines={2}>{place.name}</Text>
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
        style={[card.addBtn, added && card.addBtnDone]}
        onPress={() => !added && onAdd(place)}
        activeOpacity={added ? 1 : 0.7}
      >
        <Text style={[card.addBtnText, added && { color: '#15803d' }]}>
          {added ? '✓' : '+'}
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
  const searchTimeout = useRef(null);

  const destination = trip?.destination ?? '';

  // Search when category changes or modal opens
  useEffect(() => {
    if (!visible) return;
    setSearchText('');
    setAddedNames(new Set());
    runCategorySearch(activeCategory);
  }, [visible, activeCategory]);

  const runCategorySearch = async (catKey) => {
    const cat = CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    setLoading(true);
    setError(null);
    const places = await fetchPlaces(`${cat.query} in ${destination}`);
    setResults(places);
    setLoading(false);
    if (!places.length) setError('No results found. Try another category or search term.');
  };

  const runTextSearch = async (text) => {
    if (!text.trim()) { runCategorySearch(activeCategory); return; }
    setLoading(true);
    setError(null);
    const places = await fetchPlaces(`${text.trim()} near ${destination}`);
    setResults(places);
    setLoading(false);
    if (!places.length) setError(`No results for "${text.trim()}". Try a different search.`);
  };

  const handleSearchChange = (text) => {
    setSearchText(text);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runTextSearch(text), 600);
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
            <View>
              <Text style={s.title}>Discover</Text>
              <Text style={s.subtitle} numberOfLines={1}>📍 {destination}</Text>
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
              onSubmitEditing={() => runTextSearch(searchText)}
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
  addBtnDone: { backgroundColor: '#dcfce7' },
  addBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
});
