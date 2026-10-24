import { typography } from '@/constants/Typography';
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import type { RedeemGroup } from '@/services/referrals/redeemReferral';

export interface GroupCarryoverListProps {
  inviterName: string;
  groups: RedeemGroup[];
  selected: Set<number>;
  onToggle: (groupId: number) => void;
}

/**
 * Welcome-screen list of the inviter's groups. Each row is a checkbox + name +
 * member count. Render NOTHING when groups is empty (the parent screen hides the
 * whole "join groups" CTA in that case).
 */
export function GroupCarryoverList({
  inviterName,
  groups,
  selected,
  onToggle,
}: GroupCarryoverListProps) {
  const { t } = useTranslation();
  if (groups.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {t('referrals.isInGroups', { name: inviterName })}
      </Text>
      {groups.map(g => {
        const isSelected = selected.has(g.id);
        return (
          <TouchableOpacity
            key={g.id}
            style={styles.row}
            onPress={() => onToggle(g.id)}
            activeOpacity={0.7}
            accessibilityRole='checkbox'
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${g.name}${
              g.member_count != null
                ? `, ${t('common.memberCount', { count: g.member_count })}`
                : ''
            }`}
          >
            <View
              style={[styles.checkbox, isSelected && styles.checkboxChecked]}
            >
              {isSelected ? (
                <Feather name='check' size={16} color={Theme.white} />
              ) : null}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowName} numberOfLines={1}>
                {g.name}
              </Text>
              {g.member_count != null ? (
                <Text style={styles.rowMembers}>
                  {t('common.memberCount', { count: g.member_count })}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Helper to drive selected/unselected state from the parent. */
export function useGroupSelection(initial: number[] = []) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial));
  const toggle = useMemo(
    () => (id: number) => {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    []
  );
  return { selected, toggle, setSelected };
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 8,
  },
  heading: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Theme.surfaceEventCard,
    marginBottom: 8,
    minHeight: 56,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Theme.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: Theme.white,
  },
  checkboxChecked: {
    backgroundColor: Theme.primaryGatherRed,
    borderColor: Theme.primaryGatherRed,
  },
  rowText: {
    flex: 1,
  },
  rowName: { ...typography.cardTitle, color: Theme.black },
  rowMembers: {
    ...typography.caption,
    color: Theme.textPostTime,
    marginTop: 2,
  },
});
