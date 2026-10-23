import LearnRetry from '@/components/learn/LearnRetry';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSanityLesson } from '@/hooks/sanity/useSanityLessons';
import LessonPageSkeletonLoader from '@/components/learn/lesson-page-skeleton-loader/LessonPageSkeletonLoader';

export default function LessonIndex() {
  const { t } = useTranslation();
  const router = useRouter();
  const { moduleId, submoduleId, lessonId } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    lessonId: string;
  }>();

  const { data: lesson, isLoading } = useSanityLesson(lessonId || '');

  useEffect(() => {
    if (lesson && lesson.pages && lesson.pages.length > 0) {
      // Redirect to first page
      router.replace({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]' as any,
        params: { moduleId, submoduleId, lessonId, pageNum: '1' },
      });
    }
  }, [lesson, moduleId, submoduleId, lessonId, router]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <LessonPageSkeletonLoader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loading}>
        {lesson?.pages?.length ? (
          <Text>{t('learn.lesson.redirecting')}</Text>
        ) : (
          <>
            <Text>{t('learn.lesson.errorLoadingPage')}</Text>
            <LearnRetry />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
