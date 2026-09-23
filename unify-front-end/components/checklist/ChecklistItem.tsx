import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/ThemedText';
import SpotlightRow from '@/components/partners/SpotlightRow';
import { UserTaskWithDetails } from '@/types/checklist';

interface ChecklistItemProps {
  task: UserTaskWithDetails;
  onPress?: () => void;
  /** Adds the spotlight partner's help row under the title. */
  showPartnerHelp?: boolean;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  task,
  onPress,
  showPartnerHelp = false,
}) => {
  const isCompleted = task.completed;
  const taskName = task.task.task_name?.trim() ?? '';

  const title = (
    <ThemedText
      style={[styles.taskName, isCompleted && styles.taskNameCompleted]}
      numberOfLines={2}
      ellipsizeMode='tail'
    >
      {taskName}
    </ThemedText>
  );

  if (!showPartnerHelp) {
    return (
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {title}
      </TouchableOpacity>
    );
  }

  // The help row is a sibling of the title's touchable, not a child, so its
  // tap never also opens the task sheet.
  return (
    <View style={styles.container}>
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
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    color: '#0F172A',
  },
  taskNameCompleted: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
});
