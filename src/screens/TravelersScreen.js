import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import useStore from '../store';
import AddTravelerModal from '../modals/AddTravelerModal';
import AddFamilyModal from '../modals/AddFamilyModal';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { avatarColor } from '../utils/helpers';

export default function TravelersScreen({ trip }) {
  const [showAddTraveler, setShowAddTraveler] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Travelers & Families</Text>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowAddFamily(true)}>
              <Text style={styles.outlineBtnText}>+ Family</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowAddTraveler(true)}>
              <Text style={styles.outlineBtnText}>+ Traveler</Text>
            </TouchableOpacity>
          </View>
        </View>

        {trip.families.map(fam => (
          <View key={fam.id} style={styles.familyGroup}>
            <View style={[styles.familyHeader, { borderLeftColor: fam.color, borderLeftWidth: 3 }]}>
              <Text style={[styles.familyName, { color: fam.color }]}>👨‍👩‍👧 {fam.name}</Text>
              <Text style={styles.memberCount}>{fam.members.length} traveler{fam.members.length !== 1 ? 's' : ''}</Text>
            </View>

            {fam.members.map(member => (
              <View key={member.id} style={styles.memberRow}>
                <View style={[styles.avatar, { backgroundColor: avatarColor(member.name) }]}>
                  <Text style={styles.avatarText}>{member.name[0]}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberMeta}>Age {member.age}</Text>
                </View>
                {member.needs.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.needs}>
                      {member.needs.map(need => (
                        <View key={need} style={styles.needTag}>
                          <Text style={styles.needText}>{need}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            ))}
          </View>
        ))}

        {trip.families.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👨‍👩‍👧</Text>
            <Text style={styles.emptyTitle}>No families yet</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddFamily(true)}>
              <Text style={styles.emptyBtnText}>+ Add a Family</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <AddTravelerModal visible={showAddTraveler} trip={trip} onClose={() => setShowAddTraveler(false)} />
      <AddFamilyModal visible={showAddFamily} trip={trip} onClose={() => setShowAddFamily(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.h3, color: colors.text },
  headerBtns: { flexDirection: 'row', gap: 8 },
  outlineBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  outlineBtnText: { ...typography.smallBold, color: colors.primary },
  familyGroup: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.lg, overflow: 'hidden', ...shadow.sm },
  familyHeader: { padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border },
  familyName: { ...typography.bodyBold },
  memberCount: { ...typography.small, color: colors.muted },
  memberRow: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { ...typography.bodyBold, color: colors.text },
  memberMeta: { ...typography.small, color: colors.muted },
  needs: { flexDirection: 'row', gap: 6 },
  needTag: { backgroundColor: colors.greenLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  needText: { ...typography.tinyBold, color: colors.green },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h4, color: colors.muted, marginBottom: 16 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
});
