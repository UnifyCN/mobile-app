import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '@/components/ThemedText';
import type { Horizon } from '@/utils/checklistHorizons';
import { MONTH_DAYS, WEEK_DAYS } from '@/utils/checklistHorizons';

interface Props {
  horizon: Horizon;
  completedCount: number;
  totalCount: number;
  today: Date;
}

export const HORIZON_TITLE_KEY: Record<Horizon, string> = {
  week: 'checklist.horizons.thisWeek',
  month: 'checklist.horizons.next30Days',
  later: 'checklist.horizons.later',
};

export const HorizonSectionHeader: React.FC<Props> = ({
  horizon,
  completedCount,
  totalCount,
  today,
}) => {
  const { t, i18n } = useTranslation();
  const fmt = (d: Date) =>
    d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
  const addDays = (n: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);

  let range: string | null = null;
  if (horizon === 'week') range = `${fmt(today)} – ${fmt(addDays(WEEK_DAYS))}`;
  else if (horizon === 'month')
    range = t('checklist.horizons.until', { date: fmt(addDays(MONTH_DAYS)) });

  return (
    <View style={styles.row} accessibilityRole='header'>
      <ThemedText style={styles.title}>{t(HORIZON_TITLE_KEY[horizon])}</ThemedText>
      {range && <ThemedText style={styles.range}>{range}</ThemedText>}
      <ThemedText style={styles.count}>
        {totalCount > 0 ? `${completedCount}/${totalCount}` : ''}
      </ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 18,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#000' },
  range: { fontSize: 13, color: '#6B6B6B', flexShrink: 1 },
  count: {
    marginLeft: 'auto',
    fontSize: 13,
    color: '#94A3B8',
    fontVariant: ['tabular-nums'],
  },
});
