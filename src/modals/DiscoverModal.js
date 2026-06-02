/**
 * DiscoverModal.js
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
import { SLOTS, getSlotKey, getSmartTime } from '../utils/slots';

const CATEGORIES = [
  { key: 'attractions', label: '\u{1F3DB}️ Attractions', query: 'top tourist attractions and landmarks' },
  { key: 'food',        label: '\u{1F37D}️ Restaurants', query: 'best restaurants' },
  { key: 'cafes',       label: '☕ Cafes',               query: 'cafes and coffee shops' },
  { key: 'nature',      label: '\u{1F33F} Nature',            query: 'parks nature reserves and outdoor activities' },
  { key: 'activities',  label: '\u{1F3A1} Activities',        query: 'fun family activities and entertainment' },
  { key: 'shopping',    label: '\u{1F6CD}️ Shopping',    query: 'shopping centers markets and malls' },
  { key: 'hotels',      label: '\u{1F3E8} Hotels',            query: 'highly rated hotels and resorts' },
];

const FILTER_OPTS = [
  { key: 'vegetarian',  label: '\u{1F966} Veg',       bias: 'vegetarian friendly' },
  { key: 'vegan',       label: '\u{1F331} Vegan',      bias: 'vegan friendly' },
  { key: 'no-alcohol',  label: '\u{1F37A} No Alcohol', bias: 'non-alcoholic' },
  { key: 'gluten-free', label: '\u{1F33E} GF',         bias: 'gluten free' },
];

function getDietaryBias(families = []) {
  const all = families.flatMap(f => f.dietary || []);
  const b = [];
  if (all.includes('vegetarian') || all.includes('vegan')) b.push('vegetarian friendly');
  if (all.includes('vegan'))      b.push('vegan');
  if (all.includes('no-alcohol')) b.push('non-alcoholic options');
  if (all.includes('gluten-free'))b.push('gluten free options');
  return b.join(' ');
}
function getFilterBias(af) {
  return af.map(k => FILTER_OPTS.find(f => f.key === k)?.bias).filter(Boolean).join(' ');
}
// Split a multi-stop destination ("LA & San Diego", "Los Angeles to San Diego")
// into individual locations. Comma is NOT a separator ("Florida, United States"
// is one place). Returns [dest] when there's only one stop.
function parseLocations(dest) {
  if (!dest) return [];
  const parts = dest.split(/\s*(?:&|\/|\+|→|\band\b|\bto\b)\s*/i)
    .map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [dest];
}
// Short, normalised city name from a fuller string ("Orlando, Florida, USA" → "Orlando").
// Used as both the chip label and the per-activity city tag so search scope and
// the Trip-Check city comparison stay consistent.
function cityLabel(c) {
  return (c || '').split(',')[0].trim();
}
// Split a "🏛️ Attractions" label into its leading emoji and the rest, so each
// can be sized independently — a single mixed Text lets the tall emoji line box
// clip the label inside small pills on iOS.
function splitLabel(label) {
  const i = (label || '').indexOf(' ');
  return i < 0 ? ['', label || ''] : [label.slice(0, i), label.slice(i + 1)];
}

// A chip whose emoji and text are separate, vertically-centered elements inside
// a fixed-height pill — clip-proof regardless of emoji line metrics.
function Chip({ label, active, activeStyle, activeTextStyle, onPress }) {
  const [emoji, text] = splitLabel(label);
  return (
    <TouchableOpacity style={[s.chip, active && activeStyle]} onPress={onPress} activeOpacity={0.7}>
      {!!emoji && <Text style={s.chipEmoji} allowFontScaling={false}>{emoji}</Text>}
      <Text style={[s.chipLabel, active && activeTextStyle]} numberOfLines={1} allowFontScaling={false}>{text}</Text>
    </TouchableOpacity>
  );
}
const VEG_NAME_RE = /vegetarian|vegan|veggie|plant.based|organic|salad|juice|smoothie|falafel/i;
const VEG_TYPES   = new Set(['cafe','bakery','juice_bar','health','natural_goods']);
function isVegFriendly(place) {
  if (VEG_NAME_RE.test(place.name)) return true;
  return (place.types || []).some(t => VEG_TYPES.has(t));
}

const PRICE_TO_COST = {
  PRICE_LEVEL_FREE:0,PRICE_LEVEL_INEXPENSIVE:15,PRICE_LEVEL_MODERATE:35,
  PRICE_LEVEL_EXPENSIVE:75,PRICE_LEVEL_VERY_EXPENSIVE:150,
};
function inferActivityType(types = []) {
  if (types.some(t => ['restaurant','food','meal_takeaway','bakery','cafe'].includes(t))) return 'food';
  if (types.some(t => ['lodging','hotel','resort_hotel','motel'].includes(t))) return 'stay';
  return 'activity';
}

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = ['places.displayName','places.formattedAddress','places.rating','places.userRatingCount','places.priceLevel','places.types','places.accessibilityOptions','places.websiteUri','places.location'].join(',');

async function fetchPlaces(textQuery) {
  if (!GOOGLE_PLACES_API_KEY) return [];
  try {
    const res = await fetch(PLACES_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':FIELD_MASK},
      body:JSON.stringify({textQuery,maxResultCount:20}),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.places ?? []).map(p => {
      const place = {
        name:p.displayName?.text??'Place', address:p.formattedAddress??'',
        rating:p.rating??null, ratingCount:p.userRatingCount??0,
        costPerPerson:PRICE_TO_COST[p.priceLevel]??0, types:p.types??[],
        activityType:inferActivityType(p.types??[]),
        wheelchairOk:p.accessibilityOptions?.wheelchairAccessibleEntrance??null,
        url:p.websiteUri??'', lat:p.location?.latitude??null, lng:p.location?.longitude??null,
      };
      place.vegFriendly = isVegFriendly(place);
      return place;
    });
  } catch(e) { console.warn('[DiscoverModal]',e.message); return []; }
}

function PlaceCard({ place, onAdd, added, lateStartGroup, defaultTime }) {
  const typeEmoji = place.activityType==='food'?'\u{1F37D}️':place.activityType==='stay'?'\u{1F3E8}':'\u{1F3AF}';
  const isMorning = !defaultTime || defaultTime < '12:00';
  const dim = lateStartGroup && isMorning;
  return (
    <View style={[card.wrap, dim && card.wrapDimmed]}>
      <View style={card.body}>
        <View style={card.nameRow}>
          <Text style={card.typeIcon}>{typeEmoji}</Text>
          <Text style={card.name} numberOfLines={2}>{place.name}</Text>
          {place.vegFriendly && <View style={card.vegBadge}><Text style={card.vegBadgeText}>{'\u{1F966} Veg'}</Text></View>}
        </View>
        <View style={card.meta}>
          {place.rating!=null && <Text style={card.rating}>{'⭐'} {place.rating.toFixed(1)}</Text>}
          {place.costPerPerson>0
            ? <View style={card.costBadge}><Text style={card.costText}>~${place.costPerPerson}/p</Text></View>
            : <View style={[card.costBadge,{backgroundColor:'#dcfce7'}]}><Text style={[card.costText,{color:'#15803d'}]}>Free</Text></View>}
          {place.wheelchairOk && <Text style={card.badge}>{'♿'}</Text>}
        </View>
        {!!place.address && <Text style={card.address} numberOfLines={1}>{'\u{1F4CD}'} {place.address}</Text>}
      </View>
      <TouchableOpacity
        style={[card.addBtn, added&&card.addBtnDone, dim&&card.addBtnDimmed]}
        onPress={() => !added && onAdd(place)} activeOpacity={added?1:0.7}
      >
        <Text style={[card.addBtnText, added&&{color:'#15803d'}]}>
          {added?'✓':dim?'\u{1F989}':'+'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DiscoverModal({ visible, onClose, trip, dayIndex, defaultTime }) {
  const insets = useSafeAreaInsets();
  const { addActivity } = useStore();

  const [activeCategory, setActiveCategory] = useState('attractions');
  const [searchText,     setSearchText]     = useState('');
  const [results,        setResults]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [addedNames,     setAddedNames]     = useState(new Set());
  const [activeFilters,  setActiveFilters]  = useState([]);
  const [pendingPlace,   setPendingPlace]   = useState(null);
  const [pickerDay,      setPickerDay]      = useState(dayIndex ?? 0);
  const [pickerSlot,     setPickerSlot]     = useState('morning');
  const [cities,         setCities]         = useState([]);     // searchable cities (chips)
  const [activeCity,     setActiveCity]     = useState('');     // current search city
  const [addingCity,     setAddingCity]     = useState(false);  // custom-city input open?
  const [newCity,        setNewCity]        = useState('');
  const searchTimeout = useRef(null);
  const filterTimeout = useRef(null);
  const cacheRef      = useRef(new Map());   // query string -> places[] (per-session)

  const destination   = trip?.destination ?? '';
  const families      = trip?.families ?? [];
  const allDietary    = families.flatMap(f => f.dietary || []);
  const hasVeg        = allDietary.some(d => d==='vegetarian'||d==='vegan');
  const hasNoAlco     = allDietary.includes('no-alcohol');
  const dietBadge     = [hasVeg&&'\u{1F966} Veg', hasNoAlco&&'\u{1F37A} No Alcohol'].filter(Boolean);
  const lateStartGroup = families.some(f => f.wakeTime==='late');

  useEffect(() => {
    if (!visible) return;
    const parsed = parseLocations(destination);
    const start  = parsed[0] || destination;
    setSearchText(''); setAddedNames(new Set());
    setCities(parsed.length ? parsed : (destination ? [destination] : []));
    setActiveCity(start);
    setAddingCity(false); setNewCity('');
    cacheRef.current.clear();
    setActiveFilters(FILTER_OPTS.filter(f => allDietary.includes(f.key)).map(f => f.key));
  }, [visible]);

  useEffect(() => {
    if (!visible || !activeCity) return;
    runSearch(searchText, activeCategory, activeFilters, activeCity);
  }, [visible, activeCategory, activeCity]);

  // One API call per unique query; identical queries (e.g. switching back to a
  // previously-viewed category/city/filter combo) are served from cache.
  const runSearch = async (text, catKey, filters, loc = activeCity) => {
    const cat   = CATEGORIES.find(c => c.key===catKey);
    const scope = loc || destination;
    const baseQ = text.trim() ? `${text.trim()} near ${scope}` : `${cat?.query??'places'} in ${scope}`;
    const bias  = [getDietaryBias(families), getFilterBias(filters)].filter(Boolean).join(' ');
    const fullQ = bias ? `${baseQ} ${bias}` : baseQ;

    setError(null);
    if (cacheRef.current.has(fullQ)) {
      const cached = cacheRef.current.get(fullQ);
      setResults(cached); setLoading(false);
      if (!cached.length) setError(text.trim() ? `No results for "${text.trim()}".` : 'No results found.');
      return;
    }

    setLoading(true);
    const places = await fetchPlaces(fullQ);
    cacheRef.current.set(fullQ, places);
    setResults(places); setLoading(false);
    if (!places.length) setError(text.trim() ? `No results for "${text.trim()}".` : 'No results found.');
  };

  const handleSearchChange = text => {
    setSearchText(text);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(text, activeCategory, activeFilters), 600);
  };

  const toggleFilter = key => {
    const next = activeFilters.includes(key) ? activeFilters.filter(k=>k!==key) : [...activeFilters,key];
    setActiveFilters(next);
    // Debounce so toggling several filters quickly results in a single API call.
    clearTimeout(filterTimeout.current);
    filterTimeout.current = setTimeout(() => runSearch(searchText, activeCategory, next), 350);
  };

  // Selecting a city re-runs the search via the activeCity effect.
  const selectCity = c => { setAddingCity(false); setActiveCity(c); };

  // Commit a freely-typed city (need not be in the trip's destination).
  const commitNewCity = () => {
    const c = newCity.trim();
    setAddingCity(false); setNewCity('');
    if (!c) return;
    setCities(prev => prev.some(x => cityLabel(x) === cityLabel(c)) ? prev : [...prev, c]);
    setActiveCity(c);
  };

  const handleAdd = place => {
    setPickerDay(dayIndex ?? 0);
    setPickerSlot(getSlotKey(defaultTime || '09:00'));
    setPendingPlace(place);
  };

  const handleConfirmAdd = () => {
    if (!pendingPlace) return;
    const smartTime = getSmartTime(trip, pickerDay, pickerSlot)
      || SLOTS.find(s => s.key===pickerSlot)?.defaultTime || '09:00';
    addActivity(trip.id, pickerDay, {
      id:uid(), type:pendingPlace.activityType, time:smartTime,
      name:pendingPlace.name, detail:'',
      costPerPerson:pendingPlace.costPerPerson, costMode:'per_person',
      costAmount:pendingPlace.costPerPerson,
      address:pendingPlace.address, url:pendingPlace.url,
      rating:pendingPlace.rating, lat:pendingPlace.lat, lng:pendingPlace.lng,
      city:cityLabel(activeCity),   // tag the source city → Trip Check flags multi-city days
      note:null, status:null,
    });
    setAddedNames(prev => new Set([...prev, pendingPlace.name]));
    setPendingPlace(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={[s.container,{paddingTop:insets.top+8}]}>

          <View style={s.header}>
            <View style={{flex:1}}>
              <Text style={s.title}>Discover</Text>
              <Text style={s.subtitle} numberOfLines={1}>{'\u{1F4CD}'} {destination}</Text>
              {dietBadge.length>0 && <Text style={s.dietBadge}>{dietBadge.join(' · ')} · filtered</Text>}
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={s.searchRow}>
            <Text style={s.searchIcon}>{'\u{1F50D}'}</Text>
            <TextInput
              style={s.searchInput} value={searchText} onChangeText={handleSearchChange}
              placeholder={`Search in ${cityLabel(activeCity) || destination}…`} placeholderTextColor={colors.muted}
              returnKeyType="search" onSubmitEditing={() => runSearch(searchText,activeCategory,activeFilters)}
              clearButtonMode="while-editing"
            />
          </View>

          {/* City selector — always shown; search any city, not just the destination */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipsScroll}>
            {cities.map(c => (
              <Chip key={c} label={'\u{1F4CD} ' + cityLabel(c)} active={activeCity === c}
                activeStyle={s.locChipActive} activeTextStyle={s.chipTextActive}
                onPress={() => selectCity(c)} />
            ))}
            {addingCity ? (
              <View style={s.addCityWrap}>
                <TextInput
                  style={s.addCityInput} value={newCity} onChangeText={setNewCity}
                  placeholder="City name…" placeholderTextColor={colors.muted}
                  autoFocus returnKeyType="search"
                  onSubmitEditing={commitNewCity} onBlur={commitNewCity}
                />
              </View>
            ) : (
              <Chip label="＋ City" active={false}
                activeStyle={s.locChipActive} activeTextStyle={s.chipTextActive}
                onPress={() => setAddingCity(true)} />
            )}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipsScroll}>
            {CATEGORIES.map(cat => (
              <Chip key={cat.key} label={cat.label} active={activeCategory===cat.key}
                activeStyle={s.chipActive} activeTextStyle={s.chipTextActive}
                onPress={() => { setSearchText(''); setActiveCategory(cat.key); }} />
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipsScroll}>
            {FILTER_OPTS.map(f => {
              const on = activeFilters.includes(f.key);
              return (
                <Chip key={f.key} label={f.label} active={on}
                  activeStyle={s.filterChipActive} activeTextStyle={s.filterChipTextActive}
                  onPress={() => toggleFilter(f.key)} />
              );
            })}
          </ScrollView>

          {lateStartGroup && (!defaultTime||defaultTime<'12:00') && (
            <View style={s.lateHint}><Text style={s.lateHintText}>{'\u{1F989}'} Some families wake late — morning slots are dimmed</Text></View>
          )}

          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary}/><Text style={s.loadingText}>Searching {destination}…</Text></View>
          ) : error ? (
            <View style={s.center}><Text style={s.errorEmoji}>{'\u{1F50D}'}</Text><Text style={s.errorText}>{error}</Text></View>
          ) : (
            <FlatList data={results} keyExtractor={(item,i)=>`${item.name}-${i}`}
              contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
              renderItem={({item}) => (
                <PlaceCard place={item} onAdd={handleAdd} added={addedNames.has(item.name)}
                  lateStartGroup={lateStartGroup} defaultTime={defaultTime}/>
              )}
              ListHeaderComponent={results.length>0?<Text style={s.resultCount}>{results.length} places found</Text>:null}
            />
          )}
        </View>

        {/* Slot picker sheet */}
        <Modal visible={!!pendingPlace} transparent animationType="slide" onRequestClose={() => setPendingPlace(null)}>
          <TouchableOpacity style={sp.overlay} activeOpacity={1} onPress={() => setPendingPlace(null)}>
            <View style={sp.sheet} onStartShouldSetResponder={() => true}>
              <View style={sp.handle}/>
              <Text style={sp.sheetTitle} numberOfLines={1}>Add "{pendingPlace?.name}"</Text>
              {!!pendingPlace?.address && <Text style={sp.sheetSubtitle} numberOfLines={1}>{'\u{1F4CD}'} {pendingPlace.address}</Text>}

              <Text style={sp.sectionLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sp.dayRow}>
                {(trip.days||[]).map((d,i) => (
                  <TouchableOpacity key={d.date} style={[sp.dayBtn, pickerDay===i&&sp.dayBtnActive]}
                    onPress={() => setPickerDay(i)} activeOpacity={0.7}>
                    <Text style={[sp.dayBtnLabel, pickerDay===i&&sp.dayBtnLabelActive]}>{d.label}</Text>
                    <Text style={[sp.dayBtnDate, pickerDay===i&&{color:colors.primary}]}>{d.date?.slice(5)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={sp.sectionLabel}>When</Text>
              <View style={sp.slotGrid}>
                {SLOTS.map(slot => {
                  const smart  = getSmartTime(trip, pickerDay, slot.key);
                  const count  = (trip.days[pickerDay]?.activities||[]).filter(a => a.status!=='skipped'&&getSlotKey(a.time)===slot.key).length;
                  const isFull = smart===null;
                  const isActive = pickerSlot===slot.key;
                  const isLate = lateStartGroup && slot.key==='morning';
                  return (
                    <TouchableOpacity key={slot.key}
                      style={[sp.slotBtn, isActive&&sp.slotBtnActive, isFull&&sp.slotBtnFull]}
                      onPress={() => !isFull&&setPickerSlot(slot.key)} activeOpacity={isFull?1:0.7}>
                      <View style={sp.slotBtnTop}>
                        <Text style={sp.slotEmoji}>{slot.emoji}</Text>
                        <Text style={[sp.slotLabel, isActive&&{color:colors.primary}]}>{slot.label}</Text>
                        {isLate&&<Text style={sp.slotOwl}>{'\u{1F989}'}</Text>}
                      </View>
                      <Text style={[sp.slotMeta, isFull&&{color:'#dc2626'}]}>{isFull?'Full':smart}</Text>
                      {count>0&&<Text style={sp.slotCount}>{count} act{count!==1?'s':''}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {(() => {
                const smart = getSmartTime(trip, pickerDay, pickerSlot);
                const day   = trip.days[pickerDay];
                const slot  = SLOTS.find(s => s.key===pickerSlot);
                return (
                  <TouchableOpacity style={[sp.confirmBtn, !smart&&sp.confirmBtnDisabled]}
                    onPress={smart?handleConfirmAdd:null} activeOpacity={smart?0.85:1}>
                    <Text style={sp.confirmBtnText}>
                      {smart ? `Add at ${smart} · ${day?.label} ${slot?.emoji} ${slot?.label}` : 'Slot full — choose another'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </TouchableOpacity>
        </Modal>

      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.bg},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',paddingHorizontal:spacing.xxl,paddingBottom:spacing.md},
  title:{...typography.h3,color:colors.text},
  subtitle:{...typography.small,color:colors.muted,marginTop:2,maxWidth:260},
  closeBtn:{backgroundColor:colors.primary,borderRadius:radius.full,paddingHorizontal:spacing.lg,paddingVertical:8,marginTop:4},
  closeBtnText:{color:'#fff',fontWeight:'700',fontSize:14},
  searchRow:{flexDirection:'row',alignItems:'center',marginHorizontal:spacing.xxl,marginBottom:spacing.sm,backgroundColor:colors.surface2,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.xs,borderWidth:1,borderColor:colors.border},
  searchIcon:{fontSize:15,marginRight:spacing.xs},
  searchInput:{flex:1,fontSize:15,color:colors.text,paddingVertical:6},
  // Fixed-height pills with vertically-centered, separately-sized emoji + label.
  // paddingVertical on the scroll content guarantees the viewport is always
  // taller than the pill, so glyphs can never be clipped.
  chipsScroll:{flexGrow:0,marginBottom:spacing.sm},
  chips:{paddingHorizontal:spacing.xxl,paddingVertical:4,gap:spacing.xs,alignItems:'center'},
  chip:{height:36,flexDirection:'row',alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:spacing.md,backgroundColor:'#fff'},
  chipEmoji:{fontSize:14,marginRight:5},
  chipLabel:{fontSize:13,color:colors.text,fontWeight:'600'},
  chipActive:{backgroundColor:colors.primary,borderColor:colors.primary},
  chipTextActive:{color:'#fff'},
  locChipActive:{backgroundColor:'#2563eb',borderColor:'#2563eb'},
  addCityWrap:{height:36,justifyContent:'center',borderWidth:1.5,borderColor:'#2563eb',borderRadius:radius.full,paddingHorizontal:spacing.md,backgroundColor:'#fff',minWidth:120},
  addCityInput:{fontSize:13,color:colors.text,fontWeight:'600',padding:0},
  filterChipActive:{backgroundColor:'#dcfce7',borderColor:'#16a34a'},
  filterChipTextActive:{color:'#15803d',fontWeight:'700'},
  dietBadge:{fontSize:11,color:'#15803d',fontWeight:'700',marginTop:3},
  lateHint:{marginHorizontal:spacing.xxl,marginBottom:spacing.xs,backgroundColor:'#fef9c3',borderRadius:radius.sm,padding:spacing.sm,borderWidth:1,borderColor:'#fde047'},
  lateHintText:{fontSize:11,color:'#713f12',fontWeight:'600'},
  list:{paddingHorizontal:spacing.xxl,paddingBottom:32},
  resultCount:{...typography.caption,color:colors.muted,marginBottom:spacing.sm},
  center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xxxl},
  loadingText:{...typography.body,color:colors.muted,marginTop:spacing.lg},
  errorEmoji:{fontSize:36,marginBottom:spacing.md},
  errorText:{...typography.body,color:colors.muted,textAlign:'center',lineHeight:22},
});

const sp = StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'flex-end'},
  sheet:{backgroundColor:colors.surface,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,padding:spacing.xxl,paddingBottom:40},
  handle:{width:36,height:4,backgroundColor:colors.border,borderRadius:2,alignSelf:'center',marginBottom:spacing.lg},
  sheetTitle:{...typography.h4,color:colors.text,marginBottom:2},
  sheetSubtitle:{...typography.caption,color:colors.muted,marginBottom:spacing.lg},
  sectionLabel:{fontSize:10,fontWeight:'800',color:colors.muted,textTransform:'uppercase',letterSpacing:0.8,marginBottom:spacing.sm,marginTop:spacing.md},
  dayRow:{gap:spacing.sm,paddingBottom:spacing.xs},
  dayBtn:{borderWidth:1.5,borderColor:colors.border,borderRadius:radius.lg,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:'#fff',alignItems:'center',minWidth:64},
  dayBtnActive:{borderColor:colors.primary,backgroundColor:colors.primaryLight},
  dayBtnLabel:{...typography.caption,color:colors.muted,fontWeight:'700',textTransform:'uppercase'},
  dayBtnLabelActive:{color:colors.primary},
  dayBtnDate:{fontSize:10,color:colors.muted,marginTop:1},
  slotGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.lg},
  slotBtn:{width:'48%',borderWidth:1.5,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:'#fff',padding:spacing.md,gap:3},
  slotBtnActive:{borderColor:colors.primary,backgroundColor:colors.primaryLight},
  slotBtnFull:{borderColor:'#fecaca',backgroundColor:'#fef2f2',opacity:0.6},
  slotBtnTop:{flexDirection:'row',alignItems:'center',gap:6},
  slotEmoji:{fontSize:16},
  slotLabel:{...typography.bodyBold,color:colors.text,fontSize:13},
  slotOwl:{fontSize:13,marginLeft:'auto'},
  slotMeta:{fontSize:13,fontWeight:'700',color:colors.primary},
  slotCount:{fontSize:10,color:colors.muted},
  confirmBtn:{backgroundColor:colors.primary,borderRadius:radius.lg,paddingVertical:spacing.md,alignItems:'center',marginTop:spacing.xs},
  confirmBtnDisabled:{backgroundColor:colors.border},
  confirmBtnText:{...typography.bodyBold,color:'#fff'},
});

const card = StyleSheet.create({
  wrap:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,marginBottom:spacing.sm,padding:spacing.md,gap:spacing.sm,...shadow.sm},
  body:{flex:1,gap:4},
  nameRow:{flexDirection:'row',alignItems:'flex-start',gap:6},
  typeIcon:{fontSize:16,marginTop:1},
  name:{...typography.bodyBold,color:colors.text,flex:1,lineHeight:20},
  meta:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  rating:{fontSize:12,color:'#92400e',fontWeight:'600'},
  costBadge:{backgroundColor:'#e0faf4',borderRadius:radius.full,paddingHorizontal:8,paddingVertical:2},
  costText:{fontSize:11,fontWeight:'700',color:colors.green},
  badge:{fontSize:13},
  address:{...typography.caption,color:colors.muted,lineHeight:16},
  addBtn:{width:36,height:36,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',flexShrink:0},
  addBtnDone:{backgroundColor:'#dcfce7'},
  addBtnDimmed:{backgroundColor:'#e5e7eb',borderWidth:1.5,borderStyle:'dashed',borderColor:colors.border},
  addBtnText:{color:'#fff',fontSize:20,fontWeight:'700',lineHeight:22},
  wrapDimmed:{opacity:0.65},
  vegBadge:{backgroundColor:'#dcfce7',borderRadius:radius.full,paddingHorizontal:6,paddingVertical:2,marginLeft:4},
  vegBadgeText:{fontSize:10,color:'#15803d',fontWeight:'700'},
});
