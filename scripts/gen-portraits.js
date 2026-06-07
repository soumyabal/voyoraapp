/**
 * gen-portraits.js — two playful DOT portraits, drawn pixel-by-pixel (pointillist /
 * halftone) in the Kithova palette. Local only, dependency-light (pngjs), same spirit
 * as gen-icon.js. Run: `node scripts/gen-portraits.js`.
 *
 *   portraits/founder.png — a stylized founder bust (terracotta dots, brand constellation).
 *                           NOT a likeness — I can't see Soumya; this is a brand-styled avatar.
 *   portraits/claude.png  — a friendly assistant bubble (indigo dots, a sparkle).
 *
 * "Drawn using dots": every mark is an anti-aliased filled circle placed on a jittered grid,
 * sized by a form-shading function (darker/curved areas → bigger dots) for a hand-stippled feel.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const W = 760, H = 760;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const CREAM = hex('#f7f5f2');
const TERRA = hex('#e86c3a'), TERRA_D = hex('#b8431f');
const INDIGO = hex('#6c5ce7'), INDIGO_D = hex('#3f33a6');
const INK = hex('#241c17'), COFFEE = hex('#3d2c1e');
const MARK = ['#e86c3a', '#6c5ce7', '#0e9f6e', '#e09a37', '#c8532a'].map(hex);

// Alpha-composite rgb at coverage cov onto pixel i (RGBA).
function over(buf, i, rgb, cov) {
  if (cov <= 0) return;
  const ia = buf[i + 3] / 255, oa = cov + ia * (1 - cov);
  for (let k = 0; k < 3; k++) buf[i + k] = Math.round((rgb[k] * cov + buf[i + k] * ia * (1 - cov)) / (oa || 1));
  buf[i + 3] = Math.round(oa * 255);
}

// One feathered dot (anti-aliased ~1.2px edge). Integer pixel loop (fractional → silent no-op).
function dot(buf, cx, cy, r, rgb, alpha = 1) {
  if (r <= 0) return;
  const pad = 2;
  const x0 = Math.max(0, Math.floor(cx - r - pad)), x1 = Math.min(W - 1, Math.ceil(cx + r + pad));
  const y0 = Math.max(0, Math.floor(cy - r - pad)), y1 = Math.min(H - 1, Math.ceil(cy + r + pad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    const cov = Math.max(0, Math.min(1, (r - d + 0.6) / 1.2)) * alpha;
    if (cov > 0) over(buf, (y * W + x) * 4, rgb, cov);
  }
}

function line(buf, x0, y0, x1, y1, rgb, w = 1, alpha = 0.5) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) { const t = s / steps; dot(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w, rgb, alpha); }
}

// Seeded PRNG so re-runs are identical.
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Sphere-ish form shading at (x,y) for an ellipse centre — 1=lit, 0=shadow. Light upper-left.
function sphereShade(x, y, cx, cy, rx, ry) {
  const nx = (x - cx) / rx, ny = (y - cy) / ry;
  const r2 = nx * nx + ny * ny;
  if (r2 > 1) return 0.35;
  const nz = Math.sqrt(1 - r2);
  const L = [-0.45, -0.55, 0.70]; const len = Math.hypot(...L);
  const d = (nx * L[0] + ny * L[1] + nz * L[2]) / len;
  return Math.max(0, Math.min(1, 0.25 + 0.85 * d));
}

// Halftone-fill a region: jittered grid, dot size from shade (darker → bigger), colour
// lerped base→dark in shadow. inside(x,y)→bool, shade(x,y)→0..1.
function halftone(buf, { inside, shade, base, dark, grid = 12, maxR = 4.6, R, seed = 1 }) {
  const rand = rng(seed);
  for (let gy = -grid; gy < H + grid; gy += grid) {
    for (let gx = -grid; gx < W + grid; gx += grid) {
      const jx = gx + (rand() - 0.5) * grid * 0.85, jy = gy + (rand() - 0.5) * grid * 0.85;
      if (!inside(jx, jy)) continue;
      const s = Math.max(0, Math.min(1, shade(jx, jy)));
      const r = (R || maxR) * (0.34 + 0.66 * (1 - s));
      const col = base.map((c, k) => Math.round(c + (dark[k] - c) * (1 - s) * 0.9));
      dot(buf, jx, jy, r, col, 0.96);
    }
  }
}

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function newCanvas() {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = CREAM[0]; png.data[i + 1] = CREAM[1]; png.data[i + 2] = CREAM[2]; png.data[i + 3] = 255; }
  return png;
}

// ── A small brand constellation (5 dots + faint links) centred at (cx,cy) ──────
function constellation(buf, cx, cy, scale, alpha = 1) {
  const pts = [[-1, -0.5], [0.9, -0.9], [1.1, 0.5], [0, 1.1], [-1.05, 0.7]].map(([x, y]) => [cx + x * scale, cy + y * scale]);
  for (let i = 0; i < pts.length; i++) line(buf, ...pts[i], ...pts[(i + 1) % pts.length], INK, 0.8, 0.18 * alpha);
  dot(buf, cx, cy, scale * 0.16, CREAM, alpha); dot(buf, cx, cy, scale * 0.13, INK, alpha);
  pts.forEach((p, i) => { dot(buf, p[0], p[1], scale * 0.2, MARK[i % MARK.length], alpha); });
}

// ── Portrait 1 — the founder bust ──────────────────────────────────────────────
function founder() {
  const png = newCanvas(); const buf = png.data;
  const cx = 380, cy = 330, rx = 150, ry = 178;            // head
  const shCx = 380, shCy = 820, shRx = 330, shRy = 360;    // shoulders dome
  const inHead = (x, y) => inEllipse(x, y, cx, cy, rx, ry);
  const inNeck = (x, y) => x > cx - 58 && x < cx + 58 && y > cy + ry - 40 && y < cy + ry + 70;
  const inShoulders = (x, y) => y > 470 && y < 720 && inEllipse(x, y, shCx, shCy, shRx, shRy);
  const hairline = (x) => cy - ry * 0.34 + 26 * Math.cos((x - cx) / rx * 1.6); // wavy cap

  // shoulders (terracotta, lit from top)
  halftone(buf, {
    inside: (x, y) => inShoulders(x, y) && !inHead(x, y), base: TERRA, dark: TERRA_D,
    shade: (x, y) => Math.max(0, Math.min(1, 0.9 - (y - 480) / 280)), grid: 13, maxR: 4.4, seed: 7,
  });
  // neck
  halftone(buf, { inside: inNeck, base: TERRA, dark: TERRA_D, shade: () => 0.4, grid: 12, maxR: 4.2, seed: 9 });
  // face (skip the hair cap region)
  halftone(buf, {
    inside: (x, y) => inHead(x, y) && y > hairline(x), base: TERRA, dark: TERRA_D,
    shade: (x, y) => sphereShade(x, y, cx, cy, rx, ry), grid: 11, maxR: 4.5, seed: 3,
  });
  // hair cap (ink/coffee)
  halftone(buf, {
    inside: (x, y) => inHead(x, y) && y <= hairline(x) + 6, base: COFFEE, dark: INK,
    shade: (x, y) => sphereShade(x, y, cx, cy - 30, rx, ry) * 0.7, grid: 10, maxR: 5.0, seed: 5,
  });

  // features — subtle, dotted (a suggestion of a face, not a cartoon)
  const eyeY = cy + 6;
  [[cx - 52, eyeY], [cx + 52, eyeY]].forEach(([ex, ey]) => {
    dot(buf, ex, ey, 7.5, CREAM, 0.95); dot(buf, ex, ey, 4.6, INK, 0.95);            // eye
    dot(buf, ex + 2.4, ey - 2.4, 1.8, CREAM, 0.95);                                  // catchlight → friendlier gaze
    for (let t = -1; t <= 1; t += 0.25) dot(buf, ex + t * 22, ey - 31 - Math.abs(t) * 1.4, 2.2, COFFEE, 0.6); // brow (higher, flatter)
  });
  dot(buf, cx, cy + 48, 3.0, TERRA_D, 0.8); dot(buf, cx - 9, cy + 52, 2.4, TERRA_D, 0.6); dot(buf, cx + 9, cy + 52, 2.4, TERRA_D, 0.6); // nose
  for (let t = -1; t <= 1; t += 0.1) { const x = cx + t * 50, y = cy + 92 + 18 * (1 - t * t); dot(buf, x, y, 3.2, TERRA_D, 0.9); }  // smile (corners UP)
  dot(buf, cx - 52, cy + 100, 2.6, TERRA_D, 0.7); dot(buf, cx + 52, cy + 100, 2.6, TERRA_D, 0.7);  // upturned corners

  constellation(buf, cx + 150, cy - 200, 64, 1);          // brand accent, upper-right
  return png;
}

// ── Portrait 2 — the Claude bubble ──────────────────────────────────────────────
function claude() {
  const png = newCanvas(); const buf = png.data;
  const cx = 380, cy = 348, rx = 196, ry = 196;           // round head
  const bodyCx = 380, bodyCy = 760, bodyRx = 250, bodyRy = 240;
  const inHead = (x, y) => inEllipse(x, y, cx, cy, rx, ry);
  const inBody = (x, y) => y > 540 && y < 720 && inEllipse(x, y, bodyCx, bodyCy, bodyRx, bodyRy);

  halftone(buf, {                                          // shoulders/body
    inside: (x, y) => inBody(x, y) && !inHead(x, y), base: INDIGO, dark: INDIGO_D,
    shade: (x, y) => Math.max(0, Math.min(1, 0.85 - (y - 545) / 260)), grid: 13, maxR: 4.6, seed: 21,
  });
  halftone(buf, {                                          // head — fuller (less shadow falloff)
    inside: inHead, base: INDIGO, dark: INDIGO_D,
    shade: (x, y) => 0.35 + 0.5 * sphereShade(x, y, cx, cy, rx, ry), grid: 10, maxR: 4.8, seed: 23,
  });

  // friendly face — dark dots so they read on BOTH the cream-lit and indigo-shadow sides
  [[cx - 62, cy - 6], [cx + 62, cy - 6]].forEach(([ex, ey]) => {
    dot(buf, ex, ey, 13, CREAM, 0.95);                                               // soft white backing
    dot(buf, ex, ey, 10, INK, 0.98);                                                 // eye
    dot(buf, ex + 3.5, ey - 3.5, 2.6, CREAM, 0.95);                                  // catchlight
  });
  for (let t = -1; t <= 1; t += 0.08) { const x = cx + t * 60, y = cy + 78 + 26 * (1 - t * t); dot(buf, x, y, 4.4, INK, 0.95); } // smile (corners up)

  // a sparkle (4-point dotted star) — the "assistant" wink, in brand terracotta
  const sx = cx + 168, sy = cy - 150;
  for (let d = -40; d <= 40; d += 5) { dot(buf, sx + d, sy, 2.0 + (1 - Math.abs(d) / 40) * 2.4, TERRA, 0.9); dot(buf, sx, sy + d, 2.0 + (1 - Math.abs(d) / 40) * 2.4, TERRA, 0.9); }
  dot(buf, sx, sy, 4.2, TERRA, 1);
  dot(buf, cx - 196, cy + 150, 5, MARK[2], 0.9); dot(buf, cx + 196, cy + 120, 4, MARK[3], 0.9); // tiny accents
  return png;
}

const outDir = path.join(__dirname, '..', 'portraits');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, make] of [['founder', founder], ['claude', claude]]) {
  const file = path.join(outDir, `${name}.png`);
  make().pack().pipe(fs.createWriteStream(file)).on('finish', () => console.log('wrote', file));
}
