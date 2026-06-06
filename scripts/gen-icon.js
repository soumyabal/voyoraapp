/**
 * gen-icon.js — generates Kithova's launch assets from the brand mark, locally (no design
 * tool, no external service — same spirit as gen-music.js). Run: `node scripts/gen-icon.js`.
 *
 * Produces (1024×1024 PNG):
 *   assets/icon.png          App icon — the "kith constellation" (5 family-colored dots +
 *                            cream hub, each softly glowing) on the ink→coffee→terracotta hero
 *                            gradient. Edge-to-edge + opaque (iOS auto-rounds; App Store rejects
 *                            transparent icons). Bold, brand-true.
 *   assets/adaptive-icon.png Android foreground — same art, mark kept inside the mask safe-zone.
 *   assets/splash-icon.png   Splash logo — the mark with an INK hub on TRANSPARENT, centered
 *                            with padding. app.json splash bg is #f7f5f2 (= colors.bg), which is
 *                            also LoadingScreen's bg, so the static splash hands off to the
 *                            animated LoadingScreen with no white flash.
 *
 * Colors mirror src/theme.js (markColors + gradients.hero) — keep them in sync by hand; this
 * script is intentionally dependency-light and doesn't import the RN theme.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const S = 1024;                 // canvas size
const C = S / 2;                // center

// ── Brand palette (mirrors src/theme.js) ──────────────────────────────────────
const HERO = ['#1a1714', '#3d2c1e', '#e86c3a'];                 // gradients.hero (ink→coffee→terracotta)
const MARK = ['#e86c3a', '#6c5ce7', '#0e9f6e', '#e09a37', '#c8532a']; // markColors
const CREAM = '#f7f5f2';        // colors.bg
const INK = '#1c1714';          // colors.ink

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// 3-stop vertical gradient colour at row y.
function heroAt(y) {
  const t = y / (S - 1);
  const a = hex(HERO[0]), b = hex(HERO[1]), c = hex(HERO[2]);
  return t < 0.5 ? lerpRGB(a, b, t / 0.5) : lerpRGB(b, c, (t - 0.5) / 0.5);
}

// Alpha-composite a colour [r,g,b] with coverage `cov` (0..1) onto buffer pixel i (RGBA).
function over(buf, i, rgb, cov) {
  if (cov <= 0) return;
  const ia = buf[i + 3] / 255;            // existing alpha
  const oa = cov + ia * (1 - cov);        // out alpha
  for (let k = 0; k < 3; k++) {
    const dst = buf[i + k];
    buf[i + k] = Math.round((rgb[k] * cov + dst * ia * (1 - cov)) / (oa || 1));
  }
  buf[i + 3] = Math.round(oa * 255);
}

// Paint a feathered filled circle (anti-aliased edge ~1.5px). Loop bounds are floored to
// INTEGERS — a fractional loop var makes (y*S+x)*4 a fractional buffer index that silently
// no-ops, so cx/cy/r may be floats but the pixel coords iterated must not be.
function circle(buf, cx, cy, r, rgb, alpha = 1) {
  const pad = 2;
  const y0 = Math.max(0, Math.floor(cy - r - pad)), y1 = Math.min(S, Math.ceil(cy + r + pad));
  const x0 = Math.max(0, Math.floor(cx - r - pad)), x1 = Math.min(S, Math.ceil(cx + r + pad));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const cov = (1 - smooth(r - 1, r + 1, d)) * alpha;
      if (cov > 0) over(buf, (y * S + x) * 4, rgb, cov);
    }
  }
}

// Soft radial glow (no hard edge) — for the "glowing dot" excitement on the dark gradient.
function glow(buf, cx, cy, r, rgb, peak = 0.35) {
  const pad = 2;
  const y0 = Math.max(0, Math.floor(cy - r - pad)), y1 = Math.min(S, Math.ceil(cy + r + pad));
  const x0 = Math.max(0, Math.floor(cx - r - pad)), x1 = Math.min(S, Math.ceil(cx + r + pad));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const cov = (1 - smooth(0, r, d)) ** 2 * peak;
      if (cov > 0) over(buf, (y * S + x) * 4, rgb, cov);
    }
  }
}

// Dot ring positions (start at top, 72° apart).
function ringDots(ringR) {
  return MARK.map((c, i) => {
    const a = (i / MARK.length) * 2 * Math.PI - Math.PI / 2;
    return { x: C + ringR * Math.cos(a), y: C + ringR * Math.sin(a), rgb: hex(c) };
  });
}

// ── Build the icon (gradient bg + glowing dots + cream hub) ───────────────────
function buildIcon() {
  const png = new PNG({ width: S, height: S });
  const buf = png.data;
  for (let y = 0; y < S; y++) {
    const row = heroAt(y);
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      buf[i] = Math.round(row[0]); buf[i + 1] = Math.round(row[1]); buf[i + 2] = Math.round(row[2]); buf[i + 3] = 255;
    }
  }
  const ringR = 0.235 * S, dotR = 0.083 * S, hubR = 0.066 * S;
  const dots = ringDots(ringR);
  dots.forEach(d => glow(buf, d.x, d.y, dotR * 2.1, d.rgb, 0.30));   // glow pass first (under)
  dots.forEach(d => circle(buf, d.x, d.y, dotR, d.rgb, 1));          // crisp dots
  glow(buf, C, C, hubR * 2.0, hex(CREAM), 0.22);                     // hub halo
  circle(buf, C, C, hubR, hex(CREAM), 1);                           // cream hub (pops on dark)
  return png;
}

// ── Build the splash logo (transparent, ink hub, padded) ──────────────────────
function buildSplash() {
  const png = new PNG({ width: S, height: S });
  png.data.fill(0);                                  // fully transparent
  const buf = png.data;
  const ringR = 0.16 * S, dotR = 0.056 * S, hubR = 0.045 * S;  // smaller → padded logo under "contain"
  ringDots(ringR).forEach(d => circle(buf, d.x, d.y, dotR, d.rgb, 1));
  circle(buf, C, C, hubR, hex(INK), 1);
  return png;
}

function write(png, file) {
  const out = path.join(__dirname, '..', 'assets', file);
  fs.writeFileSync(out, PNG.sync.write(png));   // synchronous — no stream race on process exit
  console.log('wrote', file, `(${S}×${S})`);
}

const icon = buildIcon();
write(icon, 'icon.png');
write(buildIcon(), 'adaptive-icon.png');   // same art; mark sits well inside the Android safe-zone
write(buildSplash(), 'splash-icon.png');
