import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';
import { Group } from '@/types/groups';

type DestinationType = '4u' | 'group';

interface DestinationToggleProps {
  destination: DestinationType;
  selectedGroup: Group | null;
  onDestinationChange: (destination: DestinationType) => void;
  onClearGroup: () => void;
}

export default function DestinationToggle({
  destination,
  selectedGroup,
  onDestinationChange,
  onClearGroup,
}: DestinationToggleProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.togglePill,
            destination === '4u' && styles.togglePillActive,
          ]}
          onPress={() => onDestinationChange('4u')}
        >
          <Text
            style={[
              styles.toggleText,
              destination === '4u' && styles.toggleTextActive,
            ]}
          >
            {t('posts.forYou')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.togglePill,
            destination === 'group' && styles.togglePillActive,
          ]}
          onPress={() => onDestinationChange('group')}
        >
          <Text
            style={[
              styles.toggleText,
              destination === 'group' && styles.toggleTextActive,
            ]}
          >
            {t('posts.group')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.indicatorContainer}>
        {destination === '4u' ? (
          <Text style={styles.indicatorText}>{t('posts.postingToForYou')}</Text>
        ) : selectedGroup ? (
          <View style={styles.groupIndicator}>
            <Text style={styles.groupIndicatorText}>
              {t('posts.postingTo', { name: selectedGroup.name })}
            </Text>
            <TouchableOpacity onPress={onClearGroup} style={styles.clearButton}>
              <Feather name='x' size={16} color={Theme.textAlternateGray} />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.indicatorText}>{t('posts.selectGroup')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  togglePill: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.borderInfoText,
    backgroundColor: 'transparent',
  },
  togglePillActive: {
    backgroundColor: Theme.primaryGatherRed,
    borderColor: Theme.primaryGatherRed,
  },
  toggleText: { ...typography.cardTitle, color: Theme.textAlternateGray },
  toggleTextActive: {
    color: '#fff',
  },
  indicatorContainer: {
    marginTop: 4,
    minHeight: 20,
  },
  indicatorText: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    fontStyle: 'italic',
  },
  groupIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupIndicatorText: {
    ...typography.secondary,
    color: Theme.black,
    fontWeight: '500',
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: { ...typography.button, color: Theme.textAlternateGray },
});
