import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet from '@/components/common/BottomSheet';
import { DEADLINE_KIND_ICON } from '@/constants/DeadlineKinds';
import type { Deadline } from '@/types/deadlines';
import { REMINDER_OFFSETS_DAYS } from '@/types/deadlines';
import { daysUntil, parseLocalDate } from '@/utils/checklistHorizons';
import type { ReminderPermission } from '@/services/push/deadlineReminders';

interface Props {
  visible: boolean;
  deadline: Deadline | null;
  permission: ReminderPermission;
  onClose: () => void;
  onToggleDone: () => void;
  onEditDate: () => void;
  onDelete: () => void;
}

export const DeadlineSheet: React.FC<Props> = ({
  visible,
  deadline,
  permission,
  onClose,
  onToggleDone,
  onEditDate,
  onDelete,
}) => {
  const { t, i18n } = useTranslation();
  if (!deadline) return null;

  const days = daysUntil(deadline.due_date, new Date());
  const overdue = days < 0 && !deadline.completed;
  const soon = days >= 0 && days <= 7 && !deadline.completed;
  const dateLabel = parseLocalDate(deadline.due_date).toLocaleDateString(
    i18n.language,
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.5}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.pill}>
            <MaterialIcons name={DEADLINE_KIND_ICON[deadline.kind]} size={15} color='#334155' />
            <Text style={styles.pillText}>
              {t(`checklist.deadline.kinds.${deadline.kind}`)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={10}
            accessibilityRole='button'
            accessibilityLabel={t('checklist.deadline.deleteDate')}
          >
            <MaterialIcons name='delete-outline' size={22} color='#64748B' />
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{deadline.title}</Text>

        <View style={styles.big}>
          <Text
            style={[styles.bigNumber, overdue && styles.bigOverdue, soon && styles.bigSoon]}
          >
            {deadline.completed ? '✓' : Math.abs(days)}
          </Text>
          <Text style={styles.bigLabel}>
            {deadline.completed
              ? t('checklist.deadline.done')
              : overdue
                ? t('checklist.deadline.daysOverdueLabel')
                : t('checklist.deadline.daysLeftLabel')}
            {' · '}
            {dateLabel}
          </Text>
        </View>

        <View style={styles.kv}>
          <Text style={styles.k}>{t('checklist.deadline.remindersLabel')}</Text>
          <View style={styles.rem}>
            {REMINDER_OFFSETS_DAYS.map(o => (
              <Text
                key={o}
                style={[styles.remChip, (days < o || deadline.completed) && styles.remOff]}
              >
                {t('checklist.deadline.daysShort', { n: o })}
              </Text>
            ))}
          </View>
        </View>

        {permission === 'denied' && (
          <TouchableOpacity
            style={styles.warn}
            onPress={() => Linking.openSettings()}
            accessibilityRole='button'
          >
            <MaterialIcons name='notifications-off' size={18} color='#7C2D12' />
            <Text style={styles.warnText}>
              {t('checklist.deadline.notificationsOff')}{' '}
              <Text style={styles.warnLink}>{t('checklist.deadline.openSettings')}</Text>
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.kv} onPress={onEditDate} accessibilityRole='button'>
          <Text style={styles.k}>{t('checklist.deadline.dateLabel')}</Text>
          <Text style={styles.link}>{t('checklist.deadline.editDate')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primary, deadline.completed && styles.primaryUndo]}
          onPress={onToggleDone}
          activeOpacity={0.85}
          accessibilityRole='button'
        >
          <MaterialIcons
            name={deadline.completed ? 'replay' : 'check'}
            size={20}
            color={deadline.completed ? '#059669' : '#fff'}
          />
          <Text style={[styles.primaryText, deadline.completed && styles.primaryUndoText]}>
            {deadline.completed
              ? t('checklist.deadline.undoDone')
              : t('checklist.deadline.markDone')}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  title: { fontSize: 22, fontWeight: '700', color: '#000', marginTop: 12, lineHeight: 28 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10, marginBottom: 6 },
  bigNumber: { fontSize: 40, fontWeight: '700', color: '#000', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  bigOverdue: { color: '#FF3B30' },
  bigSoon: { color: '#E03B3B' },
  bigLabel: { fontSize: 15, color: '#6B6B6B', flexShrink: 1 },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  k: { fontSize: 15, color: '#6B6B6B' },
  rem: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 },
  remChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  remOff: { opacity: 0.45, textDecorationLine: 'line-through' },
  link: { fontSize: 15, fontWeight: '600', color: '#F68B26' },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  warnText: { flex: 1, fontSize: 13, color: '#7C2D12', lineHeight: 18 },
  warnLink: { fontWeight: '700', textDecorationLine: 'underline' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2E9E5B',
    marginTop: 12,
  },
  primaryText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  primaryUndo: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D6D5D5' },
  primaryUndoText: { color: '#059669' },
});
