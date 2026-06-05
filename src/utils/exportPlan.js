/**
 * exportPlan.js — Export a Voyara trip as a PDF
 *
 * Dependencies (install before use):
 *   npx expo install expo-print expo-sharing
 *
 * Generates a rich HTML itinerary → converts to PDF via expo-print
 * → opens iOS/Android share sheet via expo-sharing.
 */

import { Alert } from 'react-native';
import { getAllMembers, fmt, fmtM } from './helpers';
import { googleMapsDayShareUrl } from './mapsRoute';
import { coverTagline, countdownLine, dayVibe, closingNote } from './tripCopy';
import { APP_NAME } from '../config';

// ─── Activity type metadata ───────────────────────────────────────────────────

const ACT_COLORS = {
  transport: '#3b82f6',
  stay:      '#8b5cf6',
  food:      '#f97316',
  activity:  '#10b981',
  note:      '#6b7280',
};

const ACT_ICONS = {
  transport: '🚗',
  stay:      '🏨',
  food:      '🍽️',
  activity:  '🎯',
  note:      '📝',
};

const CAT_ICONS = { '🏨': '🏨', '✈️': '✈️', '🍽️': '🍽️', '🎯': '🎯' };

// Motivational copy (coverTagline / countdownLine / dayVibe / closingNote) is
// original + varied + deterministic — see ./tripCopy (no AI, no API, no IP risk).

// ─── HTML builder ─────────────────────────────────────────────────────────────

export function buildHTML(trip, travelers = []) {
  const allMembers   = getAllMembers(trip);
  const totalDays    = trip.days?.length || 0;
  const totalActs    = trip.days?.flatMap(d => d.activities).length || 0;
  const totalCostPP  = trip.days?.flatMap(d => d.activities)
    .reduce((s, a) => s + (a.costPerPerson || 0), 0) || 0;
  const groupTotal   = totalCostPP * allMembers.length;

  // ── CSS ────────────────────────────────────────────────────────────────────
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* print-color-adjust: keep hero/table/pill backgrounds when rendered to PDF */
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: 800px; margin: 0 auto; padding: 0 0 32px; }
    .pad { padding: 22px 32px 0; }

    /* Cover hero — rich trip color (solid fallback + gradient where it renders) */
    .cover { color: #fff; padding: 40px 32px 30px; background-color: #6366f1; background-image: linear-gradient(135deg, var(--c1), var(--c2)); }
    .cover-emoji { font-size: 52px; line-height: 1; margin-bottom: 10px; }
    .cover-brand { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.85; margin-bottom: 6px; }
    .cover-title { font-size: 34px; font-weight: 800; line-height: 1.1; margin-bottom: 8px; }
    .cover-dest  { font-size: 15px; font-weight: 600; opacity: 0.95; margin-bottom: 4px; }
    .cover-dates { font-size: 13px; opacity: 0.9; }
    .cover-pill  { display: inline-block; margin-top: 14px; background: rgba(255,255,255,0.20); border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700; }
    .cover-tag   { margin-top: 14px; font-size: 14px; font-style: italic; opacity: 0.95; }

    /* Summary row */
    .summary { display: flex; gap: 12px; margin-bottom: 24px; }
    .summary-box { flex: 1; background: #f8f9fa; border-radius: 10px; padding: 14px; text-align: center; }
    .summary-val  { font-size: 22px; font-weight: 800; color: #1a1a2e; }
    .summary-lbl  { font-size: 10px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

    /* Families */
    .section-title { font-size: 11px; font-weight: 800; color: #6b7280; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 10px; margin-top: 20px; }
    .families { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
    .family-card { border-radius: 8px; padding: 10px 14px; border-left: 4px solid; min-width: 160px; }
    .family-name { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    .family-members { font-size: 11px; color: #6b7280; line-height: 1.5; }

    /* Disclaimer */
    .disclaimer { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #1e40af; line-height: 1.5; }
    .disclaimer strong { font-weight: 700; }

    /* Days */
    .day-block { margin-bottom: 20px; page-break-inside: avoid; }
    .day-header { display: flex; align-items: center; gap: 10px; background: #f3f4f6; border-radius: 8px; padding: 8px 14px; margin-bottom: 6px; }
    .day-label  { font-weight: 800; font-size: 13px; color: #1a1a2e; }
    .day-date   { font-size: 11px; color: #6b7280; margin-left: auto; }
    .day-cost   { font-size: 11px; color: #6366f1; font-weight: 700; background: #ede9fe; padding: 2px 8px; border-radius: 20px; }
    .transit-badge { font-size: 10px; color: #7c3aed; font-weight: 700; background: #ede9fe; padding: 2px 8px; border-radius: 20px; }

    .activity { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 6px; margin-bottom: 4px; }
    .activity:nth-child(even) { background: #fafafa; }
    .act-time  { font-size: 11px; color: #6b7280; width: 42px; flex-shrink: 0; padding-top: 1px; font-variant-numeric: tabular-nums; }
    .act-dot   { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
    .act-body  { flex: 1; }
    .act-name  { font-weight: 600; font-size: 13px; color: #1a1a2e; }
    .act-detail{ font-size: 11px; color: #6b7280; margin-top: 2px; line-height: 1.4; }
    .act-addr  { font-size: 10px; color: #9ca3af; margin-top: 2px; }
    .act-note  { font-size: 10px; color: #059669; margin-top: 2px; font-style: italic; }
    .act-cost  { font-size: 12px; font-weight: 700; color: #374151; white-space: nowrap; flex-shrink: 0; }

    /* Budget by family */
    .budget-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    .budget-table th { background: #1a1a2e; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; }
    .budget-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
    .budget-table tr:last-child td { border-bottom: none; font-weight: 700; background: #f8f9fa; }
    .budget-total { font-weight: 800; color: #1a1a2e; }

    /* Expenses */
    .expense-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    .exp-cat  { font-size: 16px; width: 24px; }
    .exp-name { flex: 1; color: #1a1a2e; }
    .exp-amount { font-weight: 700; color: #1a1a2e; }
    .exp-families { font-size: 10px; color: #6b7280; }

    /* Footer */
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    .footer-brand { color: #6366f1; font-weight: 700; }

    /* Excitement extras */
    .moat-intro { font-size: 12px; color: #6b7280; line-height: 1.5; margin: 2px 0 12px; }
    .day-vibe   { font-size: 11px; color: #6366f1; font-style: italic; margin: 2px 0 8px; }
    .closing    { text-align: center; font-size: 14px; font-weight: 700; color: #6366f1; margin: 30px 0 6px; }
  `;

  // ── Families HTML ──────────────────────────────────────────────────────────
  const familiesHTML = trip.families.map(fam => {
    const members = fam.members.map(m => {
      const parts = [m.name];
      if (m.age) parts.push(`${m.age}y`);
      if (m.needs?.length) parts.push(m.needs.slice(0, 2).join(' '));
      return parts.join(' · ');
    }).join('<br>');
    return `
      <div class="family-card" style="border-left-color:${fam.color};background:${fam.color}12;">
        <div class="family-name" style="color:${fam.color}">${fam.name}</div>
        <div class="family-members">${members}</div>
      </div>`;
  }).join('');

  // ── Itinerary HTML ─────────────────────────────────────────────────────────
  const itineraryHTML = (trip.days || []).map((day, i) => {
    if (!day.activities?.length) return '';
    const dayCost = day.activities.reduce((s, a) => s + (a.costPerPerson || 0), 0);
    const hasTransit = day.activities.some(a => a.type === 'transport' && a.name?.includes('→'));

    const activitiesHTML = day.activities.map(act => {
      const color = ACT_COLORS[act.type] || '#6b7280';
      const icon  = ACT_ICONS[act.type] || '📌';
      return `
        <div class="activity">
          <div class="act-time">${act.time || ''}</div>
          <div class="act-dot" style="background:${color}"></div>
          <div class="act-body">
            <div class="act-name">${icon} ${escHtml(act.name)}</div>
            ${act.detail  ? `<div class="act-detail">${escHtml(act.detail)}</div>`   : ''}
            ${act.address ? `<div class="act-addr">📍 ${escHtml(act.address)}</div>` : ''}
            ${act.note    ? `<div class="act-note">💡 ${escHtml(act.note)}</div>`    : ''}
          </div>
          ${act.costPerPerson > 0 ? `<div class="act-cost">$${act.costPerPerson}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="day-block">
        <div class="day-header">
          <span class="day-label">${escHtml(day.label || `Day ${i + 1}`)}</span>
          ${hasTransit ? '<span class="transit-badge">🚗 Travel Day</span>' : ''}
          ${day.date ? `<span class="day-date">${fmt(day.date)}</span>` : ''}
          ${dayCost > 0 ? `<span class="day-cost">${fmtM(dayCost)}/person</span>` : ''}
        </div>
        <div class="day-vibe">${escHtml(dayVibe(day, i))}</div>
        ${activitiesHTML}
      </div>`;
  }).join('');

  // ── Budget by family ───────────────────────────────────────────────────────
  let budgetHTML = '';
  if (trip.budgetByFamily?.length) {
    const rows = trip.budgetByFamily.map(fb => {
      const fam = trip.families.find(f => f.id === fb.familyId);
      return `
        <tr>
          <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${fam?.color || '#6b7280'};margin-right:6px;"></span>${escHtml(fb.familyName || fam?.name || 'Family')}</td>
          <td>${fb.memberCount ?? fam?.members?.length ?? '—'} members</td>
          <td>${fmtM(fb.accommodation || 0)}</td>
          <td>${fmtM(fb.transit || 0)}</td>
          <td>${fmtM(fb.meals || 0)}</td>
          <td>${fmtM(fb.activities || 0)}</td>
          <td class="budget-total">${fmtM(fb.total || 0)}</td>
        </tr>`;
    }).join('');

    const grandTotal = trip.budgetByFamily.reduce((s, fb) => s + (fb.total || 0), 0);

    budgetHTML = `
      <div class="section-title">💰 What each family pays</div>
      <p class="moat-intro">The part no other planner does: everyone pays their fair share — hotels by rooms × nights per family, the rest by headcount. Never just averaged.</p>
      <table class="budget-table">
        <thead>
          <tr>
            <th>Family</th><th>Members</th><th>🏨 Stay</th><th>✈️ Transit</th><th>🍽️ Meals</th><th>🎯 Activities</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td colspan="6" style="font-weight:800;color:#1a1a2e;">Grand Total (all families)</td>
            <td class="budget-total">${fmtM(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:10px;color:#9ca3af;margin-bottom:20px;">
        ✦ Hotel costs split by rooms × nights per family — not averaged per person.
        ✦ Transit, meals and activities split by member count.
      </p>`;
  }

  // ── Expenses HTML ──────────────────────────────────────────────────────────
  let expensesHTML = '';
  if (trip.expenses?.length) {
    const visible = trip.expenses.filter(e => !e.excluded);
    if (visible.length) {
      const rows = visible.map(exp => {
        const famNames = (exp.participatingFamilies || [])
          .map(fid => trip.families.find(f => f.id === fid)?.name || fid)
          .join(', ');
        return `
          <div class="expense-row">
            <div class="exp-cat">${exp.category || '💰'}</div>
            <div class="exp-body" style="flex:1;">
              <div class="exp-name">${escHtml(exp.name)}</div>
              <div class="exp-families">${famNames}</div>
            </div>
            <div class="exp-amount">${fmtM(exp.amount || 0)}</div>
          </div>`;
      }).join('');

      const total = visible.reduce((s, e) => s + (e.amount || 0), 0);
      expensesHTML = `
        <div class="section-title">Splitwise expenses (${visible.length})</div>
        ${rows}
        <div style="text-align:right;font-size:12px;font-weight:800;color:#1a1a2e;padding:8px 0;">
          Total: ${fmtM(total)}
        </div>`;
    }
  }

  // ── Full HTML ──────────────────────────────────────────────────────────────
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const [c1, c2] = Array.isArray(trip.bgColors) && trip.bgColors.length >= 2
    ? trip.bgColors : ['#6366f1', '#8b5cf6'];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(trip.name)} — ${APP_NAME}</title>
  <style>${css}</style>
</head>
<body>
<div class="page" style="--c1:${c1};--c2:${c2};">

  <!-- Cover hero -->
  <div class="cover" style="background-color:${c1};background-image:linear-gradient(135deg,${c1},${c2});">
    <div class="cover-emoji">${escHtml(trip.emoji || '✈️')}</div>
    <div class="cover-brand">${APP_NAME} · Trip Plan</div>
    <div class="cover-title">${escHtml(trip.name)}</div>
    <div class="cover-dest">📍 ${escHtml(trip.destination)}</div>
    <div class="cover-dates">📅 ${fmt(trip.startDate)} – ${fmt(trip.endDate)} · ${totalDays} day${totalDays !== 1 ? 's' : ''} · 👥 ${allMembers.length} traveller${allMembers.length !== 1 ? 's' : ''} · ${trip.families.length} group${trip.families.length !== 1 ? 's' : ''}</div>
    ${countdownLine(trip) ? `<div class="cover-pill">✦ ${escHtml(countdownLine(trip))} ✦</div>` : ''}
    <div class="cover-tag">${escHtml(coverTagline(trip))}</div>
  </div>

  <div class="pad">

  <!-- Summary row -->
  <div class="summary">
    <div class="summary-box">
      <div class="summary-val">${totalDays}</div>
      <div class="summary-lbl">Days</div>
    </div>
    <div class="summary-box">
      <div class="summary-val">${totalActs}</div>
      <div class="summary-lbl">Activities</div>
    </div>
    <div class="summary-box">
      <div class="summary-val">${fmtM(totalCostPP)}</div>
      <div class="summary-lbl">Per person est.</div>
    </div>
    <div class="summary-box">
      <div class="summary-val">${fmtM(groupTotal)}</div>
      <div class="summary-lbl">Group total est.</div>
    </div>
  </div>

  <!-- Disclaimer -->
  <div class="disclaimer">
    <strong>ℹ️ Estimates only.</strong> Prices, availability, and opening hours may differ at time of booking. Always confirm directly with venues and hotels before committing.
  </div>

  <!-- Families -->
  <div class="section-title">Your group</div>
  <div class="families">${familiesHTML}</div>

  <!-- Itinerary -->
  <div class="section-title">Day-by-day itinerary</div>
  ${itineraryHTML || '<p style="color:#9ca3af;font-size:12px;">No activities planned yet.</p>'}

  <!-- Budget by family -->
  ${budgetHTML}

  <!-- Expenses -->
  ${expensesHTML}

  <div class="closing">${escHtml(closingNote(trip))}</div>

  <!-- Footer -->
  <div class="footer">
    <div>
      <span class="footer-brand">${APP_NAME}</span> · Multi-family group travel planner
    </div>
    <div>${escHtml(trip.name)} · ${fmt(trip.startDate)} – ${fmt(trip.endDate)}</div>
  </div>

  </div>
</div>
</body>
</html>`;
}

// ─── HTML escape ──────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Per-day HTML builder ─────────────────────────────────────────────────────

export function buildDayHTML(trip, day, dayIndex) {
  const dayCost = (day.activities || []).reduce((s, a) => s + (a.costPerPerson || 0), 0);
  const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  // expo-print drops <a> link annotations, so addresses are plain text and the
  // ONE day-route link is rendered as a visible (copyable / auto-linkified) URL.
  const routeUrl = googleMapsDayShareUrl(trip, dayIndex);

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: 600px; margin: 0 auto; padding: 0 0 24px; }
    .pad  { padding: 0 28px; }
    .cover { color: #fff; padding: 26px 28px 22px; background-color: #6366f1; background-image: linear-gradient(135deg, var(--c1), var(--c2)); margin-bottom: 16px; }
    .cover-brand { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.85; margin-bottom: 6px; }
    .day-title { font-size: 24px; font-weight: 800; margin-bottom: 3px; }
    .day-meta  { font-size: 12px; opacity: 0.92; }
    .cover-tag { margin-top: 10px; font-size: 13px; font-style: italic; opacity: 0.95; }
    .families  { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .fam-tag   { border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700; border-left: 3px solid; }
    .diet-tag  { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .divider   { height: 1px; background: #e5e7eb; margin: 12px 0; }
    .slot-label { font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin: 14px 0 6px; }
    .activity  { display: flex; align-items: flex-start; gap: 10px; padding: 7px 10px; border-radius: 6px; margin-bottom: 3px; background: #fafafa; }
    .act-time  { font-size: 11px; color: #6b7280; width: 40px; flex-shrink: 0; padding-top: 1px; font-variant-numeric: tabular-nums; }
    .act-dot   { width: 7px; height: 7px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
    .act-body  { flex: 1; }
    .act-name  { font-weight: 600; font-size: 13px; color: #1a1a2e; }
    .act-detail{ font-size: 11px; color: #6b7280; margin-top: 1px; }
    .act-addr  { font-size: 10px; color: #9ca3af; margin-top: 2px; }
    .act-addr a { color: #6366f1; text-decoration: none; }
    .act-cost  { font-size: 12px; font-weight: 700; color: #374151; white-space: nowrap; flex-shrink: 0; }
    /* Route link shown as a VISIBLE url — expo-print drops <a> link annotations,
       so a raw URL is what PDF viewers auto-linkify / users can copy. */
    .route-box   { background: #ede9fe; border-radius: 8px; padding: 10px 12px; margin: 0 0 14px; }
    .route-label { font-size: 12px; font-weight: 700; color: #6366f1; margin-bottom: 3px; }
    .route-url   { font-size: 10px; color: #4f46e5; word-break: break-all; text-decoration: none; }
    .summary   { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
    .sum-label { font-size: 10px; color: #6b7280; font-weight: 700; text-transform: uppercase; }
    .sum-val   { font-size: 18px; font-weight: 800; color: #1a1a2e; }
    .footer    { margin-top: 20px; font-size: 10px; color: #9ca3af; text-align: center; }
  `;

  const SLOT_ORDER = ['morning', 'afternoon', 'evening', 'night'];
  const SLOT_LABELS = { morning: '🌅 Morning', afternoon: '☀️ Afternoon', evening: '🌆 Evening', night: '🌙 Night' };

  function getSlot(timeStr) {
    const [h] = (timeStr || '09:00').split(':').map(Number);
    const m = h * 60;
    if (m < 720)  return 'morning';
    if (m < 1020) return 'afternoon';
    if (m < 1260) return 'evening';
    return 'night';
  }

  const bySlot = { morning: [], afternoon: [], evening: [], night: [] };
  (day.activities || [])
    .slice()
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .forEach(a => bySlot[getSlot(a.time)].push(a));

  const activitiesHTML = SLOT_ORDER
    .filter(sk => bySlot[sk].length > 0)
    .map(sk => {
      const rows = bySlot[sk].map(act => {
        const color = ACT_COLORS[act.type] || '#6b7280';
        const icon  = ACT_ICONS[act.type]  || '📌';
        return `
          <div class="activity">
            <div class="act-time">${act.time || ''}</div>
            <div class="act-dot" style="background:${color}"></div>
            <div class="act-body">
              <div class="act-name">${icon} ${escHtml(act.name)}</div>
              ${act.detail ? `<div class="act-detail">${escHtml(act.detail)}</div>` : ''}
              ${act.address ? `<div class="act-addr">📍 ${escHtml(oneLine(act.address))}</div>` : ''}
            </div>
            ${act.costPerPerson > 0 ? `<div class="act-cost">$${act.costPerPerson}/p</div>` : ''}
          </div>`;
      }).join('');
      return `<div class="slot-label">${SLOT_LABELS[sk]}</div>${rows}`;
    }).join('');

  const familiesHTML = (trip.families || []).map(fam => {
    const dietLabels = (fam.dietary || []).join(' · ');
    return `
      <div class="fam-tag" style="border-left-color:${fam.color};background:${fam.color}14;color:${fam.color}">
        ${escHtml(fam.name)}
        ${dietLabels ? `<div class="diet-tag">${dietLabels}</div>` : ''}
      </div>`;
  }).join('');

  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const [c1, c2] = Array.isArray(trip.bgColors) && trip.bgColors.length >= 2
    ? trip.bgColors : ['#6366f1', '#8b5cf6'];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(day.label)} — ${escHtml(trip.name)}</title>
  <style>${css}</style>
</head>
<body>
<div class="page" style="--c1:${c1};--c2:${c2};">
  <div class="cover" style="background-color:${c1};background-image:linear-gradient(135deg,${c1},${c2});">
    <div class="cover-brand">${APP_NAME} · ${escHtml(trip.name)}</div>
    <div class="day-title">${escHtml(day.label)}</div>
    <div class="day-meta">📅 ${fmt(day.date)} · 📍 ${escHtml(trip.destination)}</div>
    <div class="cover-tag">${escHtml(dayVibe(day, dayIndex || 0))}</div>
  </div>
  <div class="pad">
  ${routeUrl ? `<div class="route-box"><div class="route-label">🗺️ Open this day's route in Google Maps</div><a class="route-url" href="${routeUrl}">${escHtml(routeUrl)}</a></div>` : ''}
  <div class="families">${familiesHTML}</div>
  <div class="divider"></div>
  ${activitiesHTML || '<p style="color:#9ca3af;font-size:12px;">No activities planned.</p>'}
  <div class="summary">
    <div>
      <div class="sum-label">Day cost estimate</div>
      <div class="sum-val">${fmtM(dayCost)}<span style="font-size:12px;font-weight:500;color:#6b7280">/person</span></div>
    </div>
    <div style="text-align:right">
      <div class="sum-label">${(day.activities || []).length} activities</div>
    </div>
  </div>
  <div class="footer">${escHtml(closingNote(trip))} · Generated ${now}</div>
  </div>
</div>
</body>
</html>`;
}

// ─── Public export functions ──────────────────────────────────────────────────

/**
 * exportDayAsPDF(trip, day, dayIndex)
 *
 * Compact single-day PDF: families + dietary, activities by slot, day cost summary.
 * Triggered from the ⓘ detail sheet in ItineraryScreen.
 */
export async function exportDayAsPDF(trip, day, dayIndex) {
  if (!trip || !day) return;

  try {
    let Print, Sharing;
    try {
      Print   = await import('expo-print');
      Sharing = await import('expo-sharing');
    } catch {
      Alert.alert(
        'Package not installed',
        'Run this in your terminal first:\n\nnpx expo install expo-print expo-sharing\n\nThen restart Expo Go.',
        [{ text: 'OK' }],
      );
      return;
    }

    const html = buildDayHTML(trip, day, dayIndex);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Sharing not available', 'PDF was saved but sharing is not supported on this device.');
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${day.label} plan`,
      UTI: 'com.adobe.pdf',
    });
  } catch (err) {
    console.error('[exportPlan:day]', err);
    Alert.alert('Export failed', `Could not generate PDF: ${err.message}`);
  }
}

/**
 * exportTripAsPDF(trip, travelers)
 *
 * Requires: npx expo install expo-print expo-sharing
 *
 * Builds an HTML trip plan → converts to PDF → opens iOS/Android share sheet.
 * User can save to Files, AirDrop, email, etc.
 */
export async function exportTripAsPDF(trip, travelers = []) {
  if (!trip) return;

  try {
    // Dynamic import — gracefully fails if packages not yet installed
    let Print, Sharing;
    try {
      Print   = await import('expo-print');
      Sharing = await import('expo-sharing');
    } catch {
      Alert.alert(
        'Package not installed',
        'Run this in your terminal first:\n\nnpx expo install expo-print expo-sharing\n\nThen restart Expo Go.',
        [{ text: 'OK' }],
      );
      return;
    }

    const html = buildHTML(trip, travelers);

    // Generate PDF file on device
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    // Check if sharing is available (it always is on device builds)
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Sharing not available', 'PDF was saved but sharing is not supported on this device.');
      return;
    }

    // Open share sheet — user can save to Files, AirDrop, email, etc.
    const safeName = trip.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${trip.name} itinerary`,
      UTI: 'com.adobe.pdf',
    });

  } catch (err) {
    console.error('[exportPlan]', err);
    Alert.alert('Export failed', `Could not generate PDF: ${err.message}`);
  }
}
