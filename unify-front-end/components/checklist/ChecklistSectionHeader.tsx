import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '@/components/ThemedText';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Priority } from '@/types/checklist';
import { PRIORITY_CONFIG } from '@/constants/ChecklistPriority';

interface ChecklistSectionHeaderProps {
  priority: Priority;
  completedCount: number;
  totalCount: number;
}

export const ChecklistSectionHeader: React.FC<ChecklistSectionHeaderProps> = ({
  priority,
  completedCount,
  totalCount,
}) => {
  const { t } = useTranslation();
  const config = PRIORITY_CONFIG[priority];

  return (
    <View style={styles.container}>
      <View
        style={[styles.iconContainer, { backgroundColor: config.backgroundColor }]}
      >
        <MaterialIcons name={config.icon} size={32} color={config.color} />
      </View>
      <View style={styles.text}>
        <ThemedText style={styles.priority}>{t(config.labelKey)}</ThemedText>
        <ThemedText style={styles.count}>
          {t('checklist.completeCount', {
            completed: completedCount,
            total: totalCount,
          })}
        </ThemedText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  text: {
    flex: 1,
  },
  priority: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  count: {
    fontSize: 14,
    color: '#000',
    marginTop: 2,
  },
});
