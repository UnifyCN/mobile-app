import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PRIORITY_CONFIG } from '@/constants/ChecklistPriority';
import { DEADLINE_KIND_ICON } from '@/constants/DeadlineKinds';
import type { Priority } from '@/types/checklist';
import { normalizeChecklistPriority } from '@/utils/checklistOrder';
import { parseLocalDate, type HorizonItem as Item } from '@/utils/checklistHorizons';

export const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  'Do now': 'checklist.createItem.priorityDoNow',
  'Do soon': 'checklist.createItem.priorityDoSoon',
  'Explore and connect': 'checklist.createItem.priorityExploreConnect',
  'Explore & connect': 'checklist.createItem.priorityExploreConnect',
  'Optional / later': 'checklist.createItem.priorityOptionalLater',
};

/** "4 days overdue", "Today", "in 5 days" — no plural keys, so every locale renders. */
export function relativeDays(
  days: number,
  t: (k: string, o?: Record<string, unknown>) => string
): string {
  if (days < 0) {
    return -days === 1
      ? t('checklist.deadline.overdueOne')
      : t('checklist.deadline.overdue', { n: -days });
  }
  if (days === 0) return t('checklist.deadline.today');
  return days === 1
    ? t('checklist.deadline.inOne')
    : t('checklist.deadline.inDays', { n: days });
}

interface Props {
  item: Item;
  onPress: () => void;
  onSetDate?: () => void;
}

export const HorizonItemCard: React.FC<Props> = ({ item, onPress, onSetDate }) => {
  const { t, i18n } = useTranslation();
  const isDeadline = item.kind === 'deadline';
  const completed = isDeadline ? item.deadline.completed : item.task.completed;
  const title = isDeadline ? item.deadline.title : item.task.task.task_name;
  const days = item.daysLeft;
  const dueISO = isDeadline ? item.deadline.due_date : item.deadline?.due_date ?? null;

  const priority = !isDeadline ? normalizeChecklistPriority(item.task.task.priority) : null;
  const pc = priority ? PRIORITY_CONFIG[priority] : null;

  const overdue = days !== null && days < 0 && !completed;
  const dueSoon = days !== null && days >= 0 && days <= 7 && !completed;
  const ringColor = completed
    ? '#2E9E5B'
    : overdue
      ? '#FF3B30'
      : isDeadline
        ? '#94A3B8'
        : pc!.color;

  const dateLabel = dueISO
    ? parseLocalDate(dueISO).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
        ...(parseLocalDate(dueISO).getFullYear() !== new Date().getFullYear()
          ? { year: 'numeric' }
          : {}),
      })
    : null;

  const relLabel = days !== null ? relativeDays(days, t) : null;
  const a11y = [title, dateLabel, relLabel].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole='button'
      accessibilityLabel={a11y}
      accessibilityState={{ checked: completed }}
    >
      <View
        style={[
          styles.ring,
          { borderColor: ringColor },
          completed && { backgroundColor: ringColor },
        ]}
      >
        {completed ? (
          <MaterialIcons name='check' size={16} color='#fff' />
        ) : isDeadline ? (
          <MaterialIcons
            name={DEADLINE_KIND_ICON[item.deadline.kind]}
            size={13}
            color={ringColor}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text
          style={[styles.title, completed && styles.titleDone]}
          numberOfLines={3}
        >
          {title}
        </Text>
        <View style={styles.meta}>
          {dateLabel && <Text style={styles.date}>{dateLabel}</Text>}
          {relLabel && (
            <Text
              style={[
                styles.rel,
                overdue && styles.relOverdue,
                dueSoon && styles.relSoon,
              ]}
            >
              {relLabel}
            </Text>
          )}
          {isDeadline ? (
            <View style={styles.chipDoc}>
              <Text style={styles.chipDocText}>
                {t(`checklist.deadline.kinds.${item.deadline.kind}`)}
              </Text>
            </View>
          ) : (
            <View style={[styles.chip, { backgroundColor: pc!.backgroundColor }]}>
              <Text style={[styles.chipText, { color: pc!.color }]}>
                {t(PRIORITY_LABEL_KEY[priority!])}
              </Text>
            </View>
          )}
          {!isDeadline && !dueISO && !completed && onSetDate && (
            <Pressable
              onPress={onSetDate}
              hitSlop={8}
              accessibilityRole='button'
              accessibilityLabel={t('checklist.deadline.setDate')}
            >
              <Text style={styles.setDate}>{t('checklist.deadline.setDate')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  ring: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: '#fff',
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6D5D5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 52,
  },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '500', color: '#0F172A' },
  titleDone: { color: '#94A3B8', textDecorationLine: 'line-through' },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  date: { fontSize: 13, fontWeight: '600', color: '#475569', fontVariant: ['tabular-nums'] },
  rel: { fontSize: 13, color: '#94A3B8' },
  relOverdue: { color: '#FF3B30', fontWeight: '600' },
  relSoon: { color: '#E03B3B', fontWeight: '600' },
  chip: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipDoc: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#EEF2F7',
  },
  chipDocText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  setDate: { fontSize: 12, fontWeight: '600', color: '#F68B26', paddingVertical: 2 },
});
