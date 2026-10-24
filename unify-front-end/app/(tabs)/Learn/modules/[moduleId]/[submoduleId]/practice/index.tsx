import { typography } from '@/constants/Typography';
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSanityPractices } from '@/hooks/sanity/useSanityPractices';
import { usePracticeProgress } from '@/hooks/progress/usePracticeProgress';

export default function PracticeEntryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { moduleId, submoduleId } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
  }>();

  const {
    data: practices,
    isLoading,
    error,
  } = useSanityPractices(submoduleId || '');
  const { getPracticeProgressBySubmodule } = usePracticeProgress();

  useEffect(() => {
    if (!moduleId || !submoduleId || isLoading || error) return;
    const sorted = [...(practices || [])].sort(
      (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0)
    );
    if (sorted.length === 0) return;

    let cancelled = false;
    getPracticeProgressBySubmodule(submoduleId).then(progressRows => {
      if (cancelled) return;
      const completedIds = new Set(
        (progressRows || [])
          .filter(r => r.is_completed)
          .map(r => r.sanity_practice_id)
      );
      const firstIncomplete = sorted.find(p => !completedIds.has(p._id));
      const target = firstIncomplete ?? sorted[0];
      router.replace({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/practice/[practiceId]' as any,
        params: { moduleId, submoduleId, practiceId: target._id },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    moduleId,
    submoduleId,
    practices,
    isLoading,
    error,
    getPracticeProgressBySubmodule,
  ]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size='large' color='#10B981' />
          <Text style={styles.loadingText}>
            {t('learn.practice.loadingPractice')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error.message || t('learn.practice.failedToLoad')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const sorted = [...(practices || [])].sort(
    (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0)
  );

  if (sorted.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('learn.practice.noPractice')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator size='large' color='#10B981' />
        <Text style={styles.loadingText}>{t('learn.practice.opening')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: { ...typography.body, marginTop: 12, color: '#6B7280' },
  errorText: { ...typography.body, color: '#EF4444', textAlign: 'center' },
  emptyText: { ...typography.body, color: '#6B7280', textAlign: 'center' },
});
