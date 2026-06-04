/**
 * DiscoverModal.js
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, FlatList, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Linking, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GOOGLE_PLACES_API_KEY } from '../config';
import useStore from '../store';
import { uid, getAllMembers, defaultNightsFor } from '../utils/helpers';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { SLOTS, getSlotKey, getSuggestedTime, getSlotCount } from '../utils/slots';
import { weekdayOf, hoursLabel } from '../utils/hours';
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
const FIELD_MASK = ['nextPageToken','places.displayName','places.formattedAddress','places.rating','places.userRatingCount','places.priceLevel','places.types','places.accessibilityOptions','places.websiteUri','places.location','places.photos','places.regularOpeningHours','places.businessStatus'].join(',');

// Google Place Photos: a photo resource name → image URL (billed per fetch).
const photoUrl = name => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&maxHeightPx=420&key=${GOOGLE_PLACES_API_KEY}`;

// Compact Google regularOpeningHours.periods → [{ d, o, c }] where d = weekday
// (0=Sun), o/c = open/close minutes-of-day. Lets scheduleDay pick which meal a
// restaurant fits. Open-ended (24h) or past-midnight closes are capped at day end.
function compactHours(oh) {
  const periods = oh?.periods;
  if (!Array.isArray(periods)) return null;
  const out = [];
  for (const p of periods) {
    if (!p.open) continue;
    const d = p.open.day ?? 0;
    const o = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    let c = p.close ? (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0) : 1440;
    if (!p.close || p.close.day !== d || c <= o) c = 1440;   // 24h / crosses midnight → cap to 24:00
    out.push({ d, o, c });
  }
  return out.length ? out : null;
}

// Deterministic relevance score for ranking Discover results: quality (rating,
// 0–5) + popularity (log of review count, damped so a 50k-review landmark doesn't
// bury a great 4.9, but a 5.0 with 3 reviews can't outrank a proven 4.7 with
// thousands). Higher = better. Distance is handled separately by the map. Pure.
function placeScore(p) {
  const rating  = p?.rating || 0;
  const reviews = p?.ratingCount || 0;
  return rating + Math.log10(1 + reviews) * 0.5;
}

function mapPlace(p) {
  const place = {
    name:p.displayName?.text??'Place', address:p.formattedAddress??'',
    rating:p.rating??null, ratingCount:p.userRatingCount??0,
    costPerPerson:PRICE_TO_COST[p.priceLevel]??0, priceLevel:p.priceLevel??null, types:p.types??[],
    activityType:inferActivityType(p.types??[]),
    wheelchairOk:p.accessibilityOptions?.wheelchairAccessibleEntrance??null,
    url:p.websiteUri??'', lat:p.location?.latitude??null, lng:p.location?.longitude??null,
    photo:p.photos?.[0]?.name ? photoUrl(p.photos[0].name) : null,
    openHours:compactHours(p.regularOpeningHours),
    businessStatus:p.businessStatus??null,   // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  };
  place.vegFriendly = isVegFriendly(place);
  return place;
}

// Text Search (New) returns max 20 per page; follow `nextPageToken` for up to
// `pages` pages (≤60 places). Surfaces MORE top attractions — the See layer was
// silently capped at 20. Stops early when a page is empty or has no token.
async function fetchPlaces(textQuery, bias = null, pages = 1) {
  if (!GOOGLE_PLACES_API_KEY) return [];
  const out = [];
  let pageToken = null;
  for (let i = 0; i < Math.max(1, pages); i++) {
    try {
      const res = await fetch(PLACES_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':FIELD_MASK},
        body:JSON.stringify({
          textQuery, pageSize:20,
          ...(bias ? { locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radius || 15000 } } } : {}),
          ...(pageToken ? { pageToken } : {}),
        }),
      });
      if (!res.ok) break;
      const data = await res.json();
      out.push(...(data.places ?? []).map(mapPlace));
      pageToken = data.nextPageToken || null;
      if (!pageToken) break;
    } catch(e) { console.warn('[DiscoverModal]', e.message); break; }
  }
  return out;
}

// Session-wide Places cache (module scope = survives Discover re-opens). Planning
// day-by-day in the same city no longer re-bills the same search; calls scale
// with distinct (query × area), not with how many times Discover is opened.
// A 30-min TTL keeps results fresh-ish; in-flight dedupe collapses concurrent
// identical requests (e.g. rapid layer toggles) into one network call.
const PLACES_TTL_MS = 30 * 60 * 1000;
const placesCache    = new Map();   // key -> { ts, places }
const placesInflight = new Map();   // key -> Promise<places>

function placesKey(q, bias, pages) {
  return `${pages || 1}|` + q + (bias ? `@${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : '');
}
async function cachedPlaces(q, bias, pages = 1) {
  const key = placesKey(q, bias, pages);
  const hit = placesCache.get(key);
  if (hit && Date.now() - hit.ts < PLACES_TTL_MS) return hit.places;
  if (placesInflight.has(key)) return placesInflight.get(key);
  const p = fetchPlaces(q, bias, pages)
    .then(places => { placesCache.set(key, { ts: Date.now(), places }); placesInflight.delete(key); return places; })
    .catch(e => { placesInflight.delete(key); throw e; });
  placesInflight.set(key, p);
  return p;
}

function PlaceCard({ place, onToggle, added, wd, seen, onOpenWeb }) {
  const hrs = hoursLabel(place.openHours, wd);
  const closed = hrs === 'Closed';
  const dim = seen && !added;   // looked at on the web → fade so it's easy to skip
  return (
    <View style={card.wrap}>
      {place.photo
        ? <Image source={{uri:place.photo}} style={[card.thumb, dim && card.seenDim]} />
        : <View style={[card.thumb, card.thumbPh, dim && card.seenDim]}><Icon name={TYPE_ICON[place.activityType]||'activity'} size={20} color={TYPE_TINT[place.activityType]||colors.subtle} /></View>}
      <View style={[card.body, dim && card.seenDim]}>
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
          {!!hrs && <Text style={[card.hours, closed && card.hoursClosed]} numberOfLines={1}>{'\u{1F552}'} {hrs}</Text>}
          {place.wheelchairOk && <Text style={card.badge}>{'♿'}</Text>}
        </View>
        {!!place.address && <Text style={card.address} numberOfLines={1}>{'\u{1F4CD}'} {place.address}</Text>}
        {!!place.url && (
          <TouchableOpacity style={card.linkRow} onPress={() => (onOpenWeb ? onOpenWeb(place) : Linking.openURL(place.url))} hitSlop={{top:6,bottom:6,left:6,right:6}}>
            <Icon name={seen ? 'checkmark-circle' : 'open-outline'} size={12} color={seen ? colors.subtle : colors.accent} />
            <Text style={[card.linkText, seen && {color:colors.subtle}]}>{place.activityType==='stay' ? (seen?'Rooms seen ↗':'Book rooms ↗') : (seen?'Seen ↗':'Visit website ↗')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[card.addBtn, added&&card.addBtnDone]}
        onPress={() => onToggle(place)} activeOpacity={0.7}
      >
        <Icon name={added?'check':'add'} size={20} color={added?colors.success:'#fff'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Photo card for the map carousel (mindtrip-style) ────────────────
// Tapping the card focuses the map on the place; the check circle toggles the
// basket (separate touch targets so they don't fight).
function PlaceMapCard({ place, checked, selected, onToggle, onFocus, onOpenWeb, seen, wd }) {
  const hrs = hoursLabel(place.openHours, wd);
  const closed = hrs === 'Closed';
  const dim = seen && !checked;
  return (
    <TouchableOpacity style={[mc.card, selected && mc.cardSel]} activeOpacity={0.9} onPress={() => onFocus && onFocus(place)}>
      <View>
        {place.photo
          ? <Image source={{ uri: place.photo }} style={[mc.photo, dim && mc.seenDim]} />
          : <View style={[mc.photo, mc.photoPh, dim && mc.seenDim]}><Icon name={TYPE_ICON[place.activityType]||'activity'} size={26} color={TYPE_TINT[place.activityType]||colors.subtle} /></View>}
        {/* Open the place's site (hotel rooms, menus, tickets) — marks it "seen" */}
        {!!place.url && (
          <TouchableOpacity style={mc.web} onPress={() => onOpenWeb && onOpenWeb(place)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
            <Icon name={place.activityType === 'stay' ? 'hotel' : 'open-outline'} size={14} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[mc.check, checked && mc.checkOn]} onPress={() => onToggle(place)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
          <Icon name={checked ? 'check' : 'add'} size={16} color={checked ? '#fff' : colors.accent} />
        </TouchableOpacity>
      </View>
      <View style={[mc.body, dim && mc.seenDim]}>
        <Text style={mc.name} numberOfLines={1}>{place.name}</Text>
        <View style={mc.meta}>
          {place.rating != null && <><Icon name="star" size={11} color="#e0a93c" /><Text style={mc.rating}>{place.rating.toFixed(1)}</Text></>}
          {place.costPerPerson > 0
            ? <Text style={mc.cost}>~${place.costPerPerson}/p</Text>
            : place.priceLevel === 'PRICE_LEVEL_FREE' ? <Text style={mc.free}>Free</Text> : null}
          {seen && <Text style={mc.seenTag}>{'✓'} seen</Text>}
        </View>
        {!!hrs && <Text style={[mc.hours, closed && mc.hoursClosed]} numberOfLines={1}>{'\u{1F552}'} {hrs}</Text>}
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
// (contextmenu) → drops a draggable pin + "droppin"; dragging it re-posts "droppin".
function buildMapHTML() {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;background:#eee}
.pin{display:flex;align-items:center;justify-content:center;min-width:30px;height:24px;padding:0 7px;border-radius:13px;color:#fff;font:700 12px -apple-system,system-ui,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.35);border:2px solid #fff;white-space:nowrap}
.pin.sel{transform:scale(1.3);z-index:1000!important}
.droppin{position:relative;width:22px;height:22px;background:#e23b35;border:2.5px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 2px 7px rgba(0,0,0,.5);transform:rotate(-45deg)}
.droppin::after{content:'';position:absolute;top:6px;left:6px;width:8px;height:8px;background:#fff;border-radius:50%}</style></head><body><div id="map"></div>
<script>
var TINT=${JSON.stringify(MAP_TINT)};
var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([20,0],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var ms=[],programmatic=true;  // ignore the load-time setView/fitBounds moves
function clearMarkers(){ms.forEach(function(m){map.removeLayer(m)});ms=[];}
// Metres from centre to a map corner = the radius the user is currently viewing.
function viewRadius(){var c=map.getCenter();return Math.round(c.distanceTo(map.getBounds().getNorthEast()));}
// Fit to the HEAT, not the outliers. A few far-flung results would zoom the whole
// map out and pile the real cluster into a single dot. So: centre on the MEDIAN
// point (robust to outliers), then fit only the nearest ~75% of points — the
// dense core — while never showing more than a ~15-mile radius. A tight cluster
// still gets a sensible max zoom so pins stay readable.
var FIT_R=24140; // 15 miles in metres — hard cap on how far the fit can reach
function fitDense(pts){
  if(!pts.length)return;
  if(pts.length===1){map.setView(pts[0],14);return;}
  var la=pts.map(function(p){return p[0]}).sort(function(a,b){return a-b});
  var ln=pts.map(function(p){return p[1]}).sort(function(a,b){return a-b});
  var ctr=L.latLng(la[la.length>>1],ln[ln.length>>1]);
  var byDist=pts.map(function(p){return [p,ctr.distanceTo(L.latLng(p[0],p[1]))];})
                .sort(function(a,b){return a[1]-b[1];});
  var keep=Math.max(2,Math.ceil(byDist.length*0.75));         // the densest 75%
  var core=byDist.slice(0,keep).filter(function(x){return x[1]<=FIT_R;}).map(function(x){return x[0];});
  if(core.length<2){map.setView(ctr,14);return;}
  map.fitBounds(core,{padding:[40,40],maxZoom:16});
}
window.setData=function(data,fit){
  if(fit)programmatic=true;  // our own fit shouldn't trigger a "Search this area"
  clearMarkers();var pts2=[];
  (data||[]).forEach(function(d){
    // Three states, rating ALWAYS shown: available = colour + rating; seen on web
    // = grey + rating; added to plan = grey + rating + ✓. Greying what's seen/added
    // lets a busy map fade to just the options still worth a look.
    var dim=d.a||d.s;
    var c=dim?'#9aa7b0':(TINT[d.t]||'#e86c3a');
    var lbl=(d.r?d.r.toFixed(1):'•')+(d.a?' ✓':'');
    var extra=dim?';opacity:.72':'';
    var ic=L.divIcon({className:'',html:'<div class="pin'+(dim?' dim':'')+'" style="background:'+c+extra+'">'+lbl+'</div>',iconSize:[44,24],iconAnchor:[22,12]});
    var m=L.marker([d.lat,d.lng],{icon:ic}).addTo(map);
    (function(idx,mk){mk.on('click',function(){
      ms.forEach(function(x){if(x._icon)x._icon.firstChild.classList.remove('sel')});
      if(mk._icon)mk._icon.firstChild.classList.add('sel');
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'select',index:idx}));
    });})(d.i,m);
    ms.push(m);pts2.push([d.lat,d.lng]);
  });
  // Re-fit only when asked (city/area/text change). Area searches DON'T fit —
  // they keep the user's current zoom (else searching a landmark zooms out).
  if(fit&&pts2.length){fitDense(pts2);}
  setTimeout(function(){programmatic=false;},500);
};
// Centre + zoom in on a place (tapping its carousel card), and highlight its
// pin. setView is a programmatic move so it must NOT trigger "Search this area".
window.focusPin=function(lat,lng){
  programmatic=true;
  var best=null,bd=1e9;
  ms.forEach(function(m){var ll=m.getLatLng();var d=Math.abs(ll.lat-lat)+Math.abs(ll.lng-lng);if(d<bd){bd=d;best=m;}});
  var z=Math.max(map.getZoom(),15);  // zoom IN to street level, never out
  map.setView(best?best.getLatLng():[lat,lng],z,{animate:true});
  setTimeout(function(){
    ms.forEach(function(x){if(x._icon)x._icon.firstChild.classList.remove('sel')});
    if(best&&best._icon)best._icon.firstChild.classList.add('sel');
    programmatic=false;
  },350);
};
// "Explore nearby" → centre+zoom the map on the chosen place (no synthetic marker;
// the place shows as its REAL pin and its carousel card gets selected by RN).
window.centerOn=function(lat,lng,z){
  programmatic=true;
  map.setView([lat,lng],z||14,{animate:false});
  setTimeout(function(){programmatic=false;},450);
};
// A draggable "drop pin" for a stop that isn't on the map (Airbnb, a rental).
// Long-press places it; the user can drag to fine-tune. Each placement/drag posts
// the coords back so RN can mirror them + reverse-geocode an address to confirm.
var dropM=null;
var DROP_ICON=L.divIcon({className:'',html:'<div class="droppin"></div>',iconSize:[24,24],iconAnchor:[12,24]});
function placeDrop(lat,lng){
  if(dropM){dropM.setLatLng([lat,lng]);}
  else{
    dropM=L.marker([lat,lng],{icon:DROP_ICON,draggable:true,zIndexOffset:3000,autoPan:true}).addTo(map);
    dropM.on('dragend',function(){var ll=dropM.getLatLng();window.ReactNativeWebView.postMessage(JSON.stringify({type:'droppin',lat:ll.lat,lng:ll.lng}));});
  }
}
window.clearDropPin=function(){if(dropM){map.removeLayer(dropM);dropM=null;}};
// Report user pan/zoom (with the viewed radius) so RN can offer "Search this
// area" scoped to what's actually on screen. Skip our own programmatic moves.
function reportMove(){if(programmatic)return;var c=map.getCenter();window.ReactNativeWebView.postMessage(JSON.stringify({type:'moved',lat:c.lat,lng:c.lng,radius:viewRadius()}));}
map.on('dragend',reportMove);
map.on('zoomend',reportMove);
map.on('dblclick',function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'searchhere',lat:e.latlng.lat,lng:e.latlng.lng,radius:viewRadius()}));});
map.on('contextmenu',function(e){placeDrop(e.latlng.lat,e.latlng.lng);window.ReactNativeWebView.postMessage(JSON.stringify({type:'droppin',lat:e.latlng.lat,lng:e.latlng.lng}));});
window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
</script></body></html>`;
}

// Geographic context pane — merged, layer-coloured pins. The map persists; only
// markers update (via injectJavaScript → window.setData). Adding still happens
// in the carousel/list beneath, so the map itself is browse + anchor-search.
function DiscoverMap({ places, addedNames, seenNames, onMoved, onSelect, onSearchHere, onDropPin, clearPinToken, showSearchArea, onSearchArea, fitToken, focusTarget, centerOn }) {
  const ref = useRef(null);
  const lastFit = useRef(-1);
  const readyRef = useRef(false);   // don't push (or consume fitToken) until the map has loaded
  const withCoords = places.filter(p => p.lat != null && p.lng != null);
  // `a` = added to the trip (grey + ✓), `s` = seen on the web (grey) → fade what's
  // handled so the bright pins are the options still worth a look.
  const pts = withCoords.map((p, i) => ({ i, lat: p.lat, lng: p.lng, t: p.activityType, r: p.rating, a: addedNames?.has(p.name) ? 1 : 0, s: seenNames?.has(p.name) ? 1 : 0 }));
  const ptsJSON = JSON.stringify(pts);
  const html = React.useMemo(() => buildMapHTML(), []);
  // Re-fit the view only when fitToken advanced (city/area/text change); a layer
  // toggle changes the pins but not the token, so the map holds its position.
  const push = () => {
    if (!readyRef.current) return;
    // Consume the fit token once we can act — points to fit, OR an explicit
    // centre (explore-nearby) which doesn't need points. An early empty push
    // (opening straight into the map before results load) otherwise burns the
    // token and the results arrive with no re-fit.
    const hasCenter = !!centerOn && centerOn.lat != null;
    const wantFit = fitToken !== lastFit.current && (pts.length > 0 || hasCenter);
    if (wantFit) lastFit.current = fitToken;
    const doCenter = wantFit && hasCenter;                 // centre on the place, don't fit to the cluster
    const centerJS = doCenter ? `window.centerOn&&window.centerOn(${centerOn.lat},${centerOn.lng},14);` : '';
    ref.current?.injectJavaScript(`window.setData&&window.setData(${ptsJSON},${(wantFit && !doCenter) ? 1 : 0});${centerJS}true;`);
  };
  const onReady = () => { readyRef.current = true; push(); };
  useEffect(() => { push(); }, [ptsJSON, fitToken]);
  // Tapping a carousel card → centre + zoom the map on that place. `n` is a
  // nonce so re-tapping the SAME card re-centres.
  useEffect(() => {
    if (!readyRef.current || !focusTarget || focusTarget.lat == null) return;
    ref.current?.injectJavaScript(`window.focusPin&&window.focusPin(${focusTarget.lat},${focusTarget.lng});true;`);
  }, [focusTarget?.n]);
  // Parent bumps clearPinToken to remove the drop pin (Cancel / after using it).
  useEffect(() => {
    if (!readyRef.current || !clearPinToken) return;
    ref.current?.injectJavaScript(`window.clearDropPin&&window.clearDropPin();true;`);
  }, [clearPinToken]);

  return (
    <View style={s.mapPane}>
      <WebView ref={ref} originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: '#dfe6e9' }}
        onLoadEnd={onReady}
        onMessage={e => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.type === 'moved') onMoved && onMoved({ lat: d.lat, lng: d.lng, radius: d.radius });
            else if (d.type === 'select' && withCoords[d.index]) onSelect && onSelect(withCoords[d.index]);
            else if (d.type === 'searchhere') onSearchHere && onSearchHere({ lat: d.lat, lng: d.lng, radius: d.radius });
            else if (d.type === 'droppin') onDropPin && onDropPin({ lat: d.lat, lng: d.lng });
            else if (d.type === 'ready') onReady();
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

export default function DiscoverModal({ visible, onClose, trip, dayIndex, defaultTime, defaultSlot, nearby, onAddManual }) {
  const insets = useSafeAreaInsets();
  const { addActivity, deleteActivity, markPlaceSeen, clearSeenPlaces } = useStore();
  // Read the LIVE trip from the store so "added" (grey + ✓) and "seen" (grey)
  // always reflect the real plan, reactively — no stale snapshot to wipe on open.
  const liveTrip   = useStore(s => s.trips.find(t => t.id === trip?.id)) || trip;
  const seenNames  = new Set(liveTrip?.seenPlaces || []);
  const addedNames = new Set((liveTrip?.days || []).flatMap(d => (d.activities || []).map(a => a.name)));
  // Weekday of the day we're adding to → show each place's hours for that day.
  const dayWd = weekdayOf(trip?.days?.[dayIndex ?? 0]?.date);

  const [viewMode,   setViewMode]   = useState('list'); // 'list' | 'map'
  const [mapCenter,  setMapCenter]  = useState(null);   // {lat,lng} of the map view
  const [mapMoved,   setMapMoved]   = useState(false);  // user panned → show "Search this area"
  const [areaSearch, setAreaSearch] = useState(null);   // committed map area; sticky scope for searches
  const [fitToken,   setFitToken]   = useState(0);      // bumped only when the map SHOULD re-fit (city/area/text — NOT layer toggles)
  const [selectedName, setSelectedName] = useState(null); // pin-tapped place (highlight + scroll carousel)
  const [focusTarget,  setFocusTarget]  = useState(null); // card-tapped place → centre the map ({lat,lng,n})
  const [pendingPin,   setPendingPin]   = useState(null); // dropped map pin awaiting confirm ({lat,lng,address,geocoding})
  const [clearPinToken,setClearPinToken]= useState(0);    // bumped to tell the map to remove the drop pin
  const carouselRef = useRef(null);
  const focusSeq    = useRef(0);
  const [layers,      setLayers]      = useState({ see: true, eat: true, stay: true }); // multi-select map layers
  const [layerData,   setLayerData]   = useState({ see: [], eat: [], stay: [] });       // per-layer fetched places
  const [textResults, setTextResults] = useState([]);                                   // free-text search results
  const [searchText,  setSearchText]  = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,          setError]          = useState(null);
  const [activeFilters,  setActiveFilters]  = useState([]);
  const [nearLabel,      setNearLabel]      = useState(null);   // "exploring near X" banner
  const [nearbyHydrated, setNearbyHydrated] = useState(null);   // fetched Places card for the explored stop (for its photo)
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

  const destination   = trip?.destination ?? '';
  const families      = trip?.families ?? [];
  const allDietary    = families.flatMap(f => f.dietary || []);  // seeds the dietary filter chips below

  // Merged, layer-filtered results feeding the list, carousel and map. Free-text
  // mode searches across all types then filters by enabled layers; default mode
  // concatenates each enabled layer's results (deduped). Both rank by placeScore —
  // quality + popularity (footfall), so a 5.0 with 3 reviews doesn't outrank a
  // proven 4.7 with thousands.
  const results = React.useMemo(() => {
    const base = searchText.trim()
      ? textResults.filter(p => layers[TYPE_TO_LAYER[p.activityType]] !== false)
      : (() => {
          const seen = new Set();
          return LAYERS.filter(l => layers[l.key])
            .flatMap(l => layerData[l.key] || [])
            .filter(p => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
        })();
    const ranked = base.slice().sort((a, b) => placeScore(b) - placeScore(a));
    // Explore-nearby: the area search usually doesn't return the stop you came
    // from (a niche place). Inject it so IT shows as a real pin + selectable card.
    if (nearLabel && nearby && nearby.lat != null && !ranked.some(p => p.name === nearby.label)) {
      const h = nearbyHydrated;   // fetched Places card (photo/footfall), if available
      ranked.unshift({
        name: nearby.label, lat: nearby.lat, lng: nearby.lng,
        rating: nearby.rating ?? h?.rating ?? null, ratingCount: nearby.ratingCount ?? h?.ratingCount ?? 0,
        address: nearby.address || h?.address || '', url: nearby.url || h?.url || '',
        photo: nearby.photo || h?.photo || null,
        openHours: nearby.openHours ?? h?.openHours ?? null, activityType: nearby.type || 'activity',
        priceLevel: null, costPerPerson: 0,
      });
    }
    return ranked;
  }, [searchText, textResults, layerData, layers, nearLabel, nearby, nearbyHydrated]);

  useEffect(() => {
    if (!visible) return;
    const parsed = parseLocations(destination);
    const start  = parsed[0] || destination;
    setSearchText('');
    setLayers({ see: true, eat: true, stay: true });
    setLayerData({ see: [], eat: [], stay: [] }); setTextResults([]);
    setSelectedName(null); setFocusTarget(null); setMapMoved(false);
    setCities(parsed.length ? parsed : (destination ? [destination] : []));
    setActiveCity(start);
    setCityPickerOpen(false); setNewCity('');
    setActiveFilters(FILTER_OPTS.filter(f => allDietary.includes(f.key)).map(f => f.key));
    if (nearby && nearby.lat != null) {
      // "Explore nearby" from an activity → open straight into the map, biased to
      // that place's spot, so the user sees what's around it.
      setViewMode('map');
      setAreaSearch({ lat: nearby.lat, lng: nearby.lng, radius: 8000 });   // ~5 mi
      setMapCenter({ lat: nearby.lat, lng: nearby.lng });
      setNearLabel(nearby.label || 'this spot');
    } else {
      setViewMode('list');
      setAreaSearch(null); setMapCenter(null); setNearLabel(null);
    }
    setFitToken(t => t + 1);
  }, [visible]);

  // Drop the "near X" scope → search the whole city again.
  const clearNearby = () => { setNearLabel(null); setAreaSearch(null); setMapMoved(false); setFitToken(t => t + 1); };

  // Delegates to the module-level, session-wide cache (survives Discover opens).
  const cachedFetch = (q, bias, pages) => cachedPlaces(q, bias, pages);

  // Load whatever the current scope needs: free-text → one cross-type search;
  // otherwise → each enabled layer's default query (parallel). `area` biases to
  // a point (search-this-area / anchor / double-tap) and drops the city scope.
  const loadScope = async () => {
    const loc  = activeCity || destination;
    const area = areaSearch;
    const text = searchText.trim();
    const diet = [getDietaryBias(families), getFilterBias(activeFilters)].filter(Boolean).join(' ');
    const bias = area ? { lat: area.lat, lng: area.lng, radius: area.radius || 12000 } : null;
    setError(null); setSelectedName(null); setLoading(true);
    try {
      // Keep area searches tight: drop results outside ~1.6× the bias radius so
      // an outlier can't blow out the map's fit-to-bounds.
      const near = ps => area
        ? ps.filter(p => p.lat != null && p.lng != null && metersBetween(area, p) <= (area.radius || 12000) * 1.6)
        : ps;
      if (text) {
        const q = (area ? text : `${text} near ${loc}`) + (diet ? ` ${diet}` : '');
        const places = near(await cachedFetch(q, bias, 2));   // up to 40 for a typed search
        setTextResults(places);
        if (!places.length) setError(`No results for "${text}".`);
      } else {
        const want = LAYERS.filter(l => layers[l.key]);
        const got  = await Promise.all(want.map(async L => {
          const q = (area ? L.query : `${L.query} in ${loc}`) + (L.key === 'eat' && diet ? ` ${diet}` : '');
          // Attractions ("See") are where Google's 20-cap hurt most → fetch up to
          // 60; Eat/Stay rarely need more than the first 20.
          const pages = L.key === 'see' ? 3 : 1;
          const places = near(await cachedFetch(q, bias, pages));
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

  // Explore-nearby: once results arrive, select the explored place itself — its
  // real pin gets highlighted and its card (thumbnail) is selected + scrolled into
  // view, so the user sees exactly which place they're exploring around (no
  // synthetic marker). Runs once per nearby target.
  const nearSelRef = useRef(null);
  useEffect(() => {
    if (!nearLabel || !nearby || nearby.lat == null) { nearSelRef.current = null; return; }
    if (nearSelRef.current === nearby.label) return;
    const idx = results.findIndex(p => p.name === nearby.label);
    if (idx < 0) return;                       // not in results yet (or not returned)
    nearSelRef.current = nearby.label;
    const match = results[idx];
    setSelectedName(match.name);
    setFocusTarget({ lat: match.lat, lng: match.lng, n: ++focusSeq.current });
    setTimeout(() => { try { carouselRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 }); } catch (_) {} }, 350);
  }, [results, nearLabel, nearby]);

  // If the explored stop has no stored photo (added before we kept them), fetch
  // its Places card so the injected carousel card shows a real thumbnail.
  useEffect(() => {
    if (!nearLabel || !nearby || nearby.lat == null || nearby.photo) { setNearbyHydrated(null); return; }
    let cancelled = false;
    cachedFetch(nearby.label, { lat: nearby.lat, lng: nearby.lng, radius: 2000 }, 1)
      .then(list => {
        if (cancelled || !list?.length) return;
        const best = list.find(p => p.lat != null && metersBetween(nearby, p) < 400) || list[0];
        if (best?.photo) setNearbyHydrated(best);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [nearLabel, nearby]);

  // Map panned/zoomed → offer to re-search that area (Redfin "search this area").
  const handleMapMoved = c => { setMapCenter(c); setMapMoved(true); };
  // Clamp the viewport radius to something sane for a Places locationBias circle.
  const clampRadius = r => Math.min(50000, Math.max(800, Math.round(r || 6000)));
  // Area searches re-use the CURRENT view radius and do NOT re-fit — the user
  // already framed the area, so keep their zoom (don't bump fitToken).
  const searchThisArea = () => {
    if (!mapCenter) return;
    setMapMoved(false);
    setAreaSearch({ lat: mapCenter.lat, lng: mapCenter.lng, radius: clampRadius(mapCenter.radius) });
  };
  const searchAround = pt => {
    setMapMoved(false);
    setAreaSearch({ lat: pt.lat, lng: pt.lng, radius: clampRadius(pt.radius) });
  };
  // Long-press the map drops a draggable pin (placed in the WebView). We mirror its
  // coords here + reverse-geocode an address so the user can see/adjust the spot
  // before committing — then "Use this spot" hands it to the Manual editor.
  const handleDropPin = ({ lat, lng }) => {
    if (lat == null || lng == null) return;
    setPendingPin({ lat, lng, address: '', geocoding: true });
    const same = cur => cur && cur.lat === lat && cur.lng === lng;   // ignore a stale geocode after a re-drag
    reverseGeocode(lat, lng)
      .then(a  => setPendingPin(cur => same(cur) ? { ...cur, address: a || '', geocoding: false } : cur))
      .catch(() => setPendingPin(cur => same(cur) ? { ...cur, geocoding: false } : cur));
  };
  const cancelDropPin  = () => { setPendingPin(null); setClearPinToken(t => t + 1); };
  const confirmDropPin = () => {
    const p = pendingPin;
    if (!p || !onAddManual) return;
    setPendingPin(null);
    onAddManual({ lat: p.lat, lng: p.lng, address: p.address || '' });
  };
  // Leaving the map (closing the modal or switching to the list) abandons a pending pin.
  useEffect(() => {
    if (!visible || viewMode !== 'map') { setPendingPin(null); setClearPinToken(t => t + 1); }
  }, [visible, viewMode]);
  // Pin tapped → scroll carousel to it and highlight its card.
  const handleMapSelect = place => {
    const idx = results.findIndex(p => p.name === place.name);
    if (idx >= 0) {
      setSelectedName(place.name);
      try { carouselRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 }); } catch (_) {}
    }
  };
  // Carousel card tapped → highlight it and centre/zoom the map on that place.
  const handleCarouselFocus = place => {
    if (place.lat == null || place.lng == null) return;
    setSelectedName(place.name);
    setFocusTarget({ lat: place.lat, lng: place.lng, n: ++focusSeq.current });
  };

  const handleSearchChange = text => { setSearchText(text); setFitToken(t => t + 1); };   // debounced by the load effect

  // Layers are independent on/off — but at least one must stay on.
  const toggleLayer = key => setLayers(prev => {
    const next = { ...prev, [key]: !prev[key] };
    return (!next.see && !next.eat && !next.stay) ? prev : next;
  });

  const toggleFilter = key =>
    setActiveFilters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // Selecting a city re-runs the search via the activeCity effect (resets area scope).
  const chooseCity = c => { setCityPickerOpen(false); setAreaSearch(null); setMapMoved(false); setNearLabel(null); setFitToken(t => t + 1); setActiveCity(c); };

  // Commit a freely-typed city (need not be in the trip's destination).
  const commitNewCity = () => {
    const c = newCity.trim();
    setNewCity('');
    if (!c) { setCityPickerOpen(false); return; }
    setCities(prev => prev.some(x => cityLabel(x) === cityLabel(c)) ? prev : [...prev, c]);
    setCityPickerOpen(false);
    setAreaSearch(null); setMapMoved(false); setNearLabel(null); setFitToken(t => t + 1);
    setActiveCity(c);
  };

  const handleAdd = place => {
    setPickerDay(dayIndex ?? 0);
    setPickerSlot(getSlotKey(defaultTime || '09:00'));
    // Default nights to cover the rest of the trip (not 1) so a single hotel anchors
    // every night/day; the user can still adjust. The old '1' default was the cause
    // of "Night 1 of 1" on a multi-night trip.
    setHotelRate(''); setHotelNights(String(defaultNightsFor(trip, dayIndex ?? 0)));
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
    // Persist nights as a NUMBER on the check-in so lodgingForNight() can derive
    // which days this booking covers. The booking cost stays on this one record.
    const nights = isStay ? Math.max(1, parseInt(hotelNights, 10) || 1) : undefined;
    const rate = parseFloat(hotelRate);
    if (isStay && rate > 0) {
      const total   = rate * nights;
      const members = Math.max(1, getAllMembers(trip).length);
      cost   = { costPerPerson: parseFloat((total / members).toFixed(2)), costMode: 'total', costAmount: total };
      detail = `${nights} night${nights !== 1 ? 's' : ''} · $${rate}/night`;
    }

    addActivity(trip.id, pickerDay, {
      id:uid(), type:pendingPlace.activityType, time:smartTime,
      name:pendingPlace.name, detail,
      ...cost,
      ...(isStay ? { nights } : {}),
      address:pendingPlace.address, url:pendingPlace.url,
      rating:pendingPlace.rating, lat:pendingPlace.lat, lng:pendingPlace.lng,
      openHours:pendingPlace.openHours ?? null,   // hours of operation → smart meal slotting on Arrange
      businessStatus:pendingPlace.businessStatus ?? null,   // permanent/temporary-closed flag for Trip Check
      photo:pendingPlace.photo ?? null,           // thumbnail (for explore-nearby + future card art)
      city:cityLabel(activeCity),   // tag the source city → Trip Check flags multi-city days
      note:null, status:null,
    });
    setPendingPlace(null);
  };

  // Open the place's website (hotel rooms, menus, tickets) and mark it "seen" so
  // its pin/card greys out — a lightweight way to track what you've looked at.
  const openWeb = place => {
    if (!place?.url) return;
    Linking.openURL(place.url).catch(() => {});
    markPlaceSeen(trip.id, place.name);   // persisted per trip
  };

  // Un-grey everything you've looked at — start the browse fresh.
  const resetSeen = () => {
    const n = seenNames.size;
    if (!n) return;
    Alert.alert('Reset seen', `Un-grey the ${n} place${n !== 1 ? 's' : ''} you've looked at?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => clearSeenPlaces(trip.id) },
    ]);
  };

  // One-tap add to the CURRENT day at a smart time (non-stays). Stays open the
  // sheet to capture the nightly rate + nights. Auto-arrange (on the day view)
  // tidies the times later — here we just drop it on the least-full slot.
  const quickAdd = place => {
    if (place.activityType === 'stay') { handleAdd(place); return; }
    const day  = dayIndex ?? 0;
    // Opened from a per-slot "+ Add" → drop it in THAT slot; otherwise the least-full one.
    const slot = defaultSlot || [...SLOTS].sort((a, b) => getSlotCount(trip, day, a.key) - getSlotCount(trip, day, b.key))[0]?.key || 'morning';
    addActivity(trip.id, day, {
      id: uid(), type: place.activityType, time: getSuggestedTime(trip, day, slot),
      name: place.name, detail: '',
      costPerPerson: place.costPerPerson || 0, costMode: 'per_person', costAmount: place.costPerPerson || 0,
      address: place.address || '', url: place.url || '',
      rating: place.rating ?? null, lat: place.lat ?? null, lng: place.lng ?? null,
      openHours: place.openHours ?? null,   // hours of operation → smart meal slotting on Arrange
      businessStatus: place.businessStatus ?? null,   // permanent/temporary-closed flag for Trip Check
      photo: place.photo ?? null,           // thumbnail (for explore-nearby + future card art)
      city: cityLabel(activeCity), note: null, status: null,
    });
  };

  // The check button toggles a place in/out of the plan. Un-checking removes
  // every matching activity (and its linked expense, handled by the store).
  const toggleAdd = place => {
    if (!addedNames.has(place.name)) { quickAdd(place); return; }
    (liveTrip?.days || []).forEach(d => (d.activities || []).forEach(a => {
      if (a.name === place.name) deleteActivity(trip.id, a.id);
    }));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={[s.container,{paddingTop:insets.top+8}]}>

          <View style={s.header}>
            <View style={{flex:1}}>
              <Text style={s.title}>Add to {trip.days?.[dayIndex ?? 0]?.label || 'your trip'}</Text>
              {!!trip.days?.[dayIndex ?? 0]?.date && (
                <Text style={s.subtitle} numberOfLines={1}>{'\u{1F4C5}'} {trip.days[dayIndex ?? 0].date} · tap + to add here</Text>
              )}
            </View>
            <View style={s.headerActions}>
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

          {/* "Explore nearby" scope — shown when opened from an activity */}
          {!!nearLabel && (
            <View style={s.nearBar}>
              <Icon name="map" size={14} color={colors.accent} />
              <Text style={s.nearBarText} numberOfLines={1}>Near {nearLabel}</Text>
              <TouchableOpacity onPress={clearNearby} hitSlop={{top:8,bottom:8,left:8,right:8}} activeOpacity={0.7}>
                <Text style={s.nearBarClear}>Show all ✕</Text>
              </TouchableOpacity>
            </View>
          )}

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
              <View style={s.resultLeft}>
                <Text style={s.resultCount}>{results.length} place{results.length !== 1 ? 's' : ''}{loading ? ' · searching…' : ''}</Text>
                {seenNames.size > 0 && (
                  <TouchableOpacity onPress={resetSeen} hitSlop={{top:8,bottom:8,left:6,right:6}} activeOpacity={0.7}>
                    <Text style={s.resetSeen}>{'↺'} reset {seenNames.size} seen</Text>
                  </TouchableOpacity>
                )}
              </View>
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
            // Map stays mounted across searches (markers update live). Double-tap
            // or long-press a spot to search that area; tap a pin to highlight it.
            <View style={{ flex: 1 }}>
              <DiscoverMap places={results} addedNames={addedNames} seenNames={seenNames} onMoved={handleMapMoved} onSelect={handleMapSelect}
                onSearchHere={pt => searchAround(pt)} onDropPin={handleDropPin} clearPinToken={clearPinToken}
                fitToken={fitToken} focusTarget={focusTarget}
                centerOn={nearLabel && nearby && nearby.lat != null ? { lat: nearby.lat, lng: nearby.lng } : null}
                showSearchArea={mapMoved && !pendingPin} onSearchArea={searchThisArea} />
              {loading && (
                <View style={s.mapLoadPill} pointerEvents="none">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.mapLoadText}>Searching…</Text>
                </View>
              )}
              {/* Discoverability: how to add an off-map stop (hidden once a pin is down). */}
              {!pendingPin && !loading && !mapMoved && !!onAddManual && (
                <View style={mp.dropHint} pointerEvents="none">
                  <Text style={mp.dropHintText}>📍 Long-press the map to drop a pin for an Airbnb / off-map stop</Text>
                </View>
              )}
              {pendingPin ? (
                // Google-Maps-style: the dropped pin's address + drag hint, with Use / Cancel.
                <View style={mp.pinBar}>
                  <View style={{ flex: 1 }}>
                    <Text style={mp.pinBarTitle}>Drop a stop here</Text>
                    <Text style={mp.pinBarSub} numberOfLines={1}>
                      {pendingPin.address || `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`}
                    </Text>
                    <Text style={mp.pinBarHint}>
                      {pendingPin.geocoding ? 'Locating address… · drag the pin to fine-tune' : 'Drag the pin to fine-tune'}
                    </Text>
                  </View>
                  <TouchableOpacity style={mp.pinCancel} onPress={cancelDropPin} activeOpacity={0.85}>
                    <Text style={mp.pinCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={mp.pinUse} onPress={confirmDropPin} activeOpacity={0.85}>
                    <Text style={mp.pinUseText}>Use this spot</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList ref={carouselRef} data={results} keyExtractor={(item,i)=>`${item.name}-${i}`}
                  horizontal showsHorizontalScrollIndicator={false}
                  style={s.carousel} contentContainerStyle={s.carouselContent}
                  getItemLayout={(_,i)=>({length:198,offset:198*i+spacing.md,index:i})}
                  onScrollToIndexFailed={()=>{}}
                  renderItem={({item}) => (
                    <PlaceMapCard place={item} checked={addedNames.has(item.name)} seen={seenNames.has(item.name)} selected={selectedName===item.name} onToggle={toggleAdd} onFocus={handleCarouselFocus} onOpenWeb={openWeb} wd={dayWd}/>
                  )}
                />
              )}
            </View>
          ) : loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary}/><Text style={s.loadingText}>Searching {cityLabel(activeCity) || destination}…</Text></View>
          ) : error ? (
            <View style={s.center}>
              <Icon name="search" size={34} color={colors.subtle} />
              <Text style={s.errorText}>{error}</Text>
              {/* Bridge: not in Google Places? enter it by hand (drive/flight/custom) */}
              {!!onAddManual && (
                <TouchableOpacity style={s.manualBridge} onPress={() => onAddManual(searchText.trim())} activeOpacity={0.85}>
                  <Icon name="create-outline" size={15} color={colors.accent} />
                  <Text style={s.manualBridgeText}>{searchText.trim() ? `Add "${searchText.trim()}" manually` : 'Add it manually'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList data={results} keyExtractor={(item,i)=>`${item.name}-${i}`}
              contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
              renderItem={({item}) => (
                <PlaceCard place={item} onToggle={toggleAdd} added={addedNames.has(item.name)} seen={seenNames.has(item.name)} onOpenWeb={openWeb} wd={dayWd}/>
              )}
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
  nearBar:{flexDirection:'row',alignItems:'center',gap:spacing.sm,marginHorizontal:spacing.xxl,marginBottom:spacing.sm,marginTop:-spacing.xs,paddingHorizontal:spacing.md,paddingVertical:6,backgroundColor:colors.surface2,borderRadius:radius.md},
  nearBarText:{flex:1,fontSize:12,fontWeight:'700',color:colors.ink},
  nearBarClear:{fontSize:11,fontWeight:'800',color:colors.accent},
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
  resultLeft:{flexDirection:'row',alignItems:'center',gap:spacing.md,flexShrink:1},
  resultCount:{...typography.caption,color:colors.muted},
  resetSeen:{...typography.caption,color:colors.accent,fontWeight:'700'},
  viewToggle:{flexDirection:'row',backgroundColor:colors.surface2,borderRadius:radius.full,padding:3,gap:2},
  viewToggleBtn:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:spacing.md,paddingVertical:5,borderRadius:radius.full},
  viewToggleBtnOn:{backgroundColor:colors.accent},
  viewToggleText:{fontSize:12,fontWeight:'800',color:colors.subtle},
  center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xxxl},
  loadingText:{...typography.body,color:colors.muted,marginTop:spacing.lg},
  manualBridge:{flexDirection:'row',alignItems:'center',gap:6,marginTop:spacing.xl,backgroundColor:colors.accentSoft,borderWidth:1,borderColor:'#f0c9b5',borderRadius:radius.lg,paddingHorizontal:spacing.lg,paddingVertical:spacing.md},
  manualBridgeText:{fontSize:13,fontWeight:'800',color:colors.accent},
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
  hours:{fontSize:11,color:'#516072',fontWeight:'600'},
  hoursClosed:{color:'#dc2626',fontWeight:'700'},
  seenDim:{opacity:0.5},
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
  // "Long-press to drop a pin" coach hint
  dropHint:{position:'absolute',top:10,left:spacing.md,right:spacing.md,alignItems:'center'},
  dropHintText:{backgroundColor:'rgba(15,23,30,0.82)',color:'#fff',fontSize:11.5,fontWeight:'700',textAlign:'center',borderRadius:radius.full,paddingHorizontal:14,paddingVertical:7,overflow:'hidden'},
  // Dropped-pin confirm bar (Google-Maps-style)
  pinBar:{position:'absolute',left:spacing.md,right:spacing.md,bottom:spacing.md,flexDirection:'row',alignItems:'center',gap:spacing.sm,backgroundColor:'#fff',borderRadius:radius.lg,paddingHorizontal:spacing.md,paddingVertical:spacing.md,borderWidth:1,borderColor:colors.hairline,...shadow.lg},
  pinBarTitle:{fontSize:14,fontWeight:'800',color:colors.text},
  pinBarSub:{fontSize:12.5,fontWeight:'600',color:colors.body,marginTop:1},
  pinBarHint:{fontSize:11,fontWeight:'600',color:colors.subtle,marginTop:2},
  pinCancel:{paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderRadius:radius.md},
  pinCancelText:{fontSize:13,fontWeight:'700',color:colors.subtle},
  pinUse:{paddingHorizontal:spacing.lg,paddingVertical:spacing.sm+1,borderRadius:radius.md,backgroundColor:colors.accent},
  pinUseText:{fontSize:13,fontWeight:'800',color:'#fff'},
});

// Map photo carousel card
const mc = StyleSheet.create({
  card:{width:190,backgroundColor:'#fff',borderRadius:radius.lg,marginRight:spacing.sm,overflow:'hidden',borderWidth:1,borderColor:colors.hairline,...shadow.lg},
  // Bright blue ring — deliberately NOT a layer colour (See green / Eat orange /
  // Stay purple) so "selected" never reads as a place type.
  cardSel:{borderColor:'#2563eb',borderWidth:3},
  photo:{width:'100%',height:104,backgroundColor:colors.surface2},
  photoPh:{alignItems:'center',justifyContent:'center'},
  check:{position:'absolute',top:8,right:8,width:30,height:30,borderRadius:15,backgroundColor:'rgba(255,255,255,0.95)',alignItems:'center',justifyContent:'center',...shadow.sm},
  checkOn:{backgroundColor:colors.accent},
  web:{position:'absolute',top:8,left:8,width:30,height:30,borderRadius:15,backgroundColor:'rgba(0,0,0,0.55)',alignItems:'center',justifyContent:'center'},
  body:{padding:spacing.sm,gap:3},
  name:{...typography.smallBold,color:colors.ink,fontSize:13},
  meta:{flexDirection:'row',alignItems:'center',gap:4},
  rating:{fontSize:11,fontWeight:'700',color:'#92400e',marginRight:4},
  cost:{fontSize:11,fontWeight:'700',color:colors.green},
  free:{fontSize:11,fontWeight:'700',color:colors.green},
  seenTag:{fontSize:10,fontWeight:'700',color:colors.subtle,marginLeft:'auto'},
  seenDim:{opacity:0.45},
  hours:{fontSize:10,color:'#516072',fontWeight:'600',marginTop:1},
  hoursClosed:{color:'#dc2626',fontWeight:'700'},
});
