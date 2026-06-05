import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, TextInput, Alert,
} from 'react-native';
import useStore from '../store';
import AddExpenseModal from '../modals/AddExpenseModal';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { fmtM, findMember, findMemberFamily, avatarColor } from '../utils/helpers';
import Icon from '../components/ui/Icon';
import {
  resolveMode, getEffectiveFamilies, getEffectiveMembers,
  expSharePerFamily, expSharePerPerson,
  calcFamilyExpenseTotal, calcMemberExpenseShare,
  calcTripItineraryTotal, calcBalances, calcSettlements,
} from '../utils/costs';

// Expense category emoji (stored in exp.category) → Icon name + tint
const CAT_ICON = { '🏨': 'hotel', '✈️': 'plane', '🍽️': 'food', '🎯': 'activity', '💊': 'medkit-outline', '🚗': 'transport' };
const CAT_TINT = { '🏨': colors.smart, '✈️': colors.expert, '🍽️': '#e17055', '🎯': colors.success, '💊': colors.danger, '🚗': colors.expert };

export default function SplitwiseScreen({ trip }) {
  const {
    pushItineraryToSplitwise, clearPushedItinerary,
    deleteExpense, toggleFamilySplit, toggleExpenseMember,
    updateExpensePayer, updateExpenseSplitMode, setTripSplitMode,
    toggleExpenseExcluded, updateExpenseAmount, updateExpenseCustomShares,
    setFamilyHead, toggleSettlementPaid,
  } = useStore();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [headTipDismissed, setHeadTipDismissed] = useState(false);

  const tripMode = trip.splitMode || 'individual';
  const itinExpenses = trip.expenses.filter(e => e.source === 'itinerary');
  const manualExpenses = trip.expenses.filter(e => e.source === 'manual');

  const itinIncluded = itinExpenses.filter(e => !e.excluded);
  const itinSkipped = itinExpenses.filter(e => e.excluded);
  const itinTotal = itinIncluded.reduce((s, e) => s + e.amount, 0);
  const manualTotal = manualExpenses.filter(e => !e.excluded).reduce((s, e) => s + e.amount, 0);
  const grandTotal = trip.expenses.filter(e => !e.excluded).reduce((s, e) => s + e.amount, 0);

  const balances = calcBalances(trip);
  const settlements = calcSettlements([...balances]);

  const modeLabel = tripMode === 'family'
    ? 'Equal share per group — like insurance (group head covers dependents)'
    : 'Equal share per person — great for groups of individuals';

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Split Mode Toggle ── */}
        <View style={styles.modeCard}>
          <Text style={styles.modeCardLabel}>HOW TO SPLIT</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, tripMode === 'individual' && styles.modeBtnActive]}
              onPress={() => setTripSplitMode(trip.id, 'individual')}
            >
              <Icon name="person" size={14} color={tripMode === 'individual' ? colors.accent : colors.subtle} />
              <Text style={[styles.modeBtnText, tripMode === 'individual' && styles.modeBtnTextActive]}>
                By Person
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, tripMode === 'family' && styles.modeBtnActive]}
              onPress={() => setTripSplitMode(trip.id, 'family')}
            >
              <Icon name="people" size={15} color={tripMode === 'family' ? colors.accent : colors.subtle} />
              <Text style={[styles.modeBtnText, tripMode === 'family' && styles.modeBtnTextActive]}>
                By Group
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modeDesc}>{modeLabel}</Text>
        </View>

        {/* ── Family head explainer — shown once when By Group is active ── */}
        {tripMode === 'family' && !headTipDismissed && (
          <View style={styles.headTip}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headTipTitle}>How &quot;By Group&quot; works</Text>
              <Text style={styles.headTipBody}>
                Each family pays an equal share regardless of size. The family head (first member) carries the balance — others in the family show $0 owed. Change the head in the People tab or by tapping a member in Balances below.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setHeadTipDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={16} color="#b45309" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── From Itinerary ── */}
        <View style={styles.sectionHeader}>
          <Icon name="calendar" size={16} color={colors.ink} />
          <Text style={styles.sectionTitle}>From Itinerary</Text>
          {itinExpenses.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.greenLight }]}>
              <Text style={[styles.badgeText, { color: colors.green }]}>{fmtM(itinTotal)}</Text>
            </View>
          )}
          {itinSkipped.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{itinSkipped.length} skipped</Text>
            </View>
          )}
        </View>

        {itinExpenses.length === 0 ? (
          <View style={styles.pushPrompt}>
            <Icon name="calendar" size={32} color={colors.subtle} style={{ marginBottom: 12 }} />
            <Text style={styles.pushPromptText}>
              Your itinerary has{' '}
              <Text style={{ fontWeight: '700' }}>
                {trip.days.reduce((s, d) => s + d.activities.filter(a => a.costPerPerson > 0).length, 0)} costed activities
              </Text>
              {' '}totalling{' '}
              <Text style={{ fontWeight: '700' }}>{fmtM(calcTripItineraryTotal(trip))}</Text>.{'\n'}
              Push them here, then edit actuals and skip what you didn&apos;t do.
            </Text>
            <TouchableOpacity style={styles.pushBtn} onPress={() => pushItineraryToSplitwise(trip.id)}>
              <Icon name="open" size={15} color="#fff" />
              <Text style={styles.pushBtnText}>Move Itinerary to Splitwise</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.clearRow}>
              <Text style={styles.clearHint}>
                {itinIncluded.length} splitting · {itinSkipped.length} skipped
              </Text>
              <TouchableOpacity onPress={() => clearPushedItinerary(trip.id)}>
                <Text style={styles.clearText}>✕ Clear all</Text>
              </TouchableOpacity>
            </View>
            {itinExpenses.map(exp => (
              <ExpenseCard
                key={exp.id} exp={exp} trip={trip}
                onDelete={() => deleteExpense(trip.id, exp.id)}
                onToggleFamily={(famId, v) => toggleFamilySplit(trip.id, exp.id, famId, v)}
                onToggleMember={(mId, v) => toggleExpenseMember(trip.id, exp.id, mId, v)}
                onChangePayer={mId => updateExpensePayer(trip.id, exp.id, mId)}
                onChangeSplitMode={m => updateExpenseSplitMode(trip.id, exp.id, m)}
                onToggleExcluded={() => toggleExpenseExcluded(trip.id, exp.id)}
                onUpdateAmount={amt => updateExpenseAmount(trip.id, exp.id, amt)}
                onUpdateCustomShares={(shares, uneven) => updateExpenseCustomShares(trip.id, exp.id, shares, uneven)}
              />
            ))}
          </>
        )}

        {/* ── Manual / Additional Expenses ── */}
        <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
          <Icon name="receipt-outline" size={16} color={colors.ink} />
          <Text style={styles.sectionTitle}>Additional Expenses</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{manualTotal > 0 ? fmtM(manualTotal) : '$0'}</Text>
          </View>
          <TouchableOpacity style={styles.addExpBtn} onPress={() => setShowAddExpense(true)}>
            <Text style={styles.addExpBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {manualExpenses.length === 0 ? (
          <View style={[styles.pushPrompt, { borderStyle: 'dashed' }]}>
            <Text style={styles.pushPromptText}>
              No additional expenses yet.{'\n'}Add flights, hotel bookings, transfers, shared meals, etc.
            </Text>
          </View>
        ) : (
          manualExpenses.map(exp => (
            <ExpenseCard
              key={exp.id} exp={exp} trip={trip}
              onDelete={() => deleteExpense(trip.id, exp.id)}
              onToggleFamily={(famId, v) => toggleFamilySplit(trip.id, exp.id, famId, v)}
              onToggleMember={(mId, v) => toggleExpenseMember(trip.id, exp.id, mId, v)}
              onChangePayer={mId => updateExpensePayer(trip.id, exp.id, mId)}
              onChangeSplitMode={m => updateExpenseSplitMode(trip.id, exp.id, m)}
              onToggleExcluded={() => toggleExpenseExcluded(trip.id, exp.id)}
              onUpdateAmount={amt => updateExpenseAmount(trip.id, exp.id, amt)}
            />
          ))
        )}

        {/* ── Cost Breakdown ── */}
        {grandTotal > 0 && (
          <View style={[styles.summaryCard, { marginTop: spacing.xl }]}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>
                {tripMode === 'family' ? '👨‍👩‍👧 Cost by Group' : '👤 Cost by Person'}
              </Text>
              <Text style={styles.summaryHint}>{fmtM(grandTotal)} total</Text>
            </View>

            {trip.families.map(fam => {
              const famTotal = calcFamilyExpenseTotal(fam, trip);
              const isFamily = tripMode === 'family';
              const head = fam.members[0];
              return (
                <View key={fam.id} style={styles.famRow}>
                  <View style={[styles.famDot, { backgroundColor: fam.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.famNameRow}>
                      <Text style={styles.famName}>{fam.name}</Text>
                      {isFamily && head && (
                        <View style={styles.headBadge}>
                          <Text style={styles.headBadgeText}>head: {head.name.split(' ')[0]}</Text>
                        </View>
                      )}
                    </View>
                    {isFamily ? (
                      <Text style={styles.famMeta}>
                        {fam.members.length} member{fam.members.length !== 1 ? 's' : ''} · group pays as one unit
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.famMeta}>{fam.members.length} members</Text>
                        {fam.members.map(m => {
                          const ms = calcMemberExpenseShare(m, trip);
                          return (
                            <View key={m.id} style={styles.memberShareRow}>
                              <View style={[styles.memberAvatar, { backgroundColor: avatarColor(m.name) }]}>
                                <Text style={styles.memberAvatarText}>{m.name[0]}</Text>
                              </View>
                              <Text style={styles.memberShareName}>{m.name.split(' ')[0]}</Text>
                              <Text style={styles.memberShareAmt}>{fmtM(ms)}</Text>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </View>
                  <Text style={[styles.famTotal, { color: fam.color }]}>{fmtM(famTotal)}</Text>
                </View>
              );
            })}

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalAmt}>{fmtM(grandTotal)}</Text>
            </View>
          </View>
        )}

        {/* ── Balances & Settlements ── */}
        {balances.some(b => Math.abs(b.net) > 0.5) && (
          <View style={[styles.summaryCard, { marginTop: spacing.lg }]}>
            <View style={styles.balanceTitleRow}>
              <Icon name="git-compare-outline" size={16} color={colors.ink} />
              <Text style={styles.balanceTitleText}>Balances</Text>
            </View>
            {balances
              .filter(b => Math.abs(b.net) > 0.5)
              .map(({ member, net }) => {
                const fam = findMemberFamily(trip, member.id);
                const isHead = tripMode === 'family' && fam?.members[0]?.id === member.id;
                const canPromote = tripMode === 'family' && fam && !isHead;

                const handlePromote = () => {
                  Alert.alert(
                    'Change Family Head',
                    `Make ${member.name.split(' ')[0]} the head of ${fam.name}?\n\nThe head carries the family's full balance share in "By Group" mode.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: '👑 Make Head', onPress: () => setFamilyHead(trip.id, fam.id, member.id) },
                    ],
                  );
                };

                return (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.balanceRow}
                    onPress={canPromote ? handlePromote : undefined}
                    activeOpacity={canPromote ? 0.6 : 1}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: avatarColor(member.name) }]}>
                      <Text style={styles.memberAvatarText}>{member.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.balanceName}>
                        {member.name.split(' ')[0]}{isHead ? ' 👑' : ''}
                      </Text>
                      {fam && <Text style={[styles.balanceFam, { color: fam.color }]}>{fam.name}</Text>}
                      {canPromote && (
                        <Text style={styles.promoteHint}>tap to make head</Text>
                      )}
                    </View>
                    <Text style={[styles.balanceNet, { color: net > 0 ? colors.green : colors.red }]}>
                      {net > 0 ? '▲ gets back' : '▼ owes'} {fmtM(Math.abs(net))}
                    </Text>
                  </TouchableOpacity>
                );
              })}

            <Text style={styles.settleTitle}>Who Pays Whom</Text>
            {settlements.length === 0 ? (
              <Text style={styles.settledText}>All settled up! 🎉</Text>
            ) : (
              settlements.map((s, i) => {
                const fromFam  = findMemberFamily(trip, s.from.id);
                const toFam    = findMemberFamily(trip, s.to.id);
                const key      = `${s.from.id}→${s.to.id}`;
                const isPaid   = (trip.settledTransfers || []).includes(key);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.settleItem, isPaid && styles.settleItemPaid]}
                    onPress={() => toggleSettlementPaid(trip.id, key)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: avatarColor(s.from.name), opacity: isPaid ? 0.5 : 1 }]}>
                      <Text style={styles.memberAvatarText}>{s.from.name[0]}</Text>
                    </View>
                    <View style={{ opacity: isPaid ? 0.5 : 1 }}>
                      <Text style={[styles.settleName, isPaid && styles.settleNamePaid]}>{s.from.name.split(' ')[0]}</Text>
                      {fromFam && <Text style={[styles.settleFam, { color: fromFam.color }]}>{fromFam.name}</Text>}
                    </View>
                    <Icon name="open" size={14} color={colors.subtle} style={isPaid && { opacity: 0.4 }} />
                    <View style={[styles.memberAvatar, { backgroundColor: avatarColor(s.to.name), opacity: isPaid ? 0.5 : 1 }]}>
                      <Text style={styles.memberAvatarText}>{s.to.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1, opacity: isPaid ? 0.5 : 1 }}>
                      <Text style={[styles.settleName, isPaid && styles.settleNamePaid]}>{s.to.name.split(' ')[0]}</Text>
                      {toFam && <Text style={[styles.settleFam, { color: toFam.color }]}>{toFam.name}</Text>}
                    </View>
                    <View style={styles.settleRightCol}>
                      <Text style={[styles.settleAmt, isPaid && { color: colors.muted, textDecorationLine: 'line-through' }]}>
                        {fmtM(s.amount)}
                      </Text>
                      <View style={[styles.settleCheck, isPaid && styles.settleCheckDone]}>
                        {isPaid && <Icon name="check" size={11} color="#fff" />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

      </ScrollView>

      {/* ── Sticky running total footer ── */}
      {grandTotal > 0 && (
        <View style={styles.stickyFooter}>
          <View style={styles.stickyFooterLeft}>
            <Text style={styles.stickyFooterLabel}>
              {trip.expenses.filter(e => !e.excluded).length} expenses
            </Text>
            <Text style={styles.stickyFooterTotal}>{fmtM(grandTotal)}</Text>
          </View>
          <View style={styles.stickyFooterRight}>
            <Text style={styles.stickyFooterLabel}>
              {tripMode === 'family' ? 'per group' : 'per person'}
            </Text>
            <Text style={styles.stickyFooterShare}>
              {tripMode === 'family'
                ? fmtM(grandTotal / (trip.families.length || 1))
                : fmtM(grandTotal / (trip.families.reduce((s, f) => s + f.members.length, 0) || 1))}
            </Text>
          </View>
        </View>
      )}

      <AddExpenseModal visible={showAddExpense} trip={trip} onClose={() => setShowAddExpense(false)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// ExpenseCard
// ─────────────────────────────────────────────────────────────────
function ExpenseCard({
  exp, trip,
  onDelete, onToggleFamily, onToggleMember,
  onChangePayer, onChangeSplitMode,
  onToggleExcluded, onUpdateAmount, onUpdateCustomShares,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editAmount, setEditAmount] = useState(String(exp.amount));

  // Uneven split state — local input map keyed by memberId or famId
  const [customAmounts, setCustomAmounts] = useState({});

  // Seed / re-seed when expense changes
  useEffect(() => { setEditAmount(String(exp.amount)); }, [exp.amount]);
  useEffect(() => {
    if (exp.customShares) setCustomAmounts({ ...exp.customShares });
  }, [exp.id]); // only re-seed when switching to a different expense

  const isExcluded = !!exp.excluded;
  const effectiveMode = resolveMode(exp, trip);
  const effFams = getEffectiveFamilies(exp, trip);
  const effMembers = getEffectiveMembers(exp, trip);
  const spf = expSharePerFamily(exp, trip);
  const spp = expSharePerPerson(exp, trip);
  const payer = findMember(trip, exp.paidBy);
  const payerFam = findMemberFamily(trip, exp.paidBy);
  const modeOverride = exp.splitMode;

  const hasEstimate = exp.estimatedAmount != null && exp.estimatedAmount !== exp.amount;

  const isUneven = !!exp.unevenSplit;
  const splitSummary = isUneven
    ? effectiveMode === 'family'
      ? `${effFams.length} groups · custom split`
      : `${effMembers.length} people · custom split`
    : effectiveMode === 'family'
      ? `${effFams.length} group${effFams.length !== 1 ? 's' : ''} · ${fmtM(spf)}/group`
      : `${effMembers.length} person${effMembers.length !== 1 ? 's' : ''} · ${fmtM(spp)}/person`;

  const commitAmount = () => {
    const v = parseFloat(editAmount);
    if (v > 0 && v !== exp.amount) {
      onUpdateAmount(v);
    } else {
      setEditAmount(String(exp.amount));
    }
  };

  // Jump straight into the custom per-family/-person editor, seeded from the even
  // split (so it starts balanced). Same path as the "Custom" distribution chip.
  const switchToCustom = () => {
    const seeds = {};
    if (effectiveMode === 'family') effFams.forEach(f => { seeds[f.id] = parseFloat(spf.toFixed(2)); });
    else effMembers.forEach(m => { seeds[m.id] = parseFloat(spp.toFixed(2)); });
    setCustomAmounts(seeds);
    onUpdateCustomShares(seeds, true);
  };
  const isLodging = exp.category === '🏨';

  return (
    <View style={[styles.expCard, isExcluded && styles.expCardExcluded]}>
      {/* ── Collapsed header ── */}
      <TouchableOpacity
        style={styles.expHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
      >
        <View style={[styles.expIcon, isExcluded && { opacity: 0.35 }]}>
          <Icon name={CAT_ICON[exp.category] || 'pricetag-outline'} size={18} color={CAT_TINT[exp.category] || colors.subtle} />
        </View>

        <View style={[styles.expInfo, isExcluded && { opacity: 0.45 }]}>
          <Text style={[styles.expName, isExcluded && styles.expNameStrike]} numberOfLines={1}>
            {exp.name}
          </Text>
          {isExcluded ? (
            <Text style={styles.skippedHint}>Skipped · tap to restore</Text>
          ) : (
            <>
              <View style={styles.expSubRow}>
                <Icon name={effectiveMode === 'family' ? 'people' : 'person'} size={11} color={colors.subtle} />
                <Text style={styles.expSub}>{splitSummary}</Text>
              </View>
              {payer && (
                <View style={styles.expSubRow}>
                  <Icon name="card-outline" size={11} color={colors.subtle} />
                  <Text style={styles.expPayer}>{payer.name.split(' ')[0]}{payerFam ? ` · ${payerFam.name}` : ''}</Text>
                </View>
              )}
              {isLodging && !isUneven && (
                <Text style={styles.lodgeNudge}>{'\u{1F6CF}'} Same hotel, different rooms? Tap to adjust</Text>
              )}
            </>
          )}
        </View>

        <View style={styles.expRight}>
          {isExcluded ? (
            <View style={styles.skippedBadge}>
              <Text style={styles.skippedBadgeText}>skipped</Text>
            </View>
          ) : (
            <View style={styles.amountCol}>
              <Text style={styles.expTotal}>{fmtM(exp.amount)}</Text>
              {hasEstimate && (
                <Text style={styles.estHint}>est. {fmtM(exp.estimatedAmount)}</Text>
              )}
            </View>
          )}
          <Text style={styles.expExpandIcon}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={styles.expBody}>

          {/* 1. Include / skip toggle — always first */}
          <View style={styles.includeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.includeTitle}>
                {isExcluded ? '⛔ Not splitting this expense' : '✅ Splitting this expense'}
              </Text>
              <Text style={styles.includeSub}>
                {isExcluded
                  ? 'Toggle on to include in settlement'
                  : 'Toggle off to skip (keeps item visible)'}
              </Text>
            </View>
            <Switch
              value={!isExcluded}
              onValueChange={onToggleExcluded}
              trackColor={{ false: colors.border, true: colors.greenLight }}
              thumbColor={!isExcluded ? colors.green : '#ccc'}
            />
          </View>

          {!isExcluded && (
            <>
              {/* 2. Actual amount (editable) */}
              <View style={styles.amountSection}>
                <Text style={styles.splitLabel}>
                  {exp.estimatedAmount != null ? 'Actual amount (edit if different from estimate)' : 'Amount'}
                </Text>
                <View style={styles.amountEditRow}>
                  {exp.estimatedAmount != null && (
                    <View style={styles.estPill}>
                      <Text style={styles.estPillText}>Est {fmtM(exp.estimatedAmount)}</Text>
                    </View>
                  )}
                  {exp.estimatedAmount != null && (
                    <Text style={styles.amountArrow}>→</Text>
                  )}
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.amountDollar}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="decimal-pad"
                      onBlur={commitAmount}
                      selectTextOnFocus
                    />
                  </View>
                </View>
              </View>

              {/* 3. Split mode override */}
              <Text style={[styles.splitLabel, { marginTop: 12 }]}>Split mode</Text>
              <View style={styles.overrideRow}>
                {[
                  { key: null,         label: `Auto (${(trip.splitMode || 'individual') === 'family' ? 'Group' : 'Person'})` },
                  { key: 'individual', label: '👤 Person' },
                  { key: 'family',     label: '👨‍👩‍👧 Group' },
                ].map(opt => (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[styles.overrideChip, modeOverride === opt.key && styles.overrideChipActive]}
                    onPress={() => onChangeSplitMode(opt.key)}
                  >
                    <Text style={[styles.overrideChipText, modeOverride === opt.key && styles.overrideChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Lodging-only: honest explainer for the equal-by-group default */}
              {isLodging && !isUneven && (
                <View style={styles.lodgeSplitTip}>
                  <Text style={styles.lodgeSplitTipTitle}>Split equally between groups — adjust if rooms differ</Text>
                  <Text style={styles.lodgeSplitTipBody}>
                    We split this hotel equally because we can&apos;t tell which group took which room. If a family had a bigger or pricier room, set each group&apos;s share.
                  </Text>
                  <TouchableOpacity onPress={switchToCustom} activeOpacity={0.7}>
                    <Text style={styles.lodgeSplitTipCta}>Set custom amounts →</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 4. Distribution — Even or Custom (uneven) */}
              <Text style={[styles.splitLabel, { marginTop: 12 }]}>DISTRIBUTION</Text>
              <View style={[styles.overrideRow, { marginBottom: 12 }]}>
                <TouchableOpacity
                  style={[styles.overrideChip, !isUneven && styles.overrideChipActive]}
                  onPress={() => {
                    setCustomAmounts({});
                    onUpdateCustomShares({}, false);
                  }}
                >
                  <Text style={[styles.overrideChipText, !isUneven && styles.overrideChipTextActive]}>
                    Even
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.overrideChip, isUneven && styles.unevenChipActive]}
                  onPress={() => {
                    // Seed custom amounts from current even split
                    const seeds = {};
                    if (effectiveMode === 'family') {
                      effFams.forEach(f => { seeds[f.id] = parseFloat(spf.toFixed(2)); });
                    } else {
                      effMembers.forEach(m => { seeds[m.id] = parseFloat(spp.toFixed(2)); });
                    }
                    setCustomAmounts(seeds);
                    onUpdateCustomShares(seeds, true);
                  }}
                >
                  <Text style={[styles.overrideChipText, isUneven && styles.unevenChipTextActive]}>
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 5. Who's splitting (even mode) / Custom amounts (uneven mode) */}
              <Text style={[styles.splitLabel, { marginTop: 0 }]}>
                {isUneven ? 'CUSTOM AMOUNTS' : "WHO'S SPLITTING THIS?"}
              </Text>

              {isUneven ? (
                // ── Uneven split — amount inputs per participant ──
                (() => {
                  const participants = effectiveMode === 'family' ? effFams : effMembers;
                  const assigned = participants.reduce((s, p) => s + (parseFloat(customAmounts[p.id]) || 0), 0);
                  const remaining = parseFloat((exp.amount - assigned).toFixed(2));
                  const remainingColor = Math.abs(remaining) < 0.01 ? colors.green : remaining < 0 ? colors.red : '#d97706';

                  return (
                    <View>
                      {/* Remaining indicator */}
                      <View style={styles.remainingRow}>
                        <Text style={styles.remainingLabel}>Total: {fmtM(exp.amount)}</Text>
                        <Text style={[styles.remainingAmt, { color: remainingColor }]}>
                          {Math.abs(remaining) < 0.01
                            ? '✅ Balanced'
                            : remaining > 0
                              ? `${fmtM(remaining)} unassigned`
                              : `${fmtM(Math.abs(remaining))} over by`}
                        </Text>
                      </View>

                      {effectiveMode === 'family' ? (
                        effFams.map(fam => {
                          const isPayer = payerFam?.id === fam.id;
                          return (
                            <View key={fam.id} style={styles.customRow}>
                              <View style={[styles.famDot, { backgroundColor: fam.color }]} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.splitRowName}>{fam.name}</Text>
                                <Text style={styles.splitRowSub}>{fam.members.length} members</Text>
                              </View>
                              {isPayer && <View style={styles.payerBadge}><Text style={styles.payerBadgeText}>paid</Text></View>}
                              <View style={styles.customAmtWrap}>
                                <Text style={styles.customAmtDollar}>$</Text>
                                <TextInput
                                  style={styles.customAmtInput}
                                  value={customAmounts[fam.id] != null ? String(customAmounts[fam.id]) : ''}
                                  onChangeText={v => setCustomAmounts(prev => ({ ...prev, [fam.id]: v }))}
                                  onBlur={() => {
                                    const next = { ...customAmounts, [fam.id]: parseFloat(customAmounts[fam.id]) || 0 };
                                    setCustomAmounts(next);
                                    onUpdateCustomShares(next, true);
                                  }}
                                  keyboardType="decimal-pad"
                                  selectTextOnFocus
                                />
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        trip.families.map(fam => (
                          <View key={fam.id} style={styles.indivFamGroup}>
                            <View style={styles.indivFamHeader}>
                              <View style={[styles.famDot, { backgroundColor: fam.color, width: 7, height: 7 }]} />
                              <Text style={[styles.indivFamName, { color: fam.color }]}>{fam.name}</Text>
                            </View>
                            {fam.members.map(m => {
                              const inExp = effMembers.some(em => em.id === m.id);
                              if (!inExp) return null;
                              return (
                                <View key={m.id} style={styles.customRow}>
                                  <View style={[styles.memberAvatar, { backgroundColor: avatarColor(m.name), width: 22, height: 22, borderRadius: 11 }]}>
                                    <Text style={[styles.memberAvatarText, { fontSize: 9 }]}>{m.name[0]}</Text>
                                  </View>
                                  <Text style={[styles.splitRowName, { flex: 1 }]}>{m.name.split(' ')[0]}</Text>
                                  {exp.paidBy === m.id && <View style={styles.payerBadge}><Text style={styles.payerBadgeText}>paid</Text></View>}
                                  <View style={styles.customAmtWrap}>
                                    <Text style={styles.customAmtDollar}>$</Text>
                                    <TextInput
                                      style={styles.customAmtInput}
                                      value={customAmounts[m.id] != null ? String(customAmounts[m.id]) : ''}
                                      onChangeText={v => setCustomAmounts(prev => ({ ...prev, [m.id]: v }))}
                                      onBlur={() => {
                                        const next = { ...customAmounts, [m.id]: parseFloat(customAmounts[m.id]) || 0 };
                                        setCustomAmounts(next);
                                        onUpdateCustomShares(next, true);
                                      }}
                                      keyboardType="decimal-pad"
                                      selectTextOnFocus
                                    />
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ))
                      )}
                    </View>
                  );
                })()
              ) : effectiveMode === 'family' ? (
                trip.families.map(fam => {
                  const participating = effFams.some(f => f.id === fam.id);
                  const isPayer = payerFam?.id === fam.id;
                  return (
                    <View key={fam.id} style={[styles.splitRow, !participating && { opacity: 0.4 }]}>
                      <Switch
                        value={participating}
                        onValueChange={v => onToggleFamily(fam.id, v)}
                        trackColor={{ false: colors.border, true: fam.color + '88' }}
                        thumbColor={participating ? fam.color : '#ccc'}
                        style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
                      />
                      <View style={[styles.famDot, { backgroundColor: fam.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.splitRowName}>{fam.name}</Text>
                        <Text style={styles.splitRowSub}>{fam.members.length} members</Text>
                      </View>
                      {isPayer && <View style={styles.payerBadge}><Text style={styles.payerBadgeText}>paid</Text></View>}
                      <Text style={[styles.splitRowAmt, { color: participating ? colors.text : colors.muted }]}>
                        {participating ? fmtM(spf) : '—'}
                      </Text>
                    </View>
                  );
                })
              ) : (
                trip.families.map(fam => {
                  const allFamIn = fam.members.every(m => effMembers.some(em => em.id === m.id));
                  return (
                    <View key={fam.id} style={styles.indivFamGroup}>
                      <View style={styles.indivFamHeader}>
                        <View style={[styles.famDot, { backgroundColor: fam.color, width: 7, height: 7 }]} />
                        <Text style={[styles.indivFamName, { color: fam.color }]}>{fam.name}</Text>
                        <TouchableOpacity
                          style={styles.allToggle}
                          onPress={() => fam.members.forEach(m => onToggleMember(m.id, !allFamIn))}
                        >
                          <Text style={[styles.allToggleText, { color: fam.color }]}>
                            {allFamIn ? 'Remove all' : 'Add all'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {fam.members.map(m => {
                        const inExp = effMembers.some(em => em.id === m.id);
                        return (
                          <View key={m.id} style={[styles.splitRow, !inExp && { opacity: 0.4 }]}>
                            <Switch
                              value={inExp}
                              onValueChange={v => onToggleMember(m.id, v)}
                              trackColor={{ false: colors.border, true: fam.color + '88' }}
                              thumbColor={inExp ? fam.color : '#ccc'}
                              style={{ transform: [{ scaleX: 0.78 }, { scaleY: 0.78 }] }}
                            />
                            <View style={[styles.memberAvatar, { backgroundColor: avatarColor(m.name), width: 22, height: 22, borderRadius: 11 }]}>
                              <Text style={[styles.memberAvatarText, { fontSize: 9 }]}>{m.name[0]}</Text>
                            </View>
                            <Text style={[styles.splitRowName, { flex: 1 }]}>{m.name.split(' ')[0]}</Text>
                            {exp.paidBy === m.id && <View style={styles.payerBadge}><Text style={styles.payerBadgeText}>paid</Text></View>}
                            <Text style={[styles.splitRowAmt, { color: inExp ? colors.text : colors.muted }]}>
                              {inExp ? fmtM(spp) : '—'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}

              {/* 5. Who paid */}
              <Text style={[styles.splitLabel, { marginTop: 14 }]}>Who paid?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.payerRow}>
                  {trip.families.map(fam =>
                    fam.members.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.payerChip, exp.paidBy === m.id && { backgroundColor: fam.color, borderColor: fam.color }]}
                        onPress={() => onChangePayer(m.id)}
                      >
                        <View style={[styles.memberAvatar, { backgroundColor: avatarColor(m.name), width: 22, height: 22, borderRadius: 11 }]}>
                          <Text style={[styles.memberAvatarText, { fontSize: 8 }]}>{m.name[0]}</Text>
                        </View>
                        <View>
                          <Text style={[styles.payerChipName, exp.paidBy === m.id && { color: '#fff' }]}>
                            {m.name.split(' ')[0]}
                          </Text>
                          <Text style={[styles.payerChipFam, exp.paidBy === m.id && { color: 'rgba(255,255,255,0.7)' }]}>
                            {fam.name.split(' ')[0]}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </ScrollView>
            </>
          )}

          {/* Delete — always available */}
          <TouchableOpacity style={styles.deleteExpBtn} onPress={onDelete}>
            <Text style={styles.deleteExpBtnText}>🗑 Remove from list</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 120 },

  // Sticky footer
  stickyFooter: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.text,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 6,
  },
  stickyFooterLeft:  { flex: 1 },
  stickyFooterRight: { alignItems: 'flex-end' },
  stickyFooterLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8 },
  stickyFooterTotal: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  stickyFooterShare: { fontSize: 15, fontWeight: '800', color: colors.green },

  // Mode toggle
  modeCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, ...shadow.sm,
  },
  modeCardLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  modeToggle: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 3, marginBottom: 8 },
  modeBtn: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  modeBtnActive: { backgroundColor: colors.primary, elevation: 2 },
  modeBtnText: { ...typography.smallBold, color: colors.muted },
  modeBtnTextActive: { color: '#fff' },
  modeDesc: { ...typography.tiny, color: colors.muted, lineHeight: 16 },

  // Family head tip
  headTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl,
  },
  headTipTitle: { fontSize: 12, fontWeight: '800', color: '#78350f', marginBottom: 4 },
  headTipBody:  { fontSize: 11, color: '#92400e', lineHeight: 16 },
  headTipClose: { fontSize: 14, color: '#b45309', fontWeight: '700', paddingTop: 2 },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  sectionTitle: { ...typography.bodyBold, color: colors.text },
  badge: { backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 2 },
  badgeText: { ...typography.tinyBold, color: colors.muted },
  addExpBtn: { marginLeft: 'auto', borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  addExpBtnText: { ...typography.smallBold, color: colors.primary },
  pushPrompt: { backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xxl, alignItems: 'center', marginBottom: spacing.md },
  pushPromptIcon: { fontSize: 36, marginBottom: 12 },
  pushPromptText: { ...typography.small, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  pushBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.green, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10, marginTop: 12 },
  pushBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  clearRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  clearHint: { ...typography.tiny, color: colors.muted },
  clearText: { ...typography.tinyBold, color: colors.red },

  // Expense card
  expCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden', ...shadow.sm,
  },
  expCardExcluded: { backgroundColor: colors.surface2, borderColor: colors.border, borderStyle: 'dashed' },
  expHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md },
  expIcon: { width: 40, height: 40, backgroundColor: colors.surface2, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  expInfo: { flex: 1 },
  expName: { ...typography.bodyBold, color: colors.text },
  expNameStrike: { textDecorationLine: 'line-through', color: colors.muted },
  expSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  expSub: { ...typography.tiny, color: colors.muted },
  expPayer: { ...typography.tiny, color: colors.muted },
  lodgeNudge: { ...typography.tiny, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  lodgeSplitTip: { backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fde68a', borderRadius: radius.lg, padding: spacing.md, marginTop: 12 },
  lodgeSplitTipTitle: { fontSize: 12, fontWeight: '800', color: '#78350f', marginBottom: 4 },
  lodgeSplitTipBody: { fontSize: 11, color: '#92400e', lineHeight: 16, marginBottom: 6 },
  lodgeSplitTipCta: { fontSize: 12, fontWeight: '800', color: '#b45309' },
  skippedHint: { ...typography.tiny, color: colors.muted, fontStyle: 'italic', marginTop: 2 },
  expRight: { alignItems: 'flex-end', gap: 2 },
  amountCol: { alignItems: 'flex-end' },
  expTotal: { fontSize: 16, fontWeight: '900', color: colors.text },
  estHint: { fontSize: 10, color: colors.muted, textDecorationLine: 'line-through' },
  expExpandIcon: { fontSize: 10, color: colors.muted, marginTop: 2 },
  skippedBadge: { backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  skippedBadgeText: { fontSize: 10, fontWeight: '700', color: colors.muted },

  // Expanded body
  expBody: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 },
  splitLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  // Include/skip toggle
  includeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border,
  },
  includeTitle: { ...typography.smallBold, color: colors.text },
  includeSub: { ...typography.tiny, color: colors.muted, marginTop: 2 },

  // Amount editing
  amountSection: { marginBottom: 4 },
  amountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  estPill: { backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  estPillText: { fontSize: 12, color: colors.muted, textDecorationLine: 'line-through' },
  amountArrow: { fontSize: 16, color: colors.muted },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface, gap: 2 },
  amountDollar: { fontSize: 15, fontWeight: '700', color: colors.primary },
  amountInput: { fontSize: 17, fontWeight: '800', color: colors.primary, minWidth: 60, padding: 0 },

  // Mode override chips
  overrideRow: { flexDirection: 'row', gap: 6 },
  overrideChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  overrideChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  overrideChipText: { ...typography.tiny, fontWeight: '700', color: colors.muted },
  overrideChipTextActive: { color: colors.primary },

  // Split rows
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  famDot: { width: 9, height: 9, borderRadius: 5 },
  splitRowName: { ...typography.smallBold, color: colors.text },
  splitRowSub: { ...typography.tiny, color: colors.muted },
  splitRowAmt: { ...typography.smallBold, width: 52, textAlign: 'right' },
  indivFamGroup: { marginBottom: 4 },
  indivFamHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  indivFamName: { ...typography.tinyBold, flex: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
  allToggle: { paddingHorizontal: 8, paddingVertical: 2 },
  allToggleText: { fontSize: 11, fontWeight: '700' },

  // Uneven / custom split
  unevenChipActive:     { borderColor: '#d97706', backgroundColor: '#fef3c7' },
  unevenChipTextActive: { color: '#d97706', fontWeight: '700' },
  remainingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 7, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  remainingLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  remainingAmt:   { fontSize: 12, fontWeight: '800' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  customAmtWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.surface, gap: 2 },
  customAmtDollar: { fontSize: 13, fontWeight: '700', color: colors.primary },
  customAmtInput:  { fontSize: 15, fontWeight: '700', color: colors.primary, minWidth: 55, padding: 0 },

  // Payer
  payerBadge: { backgroundColor: colors.greenLight, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1 },
  payerBadgeText: { fontSize: 10, fontWeight: '700', color: colors.green },
  payerRow: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  payerChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  payerChipName: { fontSize: 12, fontWeight: '700', color: colors.text },
  payerChipFam: { fontSize: 10, color: colors.muted },
  deleteExpBtn: { marginTop: 14, alignItems: 'center', padding: 8, borderTopWidth: 1, borderTopColor: colors.border },
  deleteExpBtnText: { ...typography.small, color: colors.red },

  // Summary card
  summaryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm },
  summaryHeader: { padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1714' },
  summaryTitle: { ...typography.bodyBold, color: '#fff' },
  summaryHint: { ...typography.tinyBold, color: 'rgba(255,255,255,0.6)' },
  famRow: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  famNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  famName: { ...typography.bodyBold, color: colors.text },
  headBadge: { backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1 },
  headBadgeText: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  famMeta: { ...typography.tiny, color: colors.muted, marginBottom: 4 },
  famTotal: { ...typography.h4, fontWeight: '900' },
  memberShareRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  memberAvatar: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  memberShareName: { ...typography.small, color: colors.muted, flex: 1 },
  memberShareAmt: { ...typography.smallBold, color: colors.text },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surface2, borderTopWidth: 2, borderTopColor: colors.border },
  grandTotalLabel: { ...typography.bodyBold, color: colors.muted },
  grandTotalAmt: { fontSize: 22, fontWeight: '900', color: colors.text },

  // Balances
  balanceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  balanceTitleText: { ...typography.bodyBold, color: colors.ink },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  balanceName: { ...typography.smallBold, color: colors.text },
  balanceFam:  { fontSize: 10, fontWeight: '600' },
  promoteHint: { fontSize: 10, color: colors.primary, fontWeight: '600', marginTop: 1 },
  balanceNet: { ...typography.smallBold },
  settleTitle: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, padding: spacing.md, paddingBottom: spacing.sm },
  settledText: { ...typography.body, color: colors.muted, padding: spacing.lg },
  settleItem: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.md, backgroundColor: colors.surface2, marginHorizontal: spacing.md, borderRadius: radius.sm, marginBottom: 6 },
  settleName:     { ...typography.smallBold, color: colors.text },
  settleNamePaid: { textDecorationLine: 'line-through', color: colors.muted },
  settleFam:      { fontSize: 10, fontWeight: '600' },
  settleArrow:    { ...typography.small, color: colors.muted, paddingHorizontal: 4 },
  settleAmt:      { ...typography.bodyBold, color: colors.green },
  settleItemPaid: { backgroundColor: colors.surface2, borderColor: colors.border },
  settleRightCol: { alignItems: 'flex-end', gap: 4 },
  settleCheck: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  settleCheckDone:  { backgroundColor: colors.green, borderColor: colors.green },
  settleCheckText:  { fontSize: 11, color: '#fff', fontWeight: '900' },
});
