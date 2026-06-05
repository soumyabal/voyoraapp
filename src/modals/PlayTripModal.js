/**
 * PlayTripModal.js — "Play My Trip": a photo-free "Trip Wrapped" montage.
 *
 * Per the legal review, the montage uses NO Google Places imagery. It's a directed deck of
 * branded gradient cards (cover → who → days → the fair-split moat → branded close) with big
 * type, a slow Ken-Burns drift on each gradient, cross-fades, and an ORIGINAL music bed.
 * Zero external imagery → no licensing/caching risk, no API cost, identical on iOS + Android.
 *
 * Built from buildTripFilm(trip) (pure/deterministic); this file is just the player.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, Animated, Easing, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { buildTripFilm } from '../utils/tripFilm';
import { colors } from '../theme';
import KithovaMark from '../components/ui/KithovaMark';
import KithovaWordmark from '../components/ui/KithovaWordmark';

// The music bed is ORIGINAL — synthesized from scratch by scripts/gen-music.js (no sample,
// no third-party track), so there is nothing to license or infringe. In-app only.
const BED = require('../../assets/playtrip-bed.wav');

const { width: W, height: H } = Dimensions.get('window');
const HOLD = { cover: 3000, stat: 2500, day: 2700, moat: 3000, close: 3400 };
const FADE = 650;
const holdOf = (s) => HOLD[s.type] || 2600;

export default function PlayTripModal({ visible, trip, onClose }) {
  const slides = useMemo(() => (visible ? buildTripFilm(trip) : []), [visible, trip]);
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;   // per-slide cross-fade + content rise
  const drift = useRef(new Animated.Value(0)).current;  // slow Ken-Burns on the gradient
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
      // closing card — hold a beat, fade the music out, then dismiss into a moment of silence
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

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.root}>
        {/* gradient card with a slow drift, cross-faded per slide */}
        <Animated.View style={[st.full, { opacity: fade }]}>
          <Animated.View style={[st.full, { transform: [{ scale }, { translateX: panX }] }]}>
            <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.full} />
          </Animated.View>
          {/* vignette top+bottom for text legibility */}
          <LinearGradient
            colors={['rgba(0,0,0,0.20)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.34)']}
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
          {cur.emoji ? <Text style={st.emoji}>{cur.emoji}</Text> : null}
          {cur.big ? <Text style={st.big}>{cur.big}</Text> : null}
          {cur.title ? <Text style={st.title}>{cur.title}</Text> : null}
          {cur.subtitle ? <Text style={st.subtitle}>{cur.subtitle}</Text> : null}
        </Animated.View>

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
  kicker: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: 18 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  emoji: { fontSize: 72, marginBottom: 16 },
  big: { color: '#fff', fontSize: 88, fontWeight: '900', letterSpacing: -1.5, marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.22)', textShadowRadius: 18 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center', lineHeight: 38, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 14 },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600', letterSpacing: 0.3, textAlign: 'center', marginTop: 12 },
  tapL: { position: 'absolute', left: 0, top: 0, width: W * 0.35, height: H },
  tapR: { position: 'absolute', right: 0, top: 0, width: W * 0.45, height: H },
  progress: { position: 'absolute', top: 54, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#fff', width: 18 },
  close: { position: 'absolute', top: 46, right: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  closeX: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
