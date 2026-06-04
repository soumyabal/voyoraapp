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
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { buildTripFilm } from '../utils/tripFilm';

// The music bed is ORIGINAL — synthesized from scratch by scripts/gen-music.js (no sample,
// no third-party track), so there is nothing to license or infringe. In-app only.
const BED = require('../../assets/playtrip-bed.wav');

const { width: W, height: H } = Dimensions.get('window');
const BAR = Math.round(H * 0.055);     // letterbox bar height
const PHOTO_HOLD = 3400;               // a reward photo
const BOOKEND_HOLD = 3200;             // open / close, held to breathe
const CARD_HOLD = 2700;                // day / progress / nudge cards
const FADE = 750;                      // cross-fade duration

// A slide shows an IMAGE when it carries one — a reward photo, or an image-backed bookend.
const slideImg = (s) => (s ? (s.uri || s.heroUri || null) : null);
const holdOf = (s) => (s.type === 'photo' ? PHOTO_HOLD : (s.type === 'open' || s.type === 'close') ? BOOKEND_HOLD : CARD_HOLD);
const BIG_TITLE = new Set(['open', 'close', 'day']); // big display title vs a sentence 'line' (progress/nudge)

export default function PlayTripModal({ visible, trip, onClose }) {
  const slides = useMemo(() => (visible ? buildTripFilm(trip) : []), [visible, trip]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(() => new Set()); // photo URLs that errored → graded card, never a black void
  const fade = useRef(new Animated.Value(0)).current;  // current layer cross-fade
  const kb = useRef(new Animated.Value(0)).current;    // ken-burns progress 0→1
  const timer = useRef(null);
  const player = useAudioPlayer(BED);

  useEffect(() => { if (visible) setIdx(0); }, [visible]);

  // Music bed — loop + gentle fade-in while the film plays, stop on close. Wrapped so any
  // audio hiccup never breaks the film. Plays in silent mode (it's an explicit Play tap).
  useEffect(() => {
    if (!visible) return undefined;
    let ramp;
    try {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      player.loop = true;
      player.volume = 0;
      player.seekTo(0);
      player.play();
      let v = 0;
      ramp = setInterval(() => {
        v = Math.min(0.55, v + 0.05);
        try { player.volume = v; } catch (e) { /* ignore */ }
        if (v >= 0.55) clearInterval(ramp);
      }, 90);
    } catch (e) { /* film still plays without music */ }
    return () => {
      clearInterval(ramp);
      try { player.pause(); player.seekTo(0); } catch (e) { /* ignore */ }
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !slides.length) return undefined;
    const cur = slides[idx];
    const hold = holdOf(cur);
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
    const uri = slideImg(s);
    if (uri && !failed.has(uri)) {
      return animated
        ? <Animated.Image source={{ uri }} onError={() => onImgError(uri)} style={[st.full, { transform: [{ scale }, { translateX: pan }] }]} resizeMode="cover" />
        : <Image source={{ uri }} onError={() => onImgError(uri)} style={st.full} resizeMode="cover" />;
    }
    // a card slide (progress/nudge/day) OR a failed/missing image → a warm graded field, NEVER a black void
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
        {/* progress/nudge ride a DIMMED photo (never a blank gradient) — extra darken so the
            longer line stays legible, like a documentary intertitle over footage */}
        {(cur.type === 'progress' || cur.type === 'nudge') && slideImg(cur) ? (
          <View style={[st.full, { backgroundColor: 'rgba(18,11,6,0.5)' }]} pointerEvents="none" />
        ) : null}
        {/* letterbox */}
        <View style={[st.bar, { top: 0, height: BAR }]} pointerEvents="none" />
        <View style={[st.bar, { bottom: 0, height: BAR }]} pointerEvents="none" />

        {/* typeset text */}
        <Animated.View style={[st.textWrap, { opacity: fade }]} pointerEvents="none">
          {cur.kicker ? <Text style={st.kicker}>{cur.kicker.toUpperCase()}</Text> : null}
          {cur.type === 'photo'
            ? (cur.caption ? <Text style={st.caption}>{cur.caption}</Text> : null)
            : (
              <>
                {cur.title ? <Text style={BIG_TITLE.has(cur.type) ? st.title : st.line}>{cur.title}</Text> : null}
                {cur.subtitle ? <Text style={st.subtitle}>{cur.subtitle}</Text> : null}
              </>
            )}
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
  line: { color: '#fff', fontSize: 23, fontWeight: '700', letterSpacing: 0.2, lineHeight: 30, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12 },
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
