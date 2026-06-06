/**
 * PlayTripModal.js — "Play My Trip": a "Trip Wrapped" montage of the user's OWN trip photos.
 *
 * Imagery is the trip's CACHED place photos (act.photo) — nothing is fetched live, no new API
 * calls: this just replays photos already saved on the itinerary, the same ones every thumbnail
 * shows. The current API key is re-stamped onto each URL at render (refreshPhotoKey) so photos
 * survive key rotation. Every slide falls back to a branded gradient card when it has no cached
 * photo, so it's always beautiful, never broken.
 *
 * Deck (cover → who → days → fair-split moat → branded close) comes from buildTripFilm (pure);
 * this file plays it: slow Ken-Burns drift, cross-fades, big type, an original music bed.
 */
/* eslint-disable react-hooks/refs, react-hooks/immutability -- RN animation idiom: the
   fade/drift Animated.Values live in useRef and are read via .interpolate() during render;
   and expo-audio's useAudioPlayer() returns a documented MUTABLE native handle whose setters
   (player.loop / .volume) are applied inside an effect, not render. React Compiler is OFF —
   both are false positives. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Image, Animated, Easing, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { buildTripFilm, pickSoundtrack } from '../utils/tripFilm';
import { refreshPhotoKey } from '../utils/places';
import { colors } from '../theme';
import KithovaMark from '../components/ui/KithovaMark';
import KithovaWordmark from '../components/ui/KithovaWordmark';

// The music beds are ORIGINAL — synthesized from scratch by scripts/gen-music.js (no sample,
// no third-party track), so there is nothing to license or infringe. In-app only. Each trip
// gets one deterministically (pickSoundtrack) so it keeps its own "theme song".
const TRACKS = {
  warm:   require('../../assets/playtrip-bed.wav'),
  wonder: require('../../assets/playtrip-wonder.wav'),
  dream:  require('../../assets/playtrip-dream.wav'),
  play:   require('../../assets/playtrip-play.wav'),
};

const { width: W, height: H } = Dimensions.get('window');
const HOLD = { cover: 3200, stat: 2500, day: 2800, moat: 3000, close: 3400 };
const FADE = 650;
const holdOf = (s) => HOLD[s.type] || 2600;

export default function PlayTripModal({ visible, trip, onClose }) {
  const slides = useMemo(() => (visible ? buildTripFilm(trip) : []), [visible, trip]);
  const [idx, setIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(() => new Set());  // photo URLs that 403'd → gradient
  const fade = useRef(new Animated.Value(0)).current;   // per-slide cross-fade + content rise
  const drift = useRef(new Animated.Value(0)).current;  // slow Ken-Burns on the backdrop
  const timer = useRef(null);
  const player = useAudioPlayer(TRACKS[pickSoundtrack(trip)] || TRACKS.warm);

  useEffect(() => {
    if (visible) setIdx(0);
    else setImgFailed(new Set());
  }, [visible]);

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
        try { player.volume = v; } catch { /* ignore */ }
        if (v >= 0.55) clearInterval(ramp);
      }, 90);
    } catch { /* film still plays without music */ }
    return () => {
      clearInterval(ramp);
      try { player.pause(); player.seekTo(0); } catch { /* ignore */ }
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !slides.length) return undefined;
    const hold = holdOf(slides[idx]);
    fade.setValue(0);
    drift.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: FADE, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(drift, { toValue: 1, duration: hold + FADE, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    if (idx < slides.length - 1) {
      timer.current = setTimeout(() => setIdx((i) => Math.min(slides.length - 1, i + 1)), hold);
    } else {
      timer.current = setTimeout(() => {
        try { player.volume = 0; player.pause(); } catch { /* ignore */ }
        timer.current = setTimeout(() => { if (onClose) onClose(); }, 450);
      }, hold + 700);
    }
    return () => clearTimeout(timer.current);
  }, [idx, visible, slides]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !slides.length) return null;
  const cur = slides[idx];
  const grad = Array.isArray(cur.grad) && cur.grad.length >= 2 ? cur.grad : ['#2a211b', '#15110d'];
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.12] });
  const panX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, idx % 2 ? -16 : 16] });
  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  // The slide's own cached place photo, re-keyed to the current API key (no fetch). Gradient if none/failed.
  const photoSrc = cur.photoUrl ? refreshPhotoKey(cur.photoUrl) : null;
  const showPhoto = !!(photoSrc && !imgFailed.has(photoSrc));

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.root}>
        {/* backdrop: a free CC photo if one resolved, else the branded gradient — with a slow
            drift, cross-faded per slide */}
        <Animated.View style={[st.full, { opacity: fade }]}>
          <Animated.View style={[st.full, { transform: [{ scale }, { translateX: panX }] }]}>
            {showPhoto ? (
              <Image
                source={{ uri: photoSrc }}
                onError={() => setImgFailed((s) => new Set(s).add(photoSrc))}
                style={st.full}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.full} />
            )}
          </Animated.View>
          {/* scrim — stronger over a photo so the text stays legible */}
          <LinearGradient
            colors={showPhoto
              ? ['rgba(0,0,0,0.40)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.70)']
              : ['rgba(0,0,0,0.20)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.34)']}
            locations={[0, 0.5, 1]} style={st.full} pointerEvents="none"
          />
        </Animated.View>

        {/* centered content */}
        <Animated.View style={[st.content, { opacity: fade, transform: [{ translateY: rise }] }]} pointerEvents="none">
          {cur.kicker ? <Text style={st.kicker}>{cur.kicker}</Text> : null}
          {cur.brand ? (
            <View style={st.lockup}>
              <KithovaMark size={30} hub={colors.white} />
              <KithovaWordmark variant="onDark" size={32} />
            </View>
          ) : null}
          {cur.emoji && !showPhoto ? <Text style={st.emoji}>{cur.emoji}</Text> : null}
          {cur.big ? <Text style={st.big}>{cur.big}</Text> : null}
          {cur.title ? <Text style={st.title}>{cur.title}</Text> : null}
          {cur.subtitle ? <Text style={st.subtitle}>{cur.subtitle}</Text> : null}
        </Animated.View>

        {/* the place name — only when its photo is showing */}
        {showPhoto && cur.photoName ? (
          <Text style={st.credit} pointerEvents="none" numberOfLines={1}>{cur.photoName}</Text>
        ) : null}

        {/* tap zones: left = back, right = forward (under the controls) */}
        <TouchableOpacity style={st.tapL} activeOpacity={1} onPress={() => setIdx((i) => Math.max(0, i - 1))} />
        <TouchableOpacity style={st.tapR} activeOpacity={1} onPress={() => setIdx((i) => Math.min(slides.length - 1, i + 1))} />

        {/* progress + close (on top) */}
        <View style={st.progress} pointerEvents="none">
          {slides.map((_, i) => <View key={i} style={[st.dot, i === idx && st.dotOn]} />)}
        </View>
        <TouchableOpacity style={st.close} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={st.closeX}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15110d' },
  full: { position: 'absolute', top: 0, left: 0, width: W, height: H },
  content: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: 18 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  emoji: { fontSize: 72, marginBottom: 16 },
  big: { color: '#fff', fontSize: 88, fontWeight: '900', letterSpacing: -1.5, marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 18 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center', lineHeight: 38, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 14 },
  subtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 16, fontWeight: '600', letterSpacing: 0.3, textAlign: 'center', marginTop: 12, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 10 },
  credit: { position: 'absolute', bottom: 18, left: 28, right: 28, color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  tapL: { position: 'absolute', left: 0, top: 0, width: W * 0.35, height: H },
  tapR: { position: 'absolute', right: 0, top: 0, width: W * 0.45, height: H },
  progress: { position: 'absolute', top: 54, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#fff', width: 18 },
  close: { position: 'absolute', top: 46, right: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  closeX: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
