/**
 * gen-music.js — synthesizes the "Play My Trip" ambient bed FROM SCRATCH.
 *
 * Why this exists: zero legal risk. There is no sample, no recording, no third-party
 * "royalty-free" track of uncertain provenance — every sample is computed from math here,
 * so the audio is 100% original and owned by the project. Run: `node scripts/gen-music.js`.
 *
 * Sound: a warm, calm 16s loop — a low A pedal tone under four breathing chord pads
 * (A · F#m · D · E, the "Refined Warm" mood). Seamless loop: the 16s length is an exact
 * integer number of pedal cycles, and the pads swell from / fade to silence at the edges.
 */
const fs = require('fs');
const path = require('path');

const SR = 32000;           // sample rate (Nyquist 16 kHz — plenty for a soft pad)
const BARS = 4;             // four chords
const CHORD = 4.0;          // seconds per chord
const TOTAL = BARS * CHORD; // 16.0s — exactly 1760 cycles of the 110 Hz pedal → seamless loop
const N = Math.round(TOTAL * SR);

// A-major family, warm I–vi–IV–V. Each chord = a small cluster of partials.
const PROG = [
  [220.00, 277.18, 329.63], // A   (A3 C#4 E4)
  [185.00, 220.00, 277.18], // F#m (F#3 A3 C#4)
  [146.83, 185.00, 220.00], // D   (D3 F#3 A3)
  [164.81, 207.65, 246.94], // E   (E3 G#3 B3)
];
const PEDAL = 110.0;        // low A pedal tone, constant (1760 whole cycles over 16s → seamless)

// A soft voice: fundamental + gentle harmonics + a slightly detuned twin (chorus warmth).
function voice(freq, t) {
  const w = 2 * Math.PI * freq;
  const wd = 2 * Math.PI * (freq * 1.0035);
  const body = Math.sin(w * t) + 0.16 * Math.sin(2 * w * t) + 0.06 * Math.sin(3 * w * t);
  return 0.62 * body + 0.38 * Math.sin(wd * t);
}

// Raised-cosine "breath" envelope for a chord in [start, start+CHORD]: swells up, holds,
// fades to silence at the chord edge — so chord boundaries (and the loop point) never click.
function breath(t, start) {
  const RAMP = 1.5, HOLD = CHORD - 2 * RAMP;
  const x = t - start;
  if (x < 0 || x > CHORD) return 0;
  if (x < RAMP) return 0.5 * (1 - Math.cos(Math.PI * x / RAMP));
  if (x < RAMP + HOLD) return 1;
  return 0.5 * (1 + Math.cos(Math.PI * (x - RAMP - HOLD) / RAMP));
}

const buf = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let v = 0.15 * voice(PEDAL, t);            // constant warm pedal (seamless: integer cycles)
  const c = Math.min(BARS - 1, Math.floor(t / CHORD));
  const env = breath(t, c * CHORD);
  if (env > 0) for (const f of PROG[c]) v += env * voice(f, t);
  buf[i] = v;
}

// Normalize to a quiet bed (it plays UNDER a film, ducked further at runtime).
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const gain = 0.5 / (peak || 1);

// 16-bit PCM mono WAV.
const out = Buffer.alloc(44 + N * 2);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 2, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  const s = Math.max(-1, Math.min(1, buf[i] * gain));
  out.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
}
const dest = path.join('assets', 'playtrip-bed.wav');
fs.writeFileSync(dest, out);
console.log(`wrote ${dest} — ${(out.length / 1e6).toFixed(2)} MB, ${TOTAL}s @ ${SR}Hz`);
