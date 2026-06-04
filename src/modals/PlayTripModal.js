/**
 * PlayTripModal.js — "Play My Trip" SPIKE.
 *
 * A cinematic, auto-generated montage of a trip built from the place photos the app
 * already caches (Google Places). PURPOSE OF THE SPIKE: prove the craft bar — does a
 * directed slideshow clear "cheesy"? Per the design panel, the magic is curation +
 * restraint, NOT effects:
 *   - slow, single-vector, EASED Ken Burns (~6% drift, never linear)
 *   - cross-fade as the only transition (prev layer under, current fades in)
 *   - one unifying warm grade + bottom scrim so mismatched stock photos feel like one film
 *   - letterbox bars (cinema framing, hides aspect mismatches)
 *   - typeset day title cards; an opening "N families · N days" card (the moat, on screen)
 *   - ruthless cap (≤ 12 photos, ~15–25s)
 *
 * SCOPE: in-app playback only. No music (expo-av not installed), no export, no Google
 * Places imagery ever leaves the app — per the legal panel's hard line.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Image, Animated, Easing, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');
const BAR = Math.round(H * 0.055);     // letterbox bar height
const PHOTO_HOLD = 3400;               // ms a photo holds
const TITLE_HOLD = 2500;               // ms a title card holds
const FADE = 750;                      // cross-fade duration
const MAX_PHOTOS = 12;

// Trip → an ordered "film" of slides. Curated: only activities that actually have a
// photo, ≤ 3 per day, capped overall. Opening card leads with the multi-family stat line.
function buildTripFilm(trip) {
  if (!trip) return [];
  const slides = [];
  const famN = (trip.families || []).length;
  const dayN = (trip.days || []).length;
  const stat = [
    famN ? `${famN} ${famN === 1 ? 'family' : 'families'}` : null,
    dayN ? `${dayN} ${dayN === 1 ? 'day' : 'days'}` : null,
    trip.destination || null,
  ].filter(Boolean).join('   ·   ');
  slides.push({ type: 'open', title: trip.name || 'Our Trip', subtitle: stat });

  let count = 0;
  (trip.days || []).forEach((d, i) => {
    if (count >= MAX_PHOTOS) return;
    const photos = (d.activities || []).filter(a => a.photo && a.status !== 'skipped');
    if (!photos.length) return;
    slides.push({ type: 'day', kicker: `Day ${i + 1}`, title: d.label || trip.destination || `Day ${i + 1}` });
    photos.slice(0, 3).forEach(a => {
      if (count < MAX_PHOTOS) { slides.push({ type: 'photo', uri: a.photo, caption: a.name }); count++; }
    });
  });

  slides.push({ type: 'close', title: 'See you there', subtitle: trip.destination || '' });
  return slides;
}

const isPhoto = s => s && s.type === 'photo';

export default function PlayTripModal({ visible, trip, onClose }) {
  const slides = useMemo(() => (visible ? buildTripFilm(trip) : []), [visible, trip]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(() => new Set()); // photo URLs that errored → graded card, never a black void
  const fade = useRef(new Animated.Value(0)).current;  // current layer cross-fade
  const kb = useRef(new Animated.Value(0)).current;    // ken-burns progress 0→1
  const timer = useRef(null);

  useEffect(() => { if (visible) setIdx(0); }, [visible]);

  useEffect(() => {
    if (!visible || !slides.length) return undefined;
    const cur = slides[idx];
    const hold = isPhoto(cur) ? PHOTO_HOLD : TITLE_HOLD;
    fade.setValue(0);
    kb.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: FADE, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(kb, { toValue: 1, duration: hold + FADE, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    if (idx < slides.length - 1) {
      timer.current = setTimeout(() => setIdx(i => Math.min(slides.length - 1, i + 1)), hold);
    }
    return () => clearTimeout(timer.current);
  }, [idx, visible, slides]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !slides.length) return null;
  const cur = slides[idx];
  const prev = slides[idx - 1];
  const scale = kb.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.06] });
  const pan = kb.interpolate({ inputRange: [0, 1], outputRange: [0, idx % 2 ? -14 : 14] }); // alternate vector

  const onImgError = (uri) => setFailed(prev => (prev.has(uri) ? prev : new Set(prev).add(uri)));

  const renderLayer = (s, animated) => {
    if (isPhoto(s) && !failed.has(s.uri)) {
      return animated
        ? <Animated.Image source={{ uri: s.uri }} onError={() => onImgError(s.uri)} style={[st.full, { transform: [{ scale }, { translateX: pan }] }]} resizeMode="cover" />
        : <Image source={{ uri: s.uri }} onError={() => onImgError(s.uri)} style={st.full} resizeMode="cover" />;
    }
    // title slide OR a failed/missing photo → a warm graded field, NEVER a black void
    return <LinearGradient colors={['#241a12', '#5b3d27', '#1c140d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.full} />;
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.root}>
        {/* warm base — a graded backdrop is ALWAYS present while an image loads or if one
            fails, so a missing photo / empty slide can never render as a black void */}
        <LinearGradient colors={['#1c140d', '#3a281a', '#120c08']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={st.full} pointerEvents="none" />
        {/* prev layer (under) so the current cross-fades OVER it */}
        {prev ? <View style={st.full}>{renderLayer(prev, false)}</View> : null}
        {/* current layer */}
        <Animated.View style={[st.full, { opacity: fade }]}>{renderLayer(cur, true)}</Animated.View>

        {/* unifying warm grade + bottom scrim (cohesion + text legibility) */}
        <LinearGradient
          colors={['rgba(60,36,16,0.28)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.62)']}
          locations={[0, 0.45, 1]} style={st.full} pointerEvents="none"
        />
        {/* letterbox */}
        <View style={[st.bar, { top: 0, height: BAR }]} pointerEvents="none" />
        <View style={[st.bar, { bottom: 0, height: BAR }]} pointerEvents="none" />

        {/* typeset text */}
        <Animated.View style={[st.textWrap, { opacity: fade }]} pointerEvents="none">
          {cur.kicker ? <Text style={st.kicker}>{cur.kicker.toUpperCase()}</Text> : null}
          {cur.type !== 'photo' ? <Text style={st.title}>{cur.title}</Text> : null}
          {cur.type !== 'photo' && cur.subtitle ? <Text style={st.subtitle}>{cur.subtitle}</Text> : null}
          {cur.type === 'photo' && cur.caption ? <Text style={st.caption}>{cur.caption}</Text> : null}
        </Animated.View>

        {/* tap zones: left = back, right = forward (under the controls) */}
        <TouchableOpacity style={st.tapL} activeOpacity={1} onPress={() => setIdx(i => Math.max(0, i - 1))} />
        <TouchableOpacity style={st.tapR} activeOpacity={1} onPress={() => setIdx(i => Math.min(slides.length - 1, i + 1))} />

        {/* progress + close (on top) */}
        <View style={[st.progress, { top: BAR + 14 }]} pointerEvents="none">
          {slides.map((_, i) => <View key={i} style={[st.dot, i === idx && st.dotOn]} />)}
        </View>
        <TouchableOpacity style={[st.close, { top: BAR + 6 }]} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={st.closeX}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  full: { position: 'absolute', top: 0, left: 0, width: W, height: H },
  bar: { position: 'absolute', left: 0, width: W, backgroundColor: '#000' },
  textWrap: { position: 'absolute', left: 28, right: 28, bottom: BAR + 54, alignItems: 'flex-start' },
  kicker: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: 8 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: 0.3, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 12 },
  subtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600', letterSpacing: 1.5, marginTop: 10 },
  caption: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 0.2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 },
  tapL: { position: 'absolute', left: 0, top: 0, width: W * 0.35, height: H },
  tapR: { position: 'absolute', right: 0, top: 0, width: W * 0.45, height: H },
  progress: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#fff', width: 18 },
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  closeX: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
