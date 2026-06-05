/**
 * ensure-config.js — guarantee src/config.js exists before the test suite runs.
 *
 * src/config.js holds local API keys and is gitignored (never committed). On a fresh
 * checkout or in CI it won't exist, and jest imports it transitively, so the suite
 * would fail to load. This runs as jest's `globalSetup` (see package.json) and copies
 * src/config.example.js → src/config.js when it's missing — giving CI a key-free config
 * (empty/null keys → the app's mock fallbacks kick in; no live API calls in tests).
 * Locally it's a no-op because your real src/config.js is already present.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function ensureConfig() {
  const cfg = path.join(__dirname, '..', 'src', 'config.js');
  const example = path.join(__dirname, '..', 'src', 'config.example.js');
  if (!fs.existsSync(cfg) && fs.existsSync(example)) {
    fs.copyFileSync(example, cfg);
    // eslint-disable-next-line no-console
    console.log('[ensure-config] src/config.js was missing — created it from config.example.js');
  }
};

// Allow running standalone too: `node scripts/ensure-config.js`
if (require.main === module) {
  module.exports();
}
