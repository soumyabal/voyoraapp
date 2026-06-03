/**
 * DiscoverModal.js
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, FlatList, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GOOGLE_PLACES_API_KEY } from '../config';
import useStore from '../store';
import { uid, getAllMembers } from '../utils/helpers';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { SLOTS, getSlotKey, getSuggestedTime, getSlotCount } from '../utils/slots';
import { autoArrange } from '../utils/autoArrange';
import { WebView } from 'react-native-webview';
import Icon from '../components/ui/Icon';

// Place type → Icon name + tint
const TYPE_ICON = { food: 'food', stay: 'hotel', activity: 'activity' };
const TYPE_TINT = { food: '#e17055', stay: colors.smart, activity: colors.success };

// Map layers — independent on/off toggles. Each layer runs its own Places
// query; enabled layers are merged on the map (pins coloured by layer) and in
// the list. Turn any combination on (e.g. just Eat+Stay). tint matches MAP_TINT.
const LAYERS = [
  { key: 'see',  type: 'activity', icon: 'activity', label: 'See',  tint: '#0e9f6e', query: 'top tourist attractions and landmarks' },
  { key: 'eat',  type: 'food',     icon: 'food',     label: 'Eat',  tint: '#e17055', query: 'best restaurants' },
  { key: 'stay', type: 'stay',     icon: 'hotel',    label: 'Stay', tint: colors.smart, query: 'highly rated hotels and resorts' },
];
const TYPE_TO_LAYER = { activity: 'see', food: 'eat', stay: 'stay' };

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

// Great-circle distance in metres — used to drop area-search outliers (Google's
// locationBias is a hint, not a hard radius, so it can return far-off results).
function metersBetween(a, b) {
  const R = 6371000, toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = ['places.displayName','places.formattedAddress','places.rating','places.userRatingCount','places.priceLevel','places.types','places.accessibilityOptions','places.websiteUri','places.location','places.photos'].join(',');

// Google Place Photos: a photo resource name → image URL (billed per fetch).
const photoUrl = name => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&maxHeightPx=420&key=${GOOGLE_PLACES_API_KEY}`;

async function fetchPlaces(textQuery, bias = null) {
  if (!GOOGLE_PLACES_API_KEY) return [];
  try {
    const res = await fetch(PLACES_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':FIELD_MASK},
      body:JSON.stringify({
        textQuery, maxResultCount:20,
        ...(bias ? { locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radius || 15000 } } } : {}),
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.places ?? []).map(p => {
      const place = {
        name:p.displayName?.text??'Place', address:p.formattedAddress??'',
        rating:p.rating??null, ratingCount:p.userRatingCount??0,
        costPerPerson:PRICE_TO_COST[p.priceLevel]??0, priceLevel:p.priceLevel??null, types:p.types??[],
        activityType:inferActivityType(p.types??[]),
        wheelchairOk:p.accessibilityOptions?.wheelchairAccessibleEntrance??null,
        url:p.websiteUri??'', lat:p.location?.latitude??null, lng:p.location?.longitude??null,
        photo:p.photos?.[0]?.name ? photoUrl(p.photos[0].name) : null,
      };
      place.vegFriendly = isVegFriendly(place);
      return place;
    });
  } catch(e) { console.warn('[DiscoverModal]',e.message); return []; }
}

function PlaceCard({ place, onAdd, added, selectMode, selected, onToggle }) {
  const isOn = selectMode ? selected : added;
  return (
    <View style={[card.wrap, selectMode&&selected&&card.wrapSel]}>
      {place.photo
        ? <Image source={{uri:place.photo}} style={card.thumb} />
        : <View style={[card.thumb, card.thumbPh]}><Icon name={TYPE_ICON[place.activityType]||'activity'} size={20} color={TYPE_TINT[place.activityType]||colors.subtle} /></View>}
      <View style={card.body}>
        <View style={card.nameRow}>
          <Text style={card.name} numberOfLines={2}>{place.name}</Text>
          {place.vegFriendly && <View style={card.vegBadge}><Text style={card.vegBadgeText}>{'\u{1F966} Veg'}</Text></View>}
        </View>
        <View style={card.meta}>
          {place.rating!=null && <View style={card.ratingRow}><Icon name="star" size={11} color="#e0a93c" /><Text style={card.rating}>{place.rating.toFixed(1)}</Text></View>}
          {place.costPerPerson>0
            ? <View style={card.costBadge}><Text style={card.costText}>~${place.costPerPerson}/p</Text></View>
            : place.priceLevel==='PRICE_LEVEL_FREE'
              ? <View style={[card.costBadge,{backgroundColor:'#dcfce7'}]}><Text style={[card.costText,{color:'#15803d'}]}>Free</Text></View>
              : null}
          {place.wheelchairOk && <Text style={card.badge}>{'♿'}</Text>}
        </View>
        {!!place.address && <Text style={card.address} numberOfLines={1}>{'\u{1F4CD}'} {place.address}</Text>}
        {!!place.url && (
          <TouchableOpacity style={card.linkRow} onPress={() => Linking.openURL(place.url)} hitSlop={{top:6,bottom:6,left:6,right:6}}>
            <Icon name="open-outline" size={12} color={colors.accent} />
            <Text style={card.linkText}>{place.activityType==='stay' ? 'Book rooms ↗' : 'Visit website ↗'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[card.addBtn, isOn&&card.addBtnDone]}
        onPress={() => selectMode ? onToggle(place) : (!added && onAdd(place))} activeOpacity={isOn&&!selectMode?1:0.7}
      >
        <Icon name={isOn?'check':'add'} size={20} color={isOn?colors.success:'#fff'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Photo card for the map carousel (mindtrip-style) ────────────────
function PlaceMapCard({ place, checked, selected, onToggle }) {
  return (
    <TouchableOpacity style={[mc.card, selected && mc.cardSel]} activeOpacity={0.9} onPress={() => onToggle(place)}>
      <View>
        {place.photo
          ? <Image source={{ uri: place.photo }} style={mc.photo} />
          : <View style={[mc.photo, mc.photoPh]}><Icon name={TYPE_ICON[place.activityType]||'activity'} size={26} color={TYPE_TINT[place.activityType]||colors.subtle} /></View>}
        <View style={[mc.check, checked && mc.checkOn]}>
          <Icon name={checked ? 'check' : 'add'} size={16} color={checked ? '#fff' : colors.accent} />
        </View>
      </View>
      <View style={mc.body}>
        <Text style={mc.name} numberOfLines={1}>{place.name}</Text>
        <View style={mc.meta}>
          {place.rating != null && <><Icon name="star" size={11} color="#e0a93c" /><Text style={mc.rating}>{place.rating.toFixed(1)}</Text></>}
          {place.costPerPerson > 0
            ? <Text style={mc.cost}>~${place.costPerPerson}/p</Text>
            : place.priceLevel === 'PRICE_LEVEL_FREE' ? <Text style={mc.free}>Free</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Map view (Leaflet in a WebView — works in Expo Go) ──────────────
const MAP_TINT = { food: '#e17055', stay: '#6c5ce7', activity: '#0e9f6e' };

// Self-contained Leaflet HTML: rating-labelled pins coloured by type,
// OpenStreetMap tiles (no API key), fit to all markers. A pin tap posts
// the place index back to React Native.
// Built ONCE (stable HTML). Markers are pushed in later via window.setData so
// panning/area-searching updates pins without reloading the map + OSM tiles.
// Pins are coloured per layer (See green / Eat orange / Stay purple). Gestures:
// drag → "moved", pin tap → "select", double-tap → "searchhere", long-press
// (contextmenu) → "longpress".
function buildMapHTML() {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;background:#eee}
.pin{display:flex;align-items:center;justify-content:center;min-width:30px;height:24px;padding:0 7px;border-radius:13px;color:#fff;font:700 12px -apple-system,system-ui,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.35);border:2px solid #fff;white-space:nowrap}
.pin.sel{transform:scale(1.25)}</style></head><body><div id="map"></div>
<script>
var TINT=${JSON.stringify(MAP_TINT)};
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([20,0],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var ms=[];
function clearMarkers(){ms.forEach(function(m){map.removeLayer(m)});ms=[];}
window.setData=function(data){
  clearMarkers();var pts2=[];
  (data||[]).forEach(function(d){
    var c=TINT[d.t]||'#e86c3a',lbl=d.r?d.r.toFixed(1):'•';
    var ic=L.divIcon({className:'',html:'<div class="pin" style="background:'+c+'">'+lbl+'</div>',iconSize:[38,24],iconAnchor:[19,12]});
    var m=L.marker([d.lat,d.lng],{icon:ic}).addTo(map);
    (function(idx,mk){mk.on('click',function(){
      ms.forEach(function(x){if(x._icon)x._icon.firstChild.classList.remove('sel')});
      if(mk._icon)mk._icon.firstChild.classList.add('sel');
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'select',index:idx}));
    });})(d.i,m);
    ms.push(m);pts2.push([d.lat,d.lng]);
  });
  if(pts2.length===1)map.setView(pts2[0],14);else if(pts2.length)map.fitBounds(pts2,{padding:[44,44]});
};
map.on('dragend',function(){var c=map.getCenter();window.ReactNativeWebView.postMessage(JSON.stringify({type:'moved',lat:c.lat,lng:c.lng}));});
map.on('dblclick',function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'searchhere',lat:e.latlng.lat,lng:e.latlng.lng}));});
map.on('contextmenu',function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'longpress',lat:e.latlng.lat,lng:e.latlng.lng}));});
window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
</script></body></html>`;
}

// Geographic context pane — merged, layer-coloured pins. The map persists; only
// markers update (via injectJavaScript → window.setData). Adding still happens
// in the carousel/list beneath, so the map itself is browse + anchor-search.
function DiscoverMap({ places, onMoved, onSelect, onSearchHere, onLongPress, showSearchArea, onSearchArea }) {
  const ref = useRef(null);
  const withCoords = places.filter(p => p.lat != null && p.lng != null);
  const pts = withCoords.map((p, i) => ({ i, lat: p.lat, lng: p.lng, t: p.activityType, r: p.rating }));
  const ptsJSON = JSON.stringify(pts);
  const html = React.useMemo(() => buildMapHTML(), []);
  const push = () => { ref.current?.injectJavaScript(`window.setData&&window.setData(${ptsJSON});true;`); };
  useEffect(() => { push(); }, [ptsJSON]);

  return (
    <View style={s.mapPane}>
      <WebView ref={ref} originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: '#dfe6e9' }}
        onLoadEnd={push}
        onMessage={e => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.type === 'moved') onMoved && onMoved({ lat: d.lat, lng: d.lng });
            else if (d.type === 'select' && withCoords[d.index]) onSelect && onSelect(withCoords[d.index]);
            else if (d.type === 'searchhere') onSearchHere && onSearchHere({ lat: d.lat, lng: d.lng });
            else if (d.type === 'longpress') onLongPress && onLongPress({ lat: d.lat, lng: d.lng });
            else if (d.type === 'ready') push();
          } catch (_) {}
        }} />
      {withCoords.length === 0 && (
        <View style={mp.emptyOverlay} pointerEvents="none">
          <Text style={s.errorText}>No map locations here — try other layers or move the map.</Text>
        </View>
      )}
      {showSearchArea && (
        <View style={mp.topOverlay} pointerEvents="box-none">
          <TouchableOpacity style={s.searchAreaBtn} onPress={onSearchArea} activeOpacity={0.85}>
            <Icon name="search" size={14} color="#fff" />
            <Text style={s.searchAreaText}>Search this area</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function DiscoverModal({ visible, onClose, trip, dayIndex, defaultTime }) {
  const insets = useSafeAreaInsets();
  const { addActivity, applyArrangedActivities } = useStore();

  const [viewMode,   setViewMode]   = useState('list'); // 'list' | 'map'
  const [mapCenter,  setMapCenter]  = useState(null);   // {lat,lng} of the map view
  const [mapMoved,   setMapMoved]   = useState(false);  // user panned → show "Search this area"
  const [areaSearch, setAreaSearch] = useState(null);   // committed map area; sticky scope for searches
  const [selectedName, setSelectedName] = useState(null); // pin-tapped place (highlight + scroll carousel)
  const carouselRef = useRef(null);
  const pendingCloseRef = useRef(false); // iOS: close Discover after the preview sheet dismisses
  const [selectMode, setSelectMode] = useState(false);  // basket multi-select
  const [basket,     setBasket]     = useState([]);      // chosen places (city-tagged)
  const [preview,    setPreview]    = useState(null);    // autoArrange draft + editable placements
  const [arrangeHints, setArrangeHints] = useState({});  // placeName → { pinDay?, dayCount? }
  const [editingRow,   setEditingRow]   = useState(null);// draftId whose edit panel is open
  const [layers,      setLayers]      = useState({ see: true, eat: true, stay: true }); // multi-select map layers
  const [layerData,   setLayerData]   = useState({ see: [], eat: [], stay: [] });       // per-layer fetched places
  const [textResults, setTextResults] = useState([]);                                   // free-text search results
  const [anchorPlace, setAnchorPlace] = useState(null);                                 // pin tapped → "X nearby" actions
  const [searchText,  setSearchText]  = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,          setError]          = useState(null);
  const [addedNames,     setAddedNames]     = useState(new Set());
  const [activeFilters,  setActiveFilters]  = useState([]);
  const [pendingPlace,   setPendingPlace]   = useState(null);
  const [pickerDay,      setPickerDay]      = useState(dayIndex ?? 0);
  const [pickerSlot,     setPickerSlot]     = useState('morning');
  const [hotelRate,      setHotelRate]      = useState('');   // nightly rate $
  const [hotelNights,    setHotelNights]    = useState('1');  // nights
  const [cities,         setCities]         = useState([]);     // searchable cities
  const [activeCity,     setActiveCity]     = useState('');     // current search city
  const [cityPickerOpen, setCityPickerOpen] = useState(false);  // city picker sheet
  const [newCity,        setNewCity]        = useState('');
  const searchTimeout = useRef(null);
  const filterTimeout = useRef(null);
  const cacheRef      = useRef(new Map());   // query string -> places[] (per-session)

  const destination   = trip?.destination ?? '';
  const families      = trip?.families ?? [];
  const allDietary    = families.flatMap(f => f.dietary || []);  // seeds the dietary filter chips below

  // Merged, layer-filtered results feeding the list, carousel and map. Free-text
  // mode searches across all types then filters by enabled layers; default mode
  // concatenates each enabled layer's results (deduped, best-rated first).
  const results = React.useMemo(() => {
    if (searchText.trim()) {
      return textResults.filter(p => layers[TYPE_TO_LAYER[p.activityType]] !== false);
    }
    const seen = new Set();
    return LAYERS.filter(l => layers[l.key])
      .flatMap(l => layerData[l.key] || [])
      .filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; })
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [searchText, textResults, layerData, layers]);

  useEffect(() => {
    if (!visible) return;
    const parsed = parseLocations(destination);
    const start  = parsed[0] || destination;
    setSearchText(''); setAddedNames(new Set());
    setLayers({ see: true, eat: true, stay: true });
    setLayerData({ see: [], eat: [], stay: [] }); setTextResults([]); setAnchorPlace(null);
    setSelectMode(false); setBasket([]); setPreview(null); setArrangeHints({}); setEditingRow(null); setViewMode('list');
    setAreaSearch(null); setMapMoved(false); setMapCenter(null); setSelectedName(null);
    setCities(parsed.length ? parsed : (destination ? [destination] : []));
    setActiveCity(start);
    setCityPickerOpen(false); setNewCity('');
    cacheRef.current.clear();
    setActiveFilters(FILTER_OPTS.filter(f => allDietary.includes(f.key)).map(f => f.key));
  }, [visible]);

  // One fetch per unique query+area, cached per session.
  const cachedFetch = async (q, bias) => {
    const key = q + (bias ? `@${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : '');
    if (cacheRef.current.has(key)) return cacheRef.current.get(key);
    const places = await fetchPlaces(q, bias);
    cacheRef.current.set(key, places);
    return places;
  };

  // Load whatever the current scope needs: free-text → one cross-type search;
  // otherwise → each enabled layer's default query (parallel). `area` biases to
  // a point (search-this-area / anchor / double-tap) and drops the city scope.
  const loadScope = async () => {
    const loc  = activeCity || destination;
    const area = areaSearch;
    const text = searchText.trim();
    const diet = [getDietaryBias(families), getFilterBias(activeFilters)].filter(Boolean).join(' ');
    const bias = area ? { lat: area.lat, lng: area.lng, radius: area.radius || 12000 } : null;
    setError(null); setSelectedName(null); setAnchorPlace(null); setLoading(true);
    try {
      // Keep area searches tight: drop results outside ~1.6× the bias radius so
      // an outlier can't blow out the map's fit-to-bounds.
      const near = ps => area
        ? ps.filter(p => p.lat != null && p.lng != null && metersBetween(area, p) <= (area.radius || 12000) * 1.6)
        : ps;
      if (text) {
        const q = (area ? text : `${text} near ${loc}`) + (diet ? ` ${diet}` : '');
        const places = near(await cachedFetch(q, bias));
        setTextResults(places);
        if (!places.length) setError(`No results for "${text}".`);
      } else {
        const want = LAYERS.filter(l => layers[l.key]);
        const got  = await Promise.all(want.map(async L => {
          const q = (area ? L.query : `${L.query} in ${loc}`) + (L.key === 'eat' && diet ? ` ${diet}` : '');
          const places = near(await cachedFetch(q, bias));
          return [L.key, places.map(p => ({ ...p, activityType: L.type, _layer: L.key }))];
        }));
        const next = { see: [], eat: [], stay: [] };
        got.forEach(([k, v]) => { next[k] = v; });
        setLayerData(next);
        if (!got.reduce((n, [, v]) => n + v.length, 0)) setError('No results found.');
      }
    } finally { setLoading(false); }
  };

  // Single debounced driver: typing waits 450ms; layer/city/area/filter changes
  // fire ~immediately. Reads current state, so callers just set state.
  useEffect(() => {
    if (!visible || !activeCity) return;
    const t = setTimeout(() => { loadScope(); }, searchText.trim() ? 450 : 0);
    return () => clearTimeout(t);
  }, [visible, activeCity, areaSearch, layers, activeFilters, searchText]);

  // Map panned → offer to re-search that area (Redfin "search this area").
  const handleMapMoved = c => { setMapCenter(c); setMapMoved(true); };
  const searchThisArea = () => { if (mapCenter) { setMapMoved(false); setAreaSearch({ ...mapCenter, radius: 12000 }); } };
  // Re-search around a point — double-tap, long-press, or an anchor "X nearby".
  // Optionally force a layer on so e.g. "Stay nearby" guarantees hotels appear.
  const searchAround = (pt, enableKey, radius = 5000) => {
    setMapMoved(false); setAnchorPlace(null);
    if (enableKey) setLayers(prev => ({ ...prev, [enableKey]: true }));
    setAreaSearch({ lat: pt.lat, lng: pt.lng, radius });
  };
  // Pin tapped → scroll carousel to it + reveal "X nearby" anchor actions.
  const handleMapSelect = place => {
    setAnchorPlace(place);
    const idx = results.findIndex(p => p.name === place.name);
    if (idx >= 0) {
      setSelectedName(place.name);
      try { carouselRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 }); } catch (_) {}
    }
  };

  const handleSearchChange = text => setSearchText(text);   // debounced by the load effect

  // Layers are independent on/off — but at least one must stay on.
  const toggleLayer = key => setLayers(prev => {
    const next = { ...prev, [key]: !prev[key] };
    return (!next.see && !next.eat && !next.stay) ? prev : next;
  });

  const toggleFilter = key =>
    setActiveFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // Selecting a city re-runs the search via the activeCity effect (resets area scope).
  const chooseCity = c => { setCityPickerOpen(false); setAreaSearch(null); setMapMoved(false); setActiveCity(c); };

  // Commit a freely-typed city (need not be in the trip's destination).
  const commitNewCity = () => {
    const c = newCity.trim();
    setNewCity('');
    if (!c) { setCityPickerOpen(false); return; }
    setCities(prev => prev.some(x => cityLabel(x) === cityLabel(c)) ? prev : [...prev, c]);
    setCityPickerOpen(false);
    setAreaSearch(null); setMapMoved(false);
    setActiveCity(c);
  };

  const handleAdd = place => {
    setPickerDay(dayIndex ?? 0);
    setPickerSlot(getSlotKey(defaultTime || '09:00'));
    setHotelRate(''); setHotelNights('1');
    setPendingPlace(place);
  };

  const handleConfirmAdd = () => {
    if (!pendingPlace) return;
    const smartTime = getSuggestedTime(trip, pickerDay, pickerSlot);
    const isStay    = pendingPlace.activityType === 'stay';

    // Hotel: capture the nightly rate the user found while booking. Store the
    // booking TOTAL (rate × nights) for display, and a per-person share so the
    // existing expense-split (costPerPerson × members) totals correctly.
    let cost = { costPerPerson: pendingPlace.costPerPerson, costMode: 'per_person', costAmount: pendingPlace.costPerPerson };
    let detail = '';
    const rate = parseFloat(hotelRate);
    if (isStay && rate > 0) {
      const nights  = Math.max(1, parseInt(hotelNights, 10) || 1);
      const total   = rate * nights;
      const members = Math.max(1, getAllMembers(trip).length);
      cost   = { costPerPerson: parseFloat((total / members).toFixed(2)), costMode: 'total', costAmount: total };
      detail = `${nights} night${nights !== 1 ? 's' : ''} · $${rate}/night`;
    }

    addActivity(trip.id, pickerDay, {
      id:uid(), type:pendingPlace.activityType, time:smartTime,
      name:pendingPlace.name, detail,
      ...cost,
      address:pendingPlace.address, url:pendingPlace.url,
      rating:pendingPlace.rating, lat:pendingPlace.lat, lng:pendingPlace.lng,
      city:cityLabel(activeCity),   // tag the source city → Trip Check flags multi-city days
      note:null, status:null,
    });
    setAddedNames(prev => new Set([...prev, pendingPlace.name]));
    setPendingPlace(null);
  };

  // ── Basket (auto-arrange) handlers ──────────────────────────────
  const basketHas = name => basket.some(p => p.name === name);
  const toggleBasket = place => {
    setBasket(prev => prev.some(p => p.name === place.name)
      ? prev.filter(p => p.name !== place.name)
      : [...prev, { ...place, city: cityLabel(activeCity) }]);  // tag source city for clustering
  };
  // Run the engine with the current per-event hints attached.
  const rerun = (hints) => {
    setArrangeHints(hints);
    const hinted = basket.map(p => hints[p.name] ? { ...p, _hint: hints[p.name] } : p);
    setPreview(autoArrange(hinted, trip));
  };
  const runArrange = () => {
    if (!basket.length) return;
    setEditingRow(null);
    rerun({});   // fresh arrange — clear any prior hints
  };
  // Move one item to a specific day. To keep the move LOCAL, first pin every
  // currently-placed single-instance item to the day it's on, then override
  // this one — so re-running the engine doesn't reshuffle everything else.
  const moveToDay = (draft, dayIdx) => {
    const snap = { ...arrangeHints };
    (preview?.placements || []).forEach((acts, i) => acts.forEach(a => {
      const multi = (arrangeHints[a.name]?.dayCount || 1) > 1 || a.repeatIntent;
      if (!multi) snap[a.name] = { ...(snap[a.name] || {}), pinDay: i };
    }));
    snap[draft.name] = { ...(snap[draft.name] || {}), pinDay: dayIdx };
    setEditingRow(null);
    rerun(snap);
  };
  // Set how many days a (big) venue spans. dayCount > 1 and pinDay conflict,
  // so clear pinDay when spanning.
  const setSpan = (draft, n) => {
    const next = { ...arrangeHints };
    const cur = { ...(next[draft.name] || {}) };
    if (n <= 1) delete cur.dayCount; else { cur.dayCount = n; delete cur.pinDay; }
    next[draft.name] = cur;
    setEditingRow(null);
    rerun(next);
  };
  const removeFromPreview = (dayIdx, draftId) => {
    setPreview(prev => prev && ({
      ...prev,
      placements: prev.placements.map((acts, i) => i === dayIdx ? acts.filter(a => a._draftId !== draftId) : acts),
    }));
  };
  const applyPreview = () => {
    if (!preview) return;
    applyArrangedActivities(trip.id, preview.placements);
    setBasket([]); setSelectMode(false); setArrangeHints({}); setEditingRow(null);
    // iOS: dismissing two stacked pageSheet modals in the same tick blanks the
    // screen. Close the preview first, then close Discover once it has finished
    // dismissing (via the preview Modal's onDismiss). Android has no such issue.
    if (Platform.OS === 'ios') {
      pendingCloseRef.current = true;
      setPreview(null);
    } else {
      setPreview(null);
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={[s.container,{paddingTop:insets.top+8}]}>

          <View style={s.header}>
            <View style={{flex:1}}>
              <Text style={s.title}>Discover</Text>
            </View>
            <View style={s.headerActions}>
              <TouchableOpacity style={[s.modeBtn, selectMode&&s.modeBtnOn]} onPress={() => setSelectMode(m => !m)} activeOpacity={0.8}>
                <Icon name={selectMode?'sparkles':'add'} size={13} color={selectMode?colors.smart:colors.text} />
                <Text style={[s.modeBtnText, selectMode&&s.modeBtnTextOn]}>{selectMode ? 'Building' : 'Build a day'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                <Text style={s.closeBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.searchRow}>
            <Icon name="search" size={16} color={colors.subtle} style={{marginRight:spacing.xs}} />
            <TextInput
              style={s.searchInput} value={searchText} onChangeText={handleSearchChange}
              placeholder={`Search in ${cityLabel(activeCity) || destination}…`} placeholderTextColor={colors.muted}
              returnKeyType="search" onSubmitEditing={() => loadScope()}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Prominent location bar — where you're searching + tap to change city */}
          <TouchableOpacity style={s.locBar} onPress={() => setCityPickerOpen(true)} activeOpacity={0.7}>
            <Icon name="location" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.locBarCaption}>SEARCHING IN</Text>
              <Text style={s.locBarCity} numberOfLines={1}>{cityLabel(activeCity) || destination || 'Pick a city'}</Text>
            </View>
            <Text style={s.locBarChange}>Change</Text>
            <Icon name="forward" size={14} color={colors.accent} />
          </TouchableOpacity>

          {/* Map layers — independent See / Eat / Stay toggles. Each carries its
              type colour (= the map-pin legend); turn on any mix. */}
          <View style={s.focusBar}>
            {LAYERS.map(L => {
              const on = layers[L.key];
              return (
                <TouchableOpacity key={L.key} style={[s.focusBtn, on && s.focusBtnOn]}
                  onPress={() => toggleLayer(L.key)} activeOpacity={0.85}>
                  <View style={[s.layerDot, { backgroundColor: on ? L.tint : colors.hairline }]} />
                  <Icon name={L.icon} size={16} color={on ? L.tint : colors.subtle} />
                  <Text style={[s.focusLabel, on && { color: L.tint }]}>{L.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {layers.eat && (
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
          )}

          {/* Results count + List/Map toggle (stays put while re-searching) */}
          {!error && results.length > 0 && (
            <View style={s.resultsBar}>
              <Text style={s.resultCount}>{results.length} place{results.length !== 1 ? 's' : ''}{loading ? ' · searching…' : ''}</Text>
              <View style={s.viewToggle}>
                {[{ k: 'list', ic: 'list' }, { k: 'map', ic: 'map' }].map(v => (
                  <TouchableOpacity key={v.k} style={[s.viewToggleBtn, viewMode === v.k && s.viewToggleBtnOn]}
                    onPress={() => setViewMode(v.k)} activeOpacity={0.8}>
                    <Icon name={v.ic} size={15} color={viewMode === v.k ? '#fff' : colors.subtle} />
                    <Text style={[s.viewToggleText, viewMode === v.k && { color: '#fff' }]}>{v.k === 'list' ? 'List' : 'Map'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {viewMode === 'map' ? (
            // Map stays mounted across searches (markers update live). Tap a pin
            // for "X nearby"; double-tap or long-press to search that spot.
            <View style={{ flex: 1 }}>
              <DiscoverMap places={results} onMoved={handleMapMoved} onSelect={handleMapSelect}
                onSearchHere={pt => searchAround(pt)} onLongPress={pt => searchAround(pt)}
                showSearchArea={mapMoved} onSearchArea={searchThisArea} />
              {loading && (
                <View style={s.mapLoadPill} pointerEvents="none">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.mapLoadText}>Searching…</Text>
                </View>
              )}
              {anchorPlace && (
                <View style={s.anchorBar}>
                  <Text style={s.anchorName} numberOfLines={1}>Near {anchorPlace.name}</Text>
                  <View style={s.anchorChips}>
                    {LAYERS.map(L => (
                      <TouchableOpacity key={L.key} style={[s.anchorChip, { borderColor: L.tint }]}
                        onPress={() => searchAround({ lat: anchorPlace.lat, lng: anchorPlace.lng }, L.key)} activeOpacity={0.8}>
                        <View style={[s.layerDot, { backgroundColor: L.tint }]} />
                        <Text style={[s.anchorChipText, { color: L.tint }]}>{L.label} nearby</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              <FlatList ref={carouselRef} data={results} keyExtractor={(item,i)=>`${item.name}-${i}`}
                horizontal showsHorizontalScrollIndicator={false}
                style={s.carousel} contentContainerStyle={s.carouselContent}
                getItemLayout={(_,i)=>({length:198,offset:198*i+spacing.md,index:i})}
                onScrollToIndexFailed={()=>{}}
                renderItem={({item}) => (
                  <PlaceMapCard place={item} checked={basketHas(item.name)} selected={selectedName===item.name} onToggle={toggleBasket}/>
                )}
              />
            </View>
          ) : loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary}/><Text style={s.loadingText}>Searching {cityLabel(activeCity) || destination}…</Text></View>
          ) : error ? (
            <View style={s.center}><Icon name="search" size={34} color={colors.subtle} /><Text style={s.errorText}>{error}</Text></View>
          ) : (
            <FlatList data={results} keyExtractor={(item,i)=>`${item.name}-${i}`}
              contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
              renderItem={({item}) => (
                <PlaceCard place={item} onAdd={handleAdd} added={addedNames.has(item.name)}
                  selectMode={selectMode} selected={basketHas(item.name)} onToggle={toggleBasket}/>
              )}
            />
          )}

          {/* Basket bar — appears once events are chosen (select mode or map) */}
          {(selectMode || viewMode === 'map') && basket.length > 0 && (
            <View style={[s.basketBar, { paddingBottom: (insets.bottom || spacing.md) }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.basketCount}>{basket.length} event{basket.length !== 1 ? 's' : ''} selected</Text>
                <Text style={s.basketHint}>We'll spread them across your days</Text>
              </View>
              <TouchableOpacity style={s.basketBtn} onPress={runArrange} activeOpacity={0.85}>
                <Icon name="sparkles" size={15} color="#fff" />
                <Text style={s.basketBtnText}>Auto-arrange</Text>
              </TouchableOpacity>
            </View>
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
                  const suggested = getSuggestedTime(trip, pickerDay, slot.key);
                  const count     = getSlotCount(trip, pickerDay, slot.key);
                  const isActive  = pickerSlot===slot.key;
                  return (
                    <TouchableOpacity key={slot.key}
                      style={[sp.slotBtn, isActive&&sp.slotBtnActive]}
                      onPress={() => setPickerSlot(slot.key)} activeOpacity={0.7}>
                      <View style={sp.slotBtnTop}>
                        <Text style={sp.slotEmoji}>{slot.emoji}</Text>
                        <Text style={[sp.slotLabel, isActive&&{color:colors.primary}]}>{slot.label}</Text>
                      </View>
                      <Text style={sp.slotMeta}>Add at {suggested}</Text>
                      <Text style={sp.slotCount}>{count===0?'Open':`${count} act${count!==1?'s':''}`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {pendingPlace?.activityType === 'stay' && (
                <View style={sp.hotelBox}>
                  <Text style={sp.sectionLabel}>Nightly rate (optional)</Text>
                  <Text style={sp.hotelHint}>Tap "Book rooms ↗" on the card to check prices, then enter what you chose.</Text>
                  <View style={sp.hotelRow}>
                    <View style={sp.hotelField}>
                      <Text style={sp.hotelFieldLabel}>$ / night</Text>
                      <TextInput style={sp.hotelInput} value={hotelRate} onChangeText={setHotelRate} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />
                    </View>
                    <View style={sp.hotelField}>
                      <Text style={sp.hotelFieldLabel}>Nights</Text>
                      <TextInput style={sp.hotelInput} value={hotelNights} onChangeText={setHotelNights} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.muted} />
                    </View>
                    <View style={sp.hotelTotal}>
                      <Text style={sp.hotelFieldLabel}>Total</Text>
                      <Text style={sp.hotelTotalAmt}>${((parseFloat(hotelRate)||0) * Math.max(1, parseInt(hotelNights,10)||1)).toFixed(0)}</Text>
                    </View>
                  </View>
                </View>
              )}

              {(() => {
                const smart = getSuggestedTime(trip, pickerDay, pickerSlot);
                const day   = trip.days[pickerDay];
                const slot  = SLOTS.find(s => s.key===pickerSlot);
                return (
                  <TouchableOpacity style={sp.confirmBtn} onPress={handleConfirmAdd} activeOpacity={0.85}>
                    <Text style={sp.confirmBtnText}>Add at {smart} · {day?.label} {slot?.emoji} {slot?.label}</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Auto-arrange preview — editable draft, nothing committed until Apply */}
        <Modal visible={!!preview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPreview(null)}
          onDismiss={() => { if (pendingCloseRef.current) { pendingCloseRef.current = false; onClose(); } }}>

          <View style={[s.container, { paddingTop: insets.top + 8 }]}>
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Suggested plan</Text>
                <Text style={s.subtitle} numberOfLines={1}>
                  {preview?.summary.placed} placed{preview?.summary.unplaced ? ` · ${preview.summary.unplaced} didn't fit` : ''} · review & edit
                </Text>
              </View>
              <TouchableOpacity style={[s.modeBtn]} onPress={() => setPreview(null)}>
                <Text style={s.modeBtnText}>Back</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.xxl, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
              {(trip.days || []).map((d, i) => {
                const acts = preview?.placements[i] || [];
                if (!acts.length) return null;
                return (
                  <View key={d.date} style={pv.dayCard}>
                    <Text style={pv.dayTitle}>{d.label} · {d.date?.slice(5)}</Text>
                    {acts.map(a => {
                      const span = arrangeHints[a.name]?.dayCount || 1;
                      const editing = editingRow === a._draftId;
                      return (
                      <View key={a._draftId}>
                        <View style={pv.row}>
                          <Text style={pv.time}>{a.time}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={pv.name} numberOfLines={1}>
                              {a.type === 'food' ? '\u{1F37D}️' : a.type === 'stay' ? '\u{1F3E8}' : '\u{1F3AF}'} {a.name}
                              {a.repeatIntent ? '  \u{1F501}' : ''}
                            </Text>
                            <View style={pv.metaRow}>
                              {!!a.city && <Text style={pv.city} numberOfLines={1}>{'\u{1F4CD}'} {a.city}</Text>}
                              {a.type !== 'food' && (
                                <TouchableOpacity onPress={() => setEditingRow(editing ? null : a._draftId)} hitSlop={6}>
                                  <Text style={pv.editLink}>{editing ? 'Done' : 'Move / multi-day ▾'}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                          <TouchableOpacity onPress={() => removeFromPreview(i, a._draftId)} style={pv.remove} hitSlop={8}>
                            <Text style={pv.removeText}>✕</Text>
                          </TouchableOpacity>
                        </View>

                        {editing && (
                          <View style={pv.editPanel}>
                            <Text style={pv.editLabel}>Move to day</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pv.chipRow}>
                              {(trip.days || []).map((dd, di) => (
                                <TouchableOpacity key={dd.date} style={[pv.dayChip, di === i && pv.dayChipOn]}
                                  onPress={() => moveToDay(a, di)} activeOpacity={0.7}>
                                  <Text style={[pv.dayChipText, di === i && pv.dayChipTextOn]}>{dd.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <Text style={pv.editLabel}>Stay for</Text>
                            <View style={pv.chipRow}>
                              {[1, 2, 3].map(n => (
                                <TouchableOpacity key={n} style={[pv.spanBtn, span === n && pv.spanBtnOn]}
                                  onPress={() => setSpan(a, n)} activeOpacity={0.7}>
                                  <Text style={[pv.spanBtnText, span === n && pv.spanBtnTextOn]}>{n} day{n > 1 ? 's' : ''}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                      );
                    })}
                  </View>
                );
              })}

              {preview?.unplaced?.length > 0 && (
                <View style={pv.unplacedCard}>
                  <Text style={pv.unplacedTitle}>Couldn't fit ({preview.unplaced.length})</Text>
                  {preview.unplaced.map((p, idx) => <Text key={idx} style={pv.unplacedItem}>• {p.name}</Text>)}
                  <Text style={pv.unplacedHint}>Add a day to the trip, or remove some events, then re-arrange.</Text>
                </View>
              )}

              {preview?.warnings?.some(w => w.severity === 'error') && (
                <Text style={pv.warn}>
                  {'⚠'} {preview.warnings.filter(w => w.severity === 'error').length} scheduling conflict(s) — fixable in Trip Check after applying.
                </Text>
              )}
            </ScrollView>

            <View style={[pv.applyBar, { paddingBottom: (insets.bottom || spacing.md) }]}>
              <TouchableOpacity style={pv.reBtn} onPress={runArrange} activeOpacity={0.8}>
                <Text style={pv.reBtnText}>{'↻'} Re-arrange</Text>
              </TouchableOpacity>
              <TouchableOpacity style={pv.applyBtn} onPress={applyPreview} activeOpacity={0.85}>
                <Text style={pv.applyBtnText}>Apply to trip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* City picker sheet */}
        <Modal visible={cityPickerOpen} transparent animationType="slide" onRequestClose={() => setCityPickerOpen(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={sp.overlay} activeOpacity={1} onPress={() => setCityPickerOpen(false)}>
            <View style={sp.sheet} onStartShouldSetResponder={() => true}>
              <View style={sp.handle}/>
              <Text style={sp.sheetTitle}>Search which city?</Text>
              <Text style={sp.sheetSubtitle}>Pick a stop or type any city — handy for multi-city trips.</Text>

              <View style={s.cityPickWrap}>
                {cities.map(c => {
                  const sel = c === activeCity;
                  return (
                    <TouchableOpacity key={c} style={[s.cityPick, sel&&s.cityPickActive]} onPress={() => chooseCity(c)} activeOpacity={0.7}>
                      <Text style={[s.cityPickText, sel&&s.cityPickTextActive]} numberOfLines={1}>{'\u{1F4CD}'} {cityLabel(c)}</Text>
                      {sel && <Text style={s.cityPickCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.cityAddLabel}>Add another city</Text>
              <View style={s.cityAddRow}>
                <TextInput
                  style={s.cityAddInput} value={newCity} onChangeText={setNewCity}
                  placeholder="e.g. San Diego" placeholderTextColor={colors.muted}
                  returnKeyType="search" onSubmitEditing={commitNewCity} autoCorrect={false}
                />
                <TouchableOpacity style={[s.cityAddBtn, !newCity.trim()&&s.cityAddBtnOff]} onPress={commitNewCity} disabled={!newCity.trim()}>
                  <Text style={s.cityAddBtnText}>Search</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
          </KeyboardAvoidingView>
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
  headerActions:{flexDirection:'row',alignItems:'center',gap:spacing.xs,marginTop:4},
  modeBtn:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:radius.full,paddingHorizontal:spacing.md,paddingVertical:8,borderWidth:1.5,borderColor:colors.border,backgroundColor:'#fff'},
  modeBtnOn:{backgroundColor:colors.smartSoft,borderColor:colors.smart},
  modeBtnText:{fontSize:13,fontWeight:'800',color:colors.text},
  modeBtnTextOn:{color:colors.smart},
  basketBar:{flexDirection:'row',alignItems:'center',gap:spacing.md,paddingHorizontal:spacing.xxl,paddingTop:spacing.md,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:colors.border,...shadow.lg},
  basketCount:{...typography.bodyBold,color:colors.text},
  basketHint:{fontSize:11,color:colors.muted,marginTop:1},
  basketBtn:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:colors.smart,borderRadius:radius.full,paddingHorizontal:spacing.xl,paddingVertical:spacing.md},
  basketBtnText:{color:'#fff',fontWeight:'800',fontSize:15},
  searchRow:{flexDirection:'row',alignItems:'center',marginHorizontal:spacing.xxl,marginBottom:spacing.sm,backgroundColor:colors.surface2,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.xs,borderWidth:1,borderColor:colors.border},
  searchIcon:{fontSize:15,marginRight:spacing.xs},
  searchInput:{flex:1,fontSize:15,color:colors.text,paddingVertical:6},
  // Fixed-height pills with vertically-centered, separately-sized emoji + label.
  // paddingVertical on the scroll content guarantees the viewport is always
  // taller than the pill, so glyphs can never be clipped.
  // Primary Do/Eat/Stay segmented control
  focusBar:{flexDirection:'row',marginHorizontal:spacing.xxl,marginBottom:spacing.sm,backgroundColor:colors.surface2,borderRadius:radius.lg,padding:4,gap:4},
  focusBtn:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:10,borderRadius:radius.md},
  focusBtnOn:{backgroundColor:'#fff',...shadow.sm},
  focusLabel:{fontSize:14,fontWeight:'800',color:colors.subtle},
  layerDot:{width:8,height:8,borderRadius:4},
  // Map overlays: searching pill + anchor "X nearby" actions
  mapLoadPill:{position:'absolute',top:10,right:12,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'rgba(255,255,255,0.95)',borderRadius:radius.full,paddingHorizontal:12,paddingVertical:6,...shadow.sm},
  mapLoadText:{fontSize:12,fontWeight:'700',color:colors.body},
  anchorBar:{position:'absolute',left:spacing.md,right:spacing.md,top:10,backgroundColor:'#fff',borderRadius:radius.lg,padding:spacing.sm,borderWidth:1,borderColor:colors.hairline,...shadow.lg},
  anchorName:{fontSize:12,fontWeight:'800',color:colors.ink,marginBottom:6},
  anchorChips:{flexDirection:'row',gap:6},
  anchorChip:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1.5,borderRadius:radius.full,paddingHorizontal:10,paddingVertical:6,backgroundColor:'#fff'},
  anchorChipText:{fontSize:12,fontWeight:'800'},
  chipsScroll:{flexGrow:0,marginBottom:spacing.sm},
  chips:{paddingHorizontal:spacing.xxl,paddingVertical:4,gap:spacing.xs,alignItems:'center'},
  chip:{height:36,flexDirection:'row',alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:spacing.md,backgroundColor:'#fff'},
  chipEmoji:{fontSize:14,marginRight:5},
  chipLabel:{fontSize:13,color:colors.text,fontWeight:'600'},
  chipActive:{backgroundColor:colors.primary,borderColor:colors.primary},
  chipTextActive:{color:'#fff'},
  locChipActive:{backgroundColor:colors.accent,borderColor:colors.accent},
  // Prominent "searching in <city>" bar
  locBar:{flexDirection:'row',alignItems:'center',gap:spacing.sm,marginHorizontal:spacing.xxl,marginBottom:spacing.sm,backgroundColor:colors.accentSoft,borderRadius:radius.md,borderWidth:1,borderColor:colors.accentTint,paddingHorizontal:spacing.md,paddingVertical:spacing.sm},
  locBarPin:{fontSize:18},
  locBarCaption:{fontSize:9,fontWeight:'800',color:colors.accent,letterSpacing:0.8},
  locBarCity:{fontSize:15,fontWeight:'800',color:colors.accentDark},
  locBarChange:{fontSize:13,fontWeight:'800',color:colors.accent},
  // City picker sheet
  cityPickWrap:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.lg},
  cityPick:{flexDirection:'row',alignItems:'center',gap:6,borderWidth:1.5,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,backgroundColor:'#fff'},
  cityPickActive:{borderColor:colors.accent,backgroundColor:colors.accentSoft},
  cityPickText:{fontSize:14,fontWeight:'600',color:colors.text},
  cityPickTextActive:{color:colors.accentDark,fontWeight:'800'},
  cityPickCheck:{fontSize:14,fontWeight:'800',color:colors.accent},
  cityAddLabel:{fontSize:10,fontWeight:'800',color:colors.muted,textTransform:'uppercase',letterSpacing:0.8,marginBottom:spacing.sm},
  cityAddRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm},
  cityAddInput:{flex:1,borderWidth:1.5,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,fontSize:15,color:colors.text,backgroundColor:'#fff'},
  cityAddBtn:{backgroundColor:colors.primary,borderRadius:radius.md,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm},
  cityAddBtnOff:{backgroundColor:colors.border},
  cityAddBtnText:{color:'#fff',fontWeight:'800',fontSize:14},
  filterChipActive:{backgroundColor:'#dcfce7',borderColor:'#16a34a'},
  filterChipTextActive:{color:'#15803d',fontWeight:'700'},
  dietBadge:{fontSize:11,color:'#15803d',fontWeight:'700',marginTop:3},
  list:{paddingHorizontal:spacing.xxl,paddingBottom:32},
  mapPane:{flex:1,backgroundColor:'#dfe6e9'},
  carousel:{position:'absolute',left:0,right:0,bottom:0},
  carouselContent:{paddingHorizontal:spacing.md,paddingVertical:spacing.md},
  searchAreaWrap:{position:'absolute',top:12,left:0,right:0,alignItems:'center'},
  searchAreaBtn:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:colors.ink,borderRadius:radius.full,paddingHorizontal:spacing.lg,paddingVertical:spacing.sm,...shadow.lg},
  searchAreaText:{color:'#fff',fontWeight:'800',fontSize:13},
  resultsBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.xxl,paddingVertical:spacing.xs},
  resultCount:{...typography.caption,color:colors.muted},
  viewToggle:{flexDirection:'row',backgroundColor:colors.surface2,borderRadius:radius.full,padding:3,gap:2},
  viewToggleBtn:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:spacing.md,paddingVertical:5,borderRadius:radius.full},
  viewToggleBtnOn:{backgroundColor:colors.accent},
  viewToggleText:{fontSize:12,fontWeight:'800',color:colors.subtle},
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
  slotBtnTop:{flexDirection:'row',alignItems:'center',gap:6},
  slotEmoji:{fontSize:16},
  slotLabel:{...typography.bodyBold,color:colors.text,fontSize:13},
  slotMeta:{fontSize:13,fontWeight:'700',color:colors.primary},
  slotCount:{fontSize:10,color:colors.muted},
  hotelBox:{backgroundColor:colors.smartSoft,borderRadius:radius.lg,padding:spacing.md,marginBottom:spacing.md},
  hotelHint:{fontSize:11,color:colors.subtle,marginBottom:spacing.sm,lineHeight:15},
  hotelRow:{flexDirection:'row',alignItems:'flex-end',gap:spacing.sm},
  hotelField:{flex:1},
  hotelFieldLabel:{fontSize:10,fontWeight:'800',color:colors.subtle,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4},
  hotelInput:{backgroundColor:'#fff',borderWidth:1.5,borderColor:colors.hairline,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.sm,fontSize:16,fontWeight:'700',color:colors.ink},
  hotelTotal:{flex:1,alignItems:'flex-end'},
  hotelTotalAmt:{fontSize:20,fontWeight:'900',color:colors.smartDeep},
  confirmBtn:{backgroundColor:colors.primary,borderRadius:radius.lg,paddingVertical:spacing.md,alignItems:'center',marginTop:spacing.xs},
  confirmBtnDisabled:{backgroundColor:colors.border},
  confirmBtnText:{...typography.bodyBold,color:'#fff'},
});

const card = StyleSheet.create({
  wrap:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,marginBottom:spacing.sm,padding:spacing.md,gap:spacing.sm,...shadow.sm},
  thumb:{width:58,height:58,borderRadius:radius.md,backgroundColor:colors.surface2},
  thumbPh:{alignItems:'center',justifyContent:'center'},
  linkRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:4},
  linkText:{fontSize:12,fontWeight:'800',color:colors.accent},
  wrapSel:{borderColor:colors.smart,backgroundColor:colors.smartSoft},
  body:{flex:1,gap:4},
  nameRow:{flexDirection:'row',alignItems:'flex-start',gap:6},
  typeIcon:{fontSize:16,marginTop:1},
  name:{...typography.bodyBold,color:colors.text,flex:1,lineHeight:20},
  meta:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  ratingRow:{flexDirection:'row',alignItems:'center',gap:3},
  rating:{fontSize:12,color:'#92400e',fontWeight:'700'},
  costBadge:{backgroundColor:'#e0faf4',borderRadius:radius.full,paddingHorizontal:8,paddingVertical:2},
  costText:{fontSize:11,fontWeight:'700',color:colors.green},
  badge:{fontSize:13},
  address:{...typography.caption,color:colors.muted,lineHeight:16},
  addBtn:{width:36,height:36,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',flexShrink:0},
  addBtnDone:{backgroundColor:'#dcfce7'},
  addBtnText:{color:'#fff',fontSize:20,fontWeight:'700',lineHeight:22},
  vegBadge:{backgroundColor:'#dcfce7',borderRadius:radius.full,paddingHorizontal:6,paddingVertical:2,marginLeft:4},
  vegBadgeText:{fontSize:10,color:'#15803d',fontWeight:'700'},
});

// Auto-arrange preview sheet
const pv = StyleSheet.create({
  dayCard:{backgroundColor:'#fff',borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.md,marginBottom:spacing.md,...shadow.sm},
  dayTitle:{...typography.bodyBold,color:colors.text,marginBottom:spacing.sm},
  row:{flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingVertical:6,borderTopWidth:1,borderTopColor:colors.border},
  time:{fontSize:13,fontWeight:'800',color:colors.smart,width:48},
  name:{...typography.body,color:colors.text},
  metaRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginTop:1,flexWrap:'wrap'},
  city:{fontSize:11,color:colors.muted},
  editLink:{fontSize:11,fontWeight:'800',color:colors.smart},
  editPanel:{backgroundColor:colors.smartSoft,borderRadius:radius.md,padding:spacing.sm,marginTop:spacing.xs,marginBottom:spacing.xs,gap:spacing.xs},
  editLabel:{fontSize:10,fontWeight:'800',color:colors.smartDeep,textTransform:'uppercase',letterSpacing:0.6},
  chipRow:{flexDirection:'row',gap:spacing.xs,alignItems:'center',paddingVertical:2},
  dayChip:{borderWidth:1.5,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:spacing.md,paddingVertical:6,backgroundColor:'#fff'},
  dayChipOn:{borderColor:colors.smart,backgroundColor:colors.smartSoft},
  dayChipText:{fontSize:12,fontWeight:'700',color:colors.text},
  dayChipTextOn:{color:colors.smartDeep},
  spanBtn:{borderWidth:1.5,borderColor:colors.border,borderRadius:radius.full,paddingHorizontal:spacing.md,paddingVertical:6,backgroundColor:'#fff'},
  spanBtnOn:{borderColor:colors.smart,backgroundColor:colors.smartSoft},
  spanBtnText:{fontSize:12,fontWeight:'700',color:colors.text},
  spanBtnTextOn:{color:colors.smartDeep},
  remove:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#fef2f2'},
  removeText:{fontSize:14,fontWeight:'800',color:'#dc2626'},
  unplacedCard:{backgroundColor:'#fffbeb',borderRadius:radius.lg,borderWidth:1,borderColor:'#fde68a',padding:spacing.md,marginBottom:spacing.md},
  unplacedTitle:{...typography.bodyBold,color:'#92400e',marginBottom:spacing.xs},
  unplacedItem:{fontSize:13,color:'#92400e',lineHeight:20},
  unplacedHint:{fontSize:11,color:'#b45309',marginTop:spacing.xs,fontStyle:'italic'},
  warn:{fontSize:12,color:'#dc2626',fontWeight:'600',marginBottom:spacing.md,lineHeight:18},
  applyBar:{position:'absolute',left:0,right:0,bottom:0,flexDirection:'row',gap:spacing.md,paddingHorizontal:spacing.xxl,paddingTop:spacing.md,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:colors.border,...shadow.lg},
  reBtn:{borderRadius:radius.full,paddingHorizontal:spacing.xl,paddingVertical:spacing.md,borderWidth:1.5,borderColor:colors.border,backgroundColor:'#fff'},
  reBtnText:{fontSize:15,fontWeight:'800',color:colors.text},
  applyBtn:{flex:1,backgroundColor:colors.smart,borderRadius:radius.full,paddingVertical:spacing.md,alignItems:'center'},
  applyBtnText:{color:'#fff',fontWeight:'800',fontSize:16},
});

// Map view
const mp = StyleSheet.create({
  emptyOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',padding:spacing.xxl},
  topOverlay:{position:'absolute',top:10,left:0,right:0,alignItems:'center'},
  legendWrap:{position:'absolute',top:10,left:0,right:0,alignItems:'center'},
  legend:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'rgba(255,255,255,0.95)',borderRadius:radius.full,paddingHorizontal:12,paddingVertical:5,...shadow.sm},
  legendDot:{fontSize:11},
  legendTxt:{fontSize:11,fontWeight:'700',color:colors.body,marginRight:8},
  cardWrap:{position:'absolute',left:spacing.md,right:spacing.md,bottom:spacing.md},
});

// Map photo carousel card
const mc = StyleSheet.create({
  card:{width:190,backgroundColor:'#fff',borderRadius:radius.lg,marginRight:spacing.sm,overflow:'hidden',borderWidth:1,borderColor:colors.hairline,...shadow.lg},
  cardSel:{borderColor:colors.accent,borderWidth:2},
  photo:{width:'100%',height:104,backgroundColor:colors.surface2},
  photoPh:{alignItems:'center',justifyContent:'center'},
  check:{position:'absolute',top:8,right:8,width:30,height:30,borderRadius:15,backgroundColor:'rgba(255,255,255,0.95)',alignItems:'center',justifyContent:'center',...shadow.sm},
  checkOn:{backgroundColor:colors.accent},
  body:{padding:spacing.sm,gap:3},
  name:{...typography.smallBold,color:colors.ink,fontSize:13},
  meta:{flexDirection:'row',alignItems:'center',gap:4},
  rating:{fontSize:11,fontWeight:'700',color:'#92400e',marginRight:4},
  cost:{fontSize:11,fontWeight:'700',color:colors.green},
  free:{fontSize:11,fontWeight:'700',color:colors.green},
});
