#!/usr/bin/env node
/**
 * Brand Name Availability Checker
 * Usage: node brand_checker.js <name> [name2] [name3] ...
 * Example: node brand_checker.js voykin kinvoy itinerai
 */

const https = require('https');

const NAMES = process.argv.slice(2);
if (NAMES.length === 0) {
  console.log('Usage: node brand_checker.js <name> [name2] [name3] ...');
  console.log('Example: node brand_checker.js voykin kinvoy itinerai');
  process.exit(0);
}

const DOMAINS = ['.com', '.app', '.travel', '.io'];

// ─── HTTP fetch helper ────────────────────────────────────────────────────────
function get(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/html, */*',
        ...extraHeaders,
      },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

// ─── Domain check via RDAP ────────────────────────────────────────────────────
async function checkDomain(name, tld) {
  const domain = name + tld;
  const ext = tld.replace('.', '');

  const rdapUrls = {
    com:    `https://rdap.verisign.com/com/v1/domain/${domain}`,
    net:    `https://rdap.verisign.com/net/v1/domain/${domain}`,
    app:    `https://rdap.nic.google/v1/domain/${domain}`,
    io:     `https://rdap.nic.io/domain/${domain}`,
    travel: `https://rdap.org/domain/${domain}`,
  };

  const url = rdapUrls[ext] || `https://rdap.org/domain/${domain}`;

  try {
    const res = await get(url, { Accept: 'application/rdap+json' });
    if (res.status === 200) return { domain, available: false, icon: '❌', status: 'taken' };
    if (res.status === 404) return { domain, available: true, icon: '✅', status: 'available' };
    return { domain, available: null, icon: '❓', status: `status ${res.status} — check manually` };
  } catch {
    return { domain, available: null, icon: '❓', status: 'check manually' };
  }
}

// ─── App Store check via iTunes Search API ────────────────────────────────────
async function checkAppStore(name) {
  try {
    const res = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=15`);
    if (res.status !== 200) return { icon: '❓', status: 'check manually' };
    const data = JSON.parse(res.body);
    const exact = data.results.filter(r => r.trackName.toLowerCase() === name.toLowerCase());
    const similar = data.results
      .filter(r => r.trackName.toLowerCase().includes(name.toLowerCase()) && r.trackName.toLowerCase() !== name.toLowerCase())
      .slice(0, 3)
      .map(r => r.trackName);
    if (exact.length > 0) return { icon: '❌', status: `taken — "${exact[0].trackName}"` };
    if (similar.length > 0) return { icon: '⚠️ ', status: `no exact match  (similar: ${similar.join(', ')})` };
    return { icon: '✅', status: 'no exact match found' };
  } catch {
    return { icon: '❓', status: 'check manually' };
  }
}

// ─── Social handle check ──────────────────────────────────────────────────────
async function checkHandle(url) {
  const res = await get(url);
  if (res.status === 404) return { icon: '✅', status: 'available' };
  if (res.status === 200) return { icon: '❌', status: 'taken' };
  if (res.status === 301 || res.status === 302) return { icon: '❌', status: 'taken (redirect)' };
  return { icon: '❓', status: 'check manually' };
}

// ─── Print helpers ─────────────────────────────────────────────────────────────
const BAR   = '═'.repeat(54);
const THIN  = '─'.repeat(54);
const pad   = (s, n) => String(s).padEnd(n);

function header(name) {
  console.log(`\n${BAR}`);
  console.log(`  🔍  Checking: ${name.toUpperCase()}`);
  console.log(BAR);
}

function section(title) {
  console.log(`\n  ${title}`);
  console.log('  ' + THIN.slice(0, 48));
}

function row(icon, label, status) {
  console.log(`  ${icon}  ${pad(label, 18)}  ${status}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function checkName(name) {
  header(name);

  // Domains
  section('📡  DOMAINS');
  const domainResults = await Promise.all(DOMAINS.map(tld => checkDomain(name, tld)));
  domainResults.forEach(d => row(d.icon, d.domain, d.status));

  // App Store
  section('🍎  APP STORE (iOS)');
  const appStore = await checkAppStore(name);
  row(appStore.icon, 'App Store', appStore.status);

  // Social handles
  section('📲  SOCIAL HANDLES');
  const [tw, ig, tt] = await Promise.all([
    checkHandle(`https://twitter.com/${name}`),
    checkHandle(`https://www.instagram.com/${name}/`),
    checkHandle(`https://www.tiktok.com/@${name}`),
  ]);
  row(tw.icon, `@${name} (X/Twitter)`, tw.status);
  row(ig.icon, `@${name} (Instagram)`, ig.status);
  row(tt.icon, `@${name} (TikTok)`, tt.status);

  // Manual links
  section('🔗  CHECK MANUALLY (click links)');
  console.log(`  📋  USPTO Trademark:`);
  console.log(`      https://tmsearch.uspto.gov/search/search-information`);
  console.log(`      → Search for: "${name}"  |  Classes 39 (travel) and 42 (software)`);
  console.log(`  🤖  Google Play Store:`);
  console.log(`      https://play.google.com/store/search?q=${name}&c=apps`);
  console.log(`  🌐  Namecheap domain search:`);
  console.log(`      https://www.namecheap.com/domains/registration/results/?domain=${name}`);
}

async function main() {
  console.log('\n  Brand Name Availability Checker');
  console.log('  Checking: ' + NAMES.join(', '));

  for (const name of NAMES) {
    await checkName(name.toLowerCase());
  }

  if (NAMES.length > 1) {
    console.log(`\n${BAR}`);
    console.log('  ✅ = available   ❌ = taken   ❓ = check manually');
    console.log(`${BAR}\n`);
  } else {
    console.log(`\n${'─'.repeat(54)}\n`);
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
