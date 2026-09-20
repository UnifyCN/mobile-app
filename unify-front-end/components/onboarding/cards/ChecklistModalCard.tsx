import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

interface ChecklistModalCardProps {
  scale?: number;
}

export default function ChecklistModalCard({
  scale = 1,
}: ChecklistModalCardProps) {
  const { t } = useTranslation();
  const s = scale;

  return (
    <View
      style={[
        styles.container,
        {
          width: 236 * s,
          borderRadius: 25 * s,
          paddingHorizontal: 19 * s,
          paddingTop: 30 * s,
          paddingBottom: 20 * s,
        },
      ]}
    >
      {/* Icon */}
      <View
        style={[
          styles.icon,
          {
            width: 29 * s,
            height: 29 * s,
            borderRadius: 6 * s,
            marginBottom: 8 * s,
          },
        ]}
      >
        <Ionicons name='clipboard-outline' size={18 * s} color='#E03B3B' />
      </View>

      {/* Title */}
      <Text style={[styles.title, { fontSize: 14.4 * s, marginBottom: 6 * s }]}>
        {t('preLogin.checklist.modal.title')}
      </Text>

      {/* Description */}
      <Text
        style={[
          styles.description,
          { fontSize: 9.6 * s, lineHeight: 13 * s, marginBottom: 14 * s },
        ]}
      >
        {t('preLogin.checklist.modal.description')}
      </Text>

      {/* Learn how button */}
      <View
        style={[
          styles.learnButton,
          {
            borderRadius: 7 * s,
            paddingVertical: 6 * s,
            paddingHorizontal: 24 * s,
            gap: 7 * s,
            marginBottom: 8 * s,
          },
        ]}
      >
        <Text style={[styles.learnButtonText, { fontSize: 9.6 * s }]}>
          {t('checklist.learnHow')}
        </Text>
        <Ionicons name='arrow-forward' size={14 * s} color='#fff' />
      </View>

      {/* Mark as complete button */}
      <View
        style={[
          styles.completeButton,
          {
            borderRadius: 7 * s,
            paddingVertical: 6 * s,
            paddingHorizontal: 24 * s,
            gap: 7 * s,
          },
        ]}
      >
        <Text style={[styles.completeButtonText, { fontSize: 9.6 * s }]}>
          {t('checklist.markAsComplete')}
        </Text>
        <Ionicons name='checkmark' size={14 * s} color='#4E7E4C' />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DBDBDB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  icon: {
    backgroundColor: '#FBCFCF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  title: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#000',
  },
  description: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#000',
  },
  learnButton: {
    backgroundColor: '#E03B3B',
    borderWidth: 0.6,
    borderColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  learnButtonText: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#fff',
  },
  completeButton: {
    backgroundColor: '#E2F6E2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  completeButtonText: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#4E7E4C',
  },
});
