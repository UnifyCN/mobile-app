import { typography } from '@/constants/Typography';
import LearnRetry from '@/components/learn/LearnRetry';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSanityPractice } from '@/hooks/sanity/useSanityPractices';
import { getPracticeProgress } from '@/services/progress/practiceProgressService';
import { startPractice } from '@/services/progress/practiceProgressService';

export default function PracticeEntryScreen() {
  const { t } = useTranslation();
  const { moduleId, submoduleId, practiceId } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    practiceId: string;
  }>();
  const {
    data: practice,
    isLoading,
    error,
  } = useSanityPractice(practiceId || '');

  useEffect(() => {
    if (!practice || !moduleId || !submoduleId || !practiceId) return;

    let cancelled = false;

    (async () => {
      const progress = await getPracticeProgress(practiceId);
      if (cancelled) return;

      const practiceType = practice.practice_type;
      const isQuiz = practiceType === 'quiz';
      const hasQuestions =
        isQuiz &&
        Array.isArray(practice.questions) &&
        practice.questions.length > 0;
      const hasPages =
        !isQuiz && Array.isArray(practice.pages) && practice.pages.length > 0;

      if (isQuiz && hasQuestions) {
        const total = practice.questions!.length;
        let questionNum = 1;
        if (
          progress &&
          !progress.is_completed &&
          progress.is_in_progress &&
          progress.current_page_number >= 1
        ) {
          questionNum = Math.min(progress.current_page_number, total);
        } else if (!progress) {
          await startPractice(practiceId, submoduleId, moduleId, 'quiz');
        }
        if (!cancelled) {
          router.replace({
            pathname:
              '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/practice/[practiceId]/pages/[questionNum]' as any,
            params: {
              moduleId,
              submoduleId,
              practiceId,
              questionNum: String(questionNum),
            },
          });
        }
      } else if (!isQuiz && hasPages) {
        const total = practice.pages!.length;
        let pageNum = 1;
        if (
          progress &&
          !progress.is_completed &&
          progress.is_in_progress &&
          progress.current_page_number >= 1
        ) {
          pageNum = Math.min(progress.current_page_number, total);
        } else if (!progress) {
          await startPractice(practiceId, submoduleId, moduleId, 'activity');
        }
        if (!cancelled) {
          router.replace({
            pathname:
              '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/practice/[practiceId]/activity/[pageNum]' as any,
            params: {
              moduleId,
              submoduleId,
              practiceId,
              pageNum: String(pageNum),
            },
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [practice, moduleId, submoduleId, practiceId]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size='large' color='#10B981' />
        <Text style={styles.text}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !practice) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          {error?.message || t('learn.practice.practiceNotFound')}
        </Text>
        <LearnRetry />
      </View>
    );
  }

  const hasContent =
    (practice.practice_type === 'quiz' &&
      Array.isArray(practice.questions) &&
      practice.questions.length > 0) ||
    (practice.practice_type === 'activity' &&
      Array.isArray(practice.pages) &&
      practice.pages.length > 0);

  if (!hasContent) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('learn.practice.noContent')}</Text>
        <LearnRetry />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size='large' color='#10B981' />
      <Text style={styles.text}>{t('learn.practice.openingContent')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  text: { ...typography.body, marginTop: 12, color: '#6B7280' },
  error: { ...typography.body, color: '#EF4444', textAlign: 'center' },
});
