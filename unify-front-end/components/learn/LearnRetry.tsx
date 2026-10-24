import { typography } from '@/constants/Typography';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

/** Retry active content queries, including queries with a cached error. */
export default function LearnRetry() {
  const queries = useQueryClient();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole='button'
      onPress={() => {
        void queries.refetchQueries({ type: 'active' });
      }}
      style={{ minHeight: 44, padding: 12, justifyContent: 'center' }}
    >
      <Text style={{ ...typography.button, color: '#191919' }}>
        {t('common.retry')}
      </Text>
    </Pressable>
  );
}
