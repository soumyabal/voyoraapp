/**
 * gen-music.js — synthesizes the "Play My Trip" music library FROM SCRATCH.
 *
 * Why this exists: zero legal risk. There is no sample, no recording, no third-party
 * "royalty-free" track of uncertain provenance — every sample is computed from math here,
 * so the audio is 100% original and owned by the project. Run: `node scripts/gen-music.js`.
 *
 * Produces four seamless 16s loops, one per mood, that play UNDER the film (ducked at runtime).
 * Each trip gets one deterministically (see pickSoundtrack in utils/tripFilm.js):
 *   warm   — the original calm pad (A · F#m · D · E breathing chords over a low pedal)
 *   wonder — bright + hopeful: a climbing bell hook + a recurring tonic chime (I–V–vi–IV)
 *   dream  — wistful + nostalgic: sparse, long-ringing bells over a minor-tinged pad
 *   play   — bouncy + playful: a marimba motif skipping over a major progression
 *
 * Seamless-by-design: a constant tonic drone tuned to a whole number of cycles over the loop
 * (identical sample + slope at the loop point), chord pads that breathe to silence at every
 * chord edge, and melody plucks that fully decay before the loop — so nothing clicks.
 */
const fs = require('fs');
const path = require('path');

const SR = 32000;            // sample rate (Nyquist 16 kHz — plenty for soft pads + bells)
const TOTAL = 16.0;          // loop length (s) — shared by every track
const N = Math.round(TOTAL * SR);

// ── timbres ────────────────────────────────────────────────────────────────────────────────
// A warm pad voice: fundamental + gentle harmonics + a slightly detuned twin (chorus warmth).
function pad(freq, t) {
  const w = 2 * Math.PI * freq;
  const wd = 2 * Math.PI * (freq * 1.0035);
  const body = Math.sin(w * t) + 0.16 * Math.sin(2 * w * t) + 0.06 * Math.sin(3 * w * t);
  return 0.62 * body + 0.38 * Math.sin(wd * t);
}

// Raised-cosine "breath" envelope for a chord of length CHORD: swells up, holds, fades to
// silence at the chord edge — so chord boundaries (and the loop point) never click.
function breath(x, CHORD) {
  if (x < 0 || x > CHORD) return 0;
  const RAMP = Math.min(1.5, CHORD * 0.4), HOLD = CHORD - 2 * RAMP;
  if (x < RAMP) return 0.5 * (1 - Math.cos(Math.PI * x / RAMP));
  if (x < RAMP + HOLD) return 1;
  return 0.5 * (1 + Math.cos(Math.PI * (x - RAMP - HOLD) / RAMP));
}

// A plucked/struck note (bell, chime, marimba): fast attack, exponential decay, a few harmonics.
// Filled directly into the buffer over just its audible window (efficient + naturally → 0).
function addPluck(buf, startSec, freq, gain, decay, bright) {
  const w = 2 * Math.PI * freq;
  const dur = Math.min(TOTAL - startSec, 7 / decay + 0.2);   // until effectively silent
  const i0 = Math.round(startSec * SR), i1 = Math.min(N, Math.round((startSec + dur) * SR));
  for (let i = i0; i < i1; i++) {
    const age = (i - i0) / SR;
    const env = Math.exp(-age * decay) * (1 - Math.exp(-age * 400));  // ~2.5ms attack
    const tone = Math.sin(w * age) + bright * Math.sin(2 * w * age) + bright * 0.35 * Math.sin(3 * w * age);
    buf[i] += gain * env * tone;
  }
}

// Build a per-chord arpeggio/melody: for each chord, play its tones (indexed by `pattern`) up
// `octave` octaves, at the given beat `offsets`. Memorable without a score.
function arpeggio(prog, CHORD, { octave = 2, offsets, pattern, gain, decay, bright }) {
  const notes = [];
  prog.forEach((chord, ci) => {
    const S = ci * CHORD;
    offsets.forEach((off, k) => {
      const tone = chord[pattern[k] % chord.length] * octave;
      notes.push([S + off, tone, gain, decay, bright]);
    });
  });
  return notes;
}

// ── render ───────────────────────────────────────────────────────────────────────────────────
function render({ prog, CHORD, root, padGain = 1.0, droneGain = 0.15, notes = [] }) {
  const buf = new Float64Array(N);
  const BARS = prog.length;
  // Tonic drone tuned to a whole number of cycles over the loop → seamless (0 + same slope at edges).
  const droneFreq = Math.round(root * TOTAL) / TOTAL;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = droneGain * pad(droneFreq, t);
    const c = Math.min(BARS - 1, Math.floor(t / CHORD));
    const env = breath(t - c * CHORD, CHORD);
    if (env > 0) for (const f of prog[c]) v += padGain * env * pad(f, t);
    buf[i] = v;
  }
  for (const [s, f, g, d, b] of notes) addPluck(buf, s, f, g, d, b);
  return buf;
}

function writeWav(buf, dest) {
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const gain = 0.5 / (peak || 1);   // normalize to a quiet bed; runtime ducks further
  const out = Buffer.alloc(44 + N * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + N * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) {
    const s = Math.max(-1, Math.min(1, buf[i] * gain));
    out.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join('assets', dest), out);
  console.log(`wrote assets/${dest} — ${(out.length / 1e6).toFixed(2)} MB`);
}

// ── tracks ─────────────────────────────────────────────────────────────────────────────────

// warm — the original calm bed: I–vi–IV–V pads in A over a low A pedal. No melody.
writeWav(render({
  CHORD: 4.0, root: 110.0, padGain: 1.0, droneGain: 0.15,
  prog: [
    [220.00, 277.18, 329.63], // A   (A3 C#4 E4)
    [185.00, 220.00, 277.18], // F#m (F#3 A3 C#4)
    [146.83, 185.00, 220.00], // D   (D3 F#3 A3)
    [164.81, 207.65, 246.94], // E   (E3 G#3 B3)
  ],
}), 'playtrip-bed.wav');

// wonder — bright + hopeful (I–V–vi–IV in A): a climbing bell arpeggio + a recurring tonic chime.
{
  const CHORD = 4.0;
  const prog = [
    [220.00, 277.18, 329.63], // A   (I)
    [164.81, 207.65, 246.94], // E   (V)
    [185.00, 220.00, 277.18], // F#m (vi)
    [146.83, 185.00, 220.00], // D   (IV)
  ];
  const melody = arpeggio(prog, CHORD, {
    octave: 2, offsets: [0, 0.75, 1.5, 2.75], pattern: [0, 1, 2, 1],
    gain: 0.5, decay: 2.0, bright: 0.5,
  });
  // a recurring high A chime each chord — the "hook" that ties the loop together
  for (let c = 0; c < prog.length; c++) melody.push([c * CHORD + 2.0, 880.0, 0.32, 1.6, 0.55]);
  writeWav(render({ CHORD, root: 110.0, prog, padGain: 0.55, droneGain: 0.13, notes: melody }), 'playtrip-wonder.wav');
}

// dream — wistful + nostalgic (I–vi–IV–V in D, minor-tinged): sparse, long-ringing bells.
{
  const CHORD = 4.0;
  const prog = [
    [146.83, 185.00, 220.00], // D   (I)
    [123.47, 146.83, 185.00], // Bm  (vi)  → the wistful color
    [98.00, 123.47, 146.83],  // G   (IV)
    [110.00, 138.59, 164.81], // A   (V)
  ];
  const melody = arpeggio(prog, CHORD, {
    octave: 4, offsets: [0.5, 2.5], pattern: [2, 1],   // a high fifth falling to the third
    gain: 0.5, decay: 1.1, bright: 0.22,               // long, mellow ring
  });
  writeWav(render({ CHORD, root: 73.42, prog, padGain: 0.62, droneGain: 0.16, notes: melody }), 'playtrip-dream.wav');
}

// play — bouncy + playful (I–V–vi–IV in C, twice over): a marimba motif that skips along.
{
  const CHORD = 2.0;
  const one = [
    [261.63, 329.63, 392.00], // C   (I)
    [196.00, 246.94, 293.66], // G   (V)
    [220.00, 261.63, 329.63], // Am  (vi)
    [174.61, 220.00, 261.63], // F   (IV)
  ];
  const prog = [...one, ...one];   // two passes → 16s
  const melody = arpeggio(prog, CHORD, {
    octave: 2, offsets: [0, 0.5, 1.0, 1.5], pattern: [0, 1, 2, 1],
    gain: 0.42, decay: 5.0, bright: 0.5,               // short, woody marimba
  });
  // a soft root pluck on each downbeat for a little spring
  prog.forEach((ch, ci) => melody.push([ci * CHORD, ch[0], 0.28, 3.5, 0.2]));
  writeWav(render({ CHORD, root: 65.41, prog, padGain: 0.42, droneGain: 0.12, notes: melody }), 'playtrip-play.wav');
}
