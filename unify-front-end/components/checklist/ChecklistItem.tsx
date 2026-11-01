import { typography } from '@/constants/Typography';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/ThemedText';
import SpotlightRow from '@/components/partners/SpotlightRow';
import { UserTaskWithDetails } from '@/types/checklist';

interface ChecklistItemProps {
  task: UserTaskWithDetails;
  onPress?: () => void;
  /** Adds the spotlight partner's help row under the title. */
  showPartnerHelp?: boolean;
  /**
   * Saved progress from the shared task record (mobile-app#361). Only In progress
   * and Waiting get a label: the row already shows completion.
   */
  savedProgress?: { state: string; waitingReason: string | null } | null;
  testID?: string;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  task,
  onPress,
  showPartnerHelp = false,
  savedProgress = null,
  testID,
}) => {
  const { t } = useTranslation();
  const isCompleted = task.completed;
  const taskName = task.task.task_name?.trim() ?? '';
  const progressLabel =
    !isCompleted &&
    (savedProgress?.state === 'in_progress' ||
      savedProgress?.state === 'waiting')
      ? t(`taskActions.state.${savedProgress.state}`)
      : null;

  const title = (
    <>
      <ThemedText
        style={[styles.taskName, isCompleted && styles.taskNameCompleted]}
        numberOfLines={2}
        ellipsizeMode='tail'
      >
        {taskName}
      </ThemedText>
      {progressLabel ? (
        <View style={styles.progressRow}>
          <Text style={styles.progressChip}>{progressLabel}</Text>
          {savedProgress?.state === 'waiting' && savedProgress.waitingReason ? (
            <Text style={styles.progressReason} numberOfLines={2}>
              {t('taskActions.waitingFor', {
                reason: savedProgress.waitingReason,
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (!showPartnerHelp) {
    return (
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.7}
        testID={testID}
      >
        {title}
      </TouchableOpacity>
    );
  }

  // The help row is a sibling of the title's touchable, not a child, so its
  // tap never also opens the task sheet.
  return (
    <View style={styles.container} testID={testID}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {title}
      </TouchableOpacity>
      <SpotlightRow variant='inline' source='checklist_link' />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6D5D5',
    minHeight: 52,
    justifyContent: 'center',
  },
  taskName: {
    ...typography.label,
    fontSize: 15,
    lineHeight: 20,

    color: '#0F172A',
  },
  taskNameCompleted: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  progressChip: {
    ...typography.caption,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#FFF4E8',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  progressReason: {
    ...typography.caption,
    color: '#64748B',
    flexShrink: 1,
  },
});
