import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSanityLessonQuizzes } from '@/hooks/sanity/useSanityQuizzes';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import { useCallback, useRef } from 'react';

export default function QuizzesPage() {
  const { t } = useTranslation();
  const { moduleId, submoduleId, lessonId } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    lessonId: string;
  }>();

  const { trackScreen, capture } = useAnalytics();
  // Joins the lesson visit (see useLearnEvents).
  const { onLessonScreenFocused } = useLearnEvents();
  useFocusEffect(
    useCallback(() => {
      if (lessonId) onLessonScreenFocused(lessonId);
    }, [lessonId, onLessonScreenFocused])
  );
  const { data: quizzes, isLoading, error } = useSanityLessonQuizzes(lessonId);
  const hasTrackedRef = useRef<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      // Track screen view once per focus
      if (!hasTrackedRef.current) {
        trackScreen('Quizzes List');
        hasTrackedRef.current = true;
      }

      // Reset on blur so returning to this screen will track again
      return () => {
        hasTrackedRef.current = false;
      };
    }, [trackScreen])
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color='#3B82F6' />
          <Text style={styles.loadingText}>
            {t('learn.quiz.loadingQuizzes')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {t('learn.quizzes.errorLoading', { message: error.message })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!quizzes || quizzes.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {t('learn.quiz.noQuizzesAvailable')}
          </Text>
          <Text style={styles.emptyText}>{t('learn.quizzes.empty')}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              {t('learn.quiz.backToLesson')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('learn.quiz.quizzesTitle')}</Text>
          <Text style={styles.subtitle}>{t('learn.quizzes.header')}</Text>
        </View>

        <View style={styles.quizzesList}>
          {quizzes.map((quiz, index) => (
            <TouchableOpacity
              key={quiz._id}
              style={styles.quizCard}
              onPress={() => {
                capture(AnalyticsEvents.QUIZ_CARD_CLICKED, {
                  module_id: moduleId,
                  submodule_id: submoduleId,
                  lesson_id: lessonId,
                  quiz_id: quiz._id,
                  quiz_title: quiz.title,
                });
                router.push({
                  pathname:
                    '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/quizzes/[quizId]' as any,
                  params: {
                    moduleId,
                    submoduleId,
                    lessonId,
                    quizId: quiz._id,
                  },
                });
              }}
            >
              <View style={styles.quizHeader}>
                <Text style={styles.quizNumber}>
                  {t('learn.quiz.quizPrefix', { number: quiz.order_number })}
                </Text>
                <Text style={styles.quizTitle}>{quiz.title}</Text>
              </View>

              {quiz.description && (
                <Text style={styles.quizDescription}>{quiz.description}</Text>
              )}

              <View style={styles.quizFooter}>
                <Text style={styles.startQuiz}>
                  {t('learn.quiz.startQuiz')}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              {t('learn.quiz.backToLesson')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: { ...typography.body, marginTop: 16, color: '#6B7280' },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: { ...typography.body, color: '#DC2626', textAlign: 'center' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  emptyTitle: { ...typography.title, color: '#000', marginBottom: 8 },
  emptyText: {
    ...typography.body,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { ...typography.title, color: '#000', marginBottom: 8 },
  subtitle: { ...typography.body, color: '#6B7280' },
  quizzesList: {
    padding: 20,
    gap: 16,
  },
  quizCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  quizHeader: {
    marginBottom: 12,
  },
  quizNumber: {
    ...typography.secondary,
    color: '#3B82F6',
    marginBottom: 4,
    fontWeight: '600',
  },
  quizTitle: { ...typography.cardTitle, color: '#000' },
  quizDescription: {
    ...typography.secondary,
    color: '#6B7280',
    marginBottom: 16,
  },
  quizFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passingScore: { ...typography.secondary, color: '#6B7280' },
  startQuiz: { ...typography.cardTitle, color: '#3B82F6' },
  footer: {
    padding: 20,
    paddingTop: 0,
  },
  backButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: { ...typography.button, color: '#374151' },
});
