/**
 * LocationSearchField
 *
 * Destination autocomplete using the free Photon geocoder (OpenStreetMap).
 * No API key required. Debounced 300ms. Results inline — works inside ScrollView.
 *
 * Props:
 *   label        string
 *   value        string   — controlled value (the formatted place string)
 *   onSelect     fn(label: string, coords?: {lat,lng}) — called when user picks a
 *                result. coords come free from Photon's geometry (null on clear).
 *   placeholder  string
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, typography, shadow } from '../../theme';

const PHOTON_URL = 'https://photon.komoot.io/api/';

// Photon feature props → a readable label. A named place ("Chicago", "O'Hare Airport")
// uses its `name`; a pure STREET ADDRESS comes back with NO `name` (just housenumber +
// street), so we build "1243 Deerfield Pkwy" — otherwise street addresses were invisible
// and only nearby named POIs (a Metra station) showed up.
export function formatPlace(props) {
  const head = props.name
    || [props.housenumber, props.street].filter(Boolean).join(' ')
    || props.street
    || props.city
    || '';
  const parts = [head];
  if (props.city && props.city !== head) parts.push(props.city);
  if (props.state && props.state !== head && props.state !== props.city) parts.push(props.state);
  if (props.country && props.country !== head) parts.push(props.country);
  return parts.filter(Boolean).join(', ');
}

function placeIcon(type) {
  if (!type) return '📍';
  if (type === 'country') return '🌍';
  if (type === 'airport' || type === 'aerodrome') return '✈️';
  if (type === 'island') return '🏝️';
  if (type === 'city' || type === 'town') return '🏙️';
  return '📍';
}

export default function LocationSearchField({
  label = 'Destination *',
  value,
  onSelect,
  placeholder = 'e.g. Bali, Indonesia',
}) {
  const [query, setQuery]           = useState(value || '');
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const justSelected = useRef(false);

  // Re-seed the visible text when the controlled value changes from the parent
  // (e.g. a modal reopening with a saved value). Safe during typing: `value` only
  // changes on (re)select/clear, not on each keystroke, so it won't clobber input.
  useEffect(() => { setQuery(value || ''); }, [value]);

  const fetchPlaces = useCallback(async (text) => {
    if (text.length < 2) { setResults([]); setShowResults(false); return; }
    setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `${PHOTON_URL}?q=${encodeURIComponent(text)}&limit=8&lang=en`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      const data = await resp.json();
      const places = (data.features || [])
        // keep named places AND pure street addresses (street present, no name) — the
        // latter were being dropped, so a typed street address never appeared.
        .filter(f => f.properties && (f.properties.name || f.properties.street))
        .map((f, i) => ({
          key: String(f.properties.osm_id || i),
          label: formatPlace(f.properties),
          type: f.properties.type,
          // Photon GeoJSON: geometry.coordinates = [lng, lat]. Kept so callers
          // that need a point (e.g. a trip's starting location) get it for free.
          lng: f.geometry?.coordinates?.[0] ?? null,
          lat: f.geometry?.coordinates?.[1] ?? null,
        }))
        // Deduplicate by label
        .filter((p, i, arr) => arr.findIndex(x => x.label === p.label) === i);
      setResults(places);
      setShowResults(places.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (text) => {
    justSelected.current = false;
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPlaces(text), 300);
  };

  const handleSelect = (place) => {
    justSelected.current = true;
    setQuery(place.label);
    setResults([]);
    setShowResults(false);
    onSelect(place.label, place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null);
  };

  const handleBlur = () => {
    // Delay so a tap on a result registers before we hide the dropdown
    setTimeout(() => {
      if (!justSelected.current) setShowResults(false);
    }, 200);
  };

  return (
    <View style={ls.wrapper}>
      {!!label && <Text style={ls.label}>{label}</Text>}

      {/* Input row */}
      <View style={[ls.inputWrap, showResults && ls.inputWrapOpen]}>
        <Text style={ls.pinEmoji}>📍</Text>
        <TextInput
          style={ls.input}
          value={query}
          onChangeText={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading
          ? <ActivityIndicator size="small" color={colors.muted} style={ls.loader} />
          : query.length > 0
            ? (
              <TouchableOpacity
                onPress={() => { setQuery(''); setResults([]); setShowResults(false); onSelect(''); }}
                style={ls.clearBtn}
              >
                <Text style={ls.clearText}>✕</Text>
              </TouchableOpacity>
            ) : null
        }
      </View>

      {/* Results drop-in panel */}
      {showResults && results.length > 0 && (
        <View style={ls.resultPanel}>
          {results.map((place, idx) => (
            <TouchableOpacity
              key={place.key}
              style={[ls.resultRow, idx < results.length - 1 && ls.resultDivider]}
              onPress={() => handleSelect(place)}
              activeOpacity={0.7}
            >
              <Text style={ls.resultIcon}>{placeIcon(place.type)}</Text>
              <Text style={ls.resultLabel} numberOfLines={1}>{place.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const ls = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },

  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: 4,
  },
  inputWrapOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: colors.border,
  },

  pinEmoji: { fontSize: 15, marginRight: 6 },

  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },

  loader: { marginHorizontal: 10 },

  clearBtn: { padding: 10 },
  clearText: { fontSize: 14, color: colors.muted },

  resultPanel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    ...shadow.md,
    marginBottom: 4,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    gap: 10,
  },
  resultDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultIcon: { fontSize: 14 },
  resultLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
