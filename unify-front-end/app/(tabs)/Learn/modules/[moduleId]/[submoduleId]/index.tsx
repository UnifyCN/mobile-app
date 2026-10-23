import LearnRetry from '@/components/learn/LearnRetry';
import TabHeader from '@/components/home/HomeHeader';
import { categorySymbol } from '@/components/learn/CategorySymbol';
import {
  learnStyles as ui,
  LearnBack,
  LearnProgress,
} from '@/components/learn/LearnPrimitives';
import { useLessonStatuses } from '@/hooks/progress/useLessonStatuses';
import { lessonResumeHref } from '@/utils/lessonResume';
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSanitySubmoduleWithLessons } from '@/hooks/sanity/useSanitySubmodules';
import { useSanityModuleWithSubmodules } from '@/hooks/sanity/useSanityModules';
import { Feather } from '@expo/vector-icons';
import { cachedProgressService } from '@/services/progress/cachedProgressService';
import { progressClient } from '@/services/progress/progressClient';
import { usePracticeProgress } from '@/hooks/progress/usePracticeProgress';
import { useTaskProgress } from '@/hooks/progress/useTaskProgress';
import { useSanityPractices } from '@/hooks/sanity/useSanityPractices';
import { useSanityTasks } from '@/hooks/sanity/useSanityTasks';
import { getLearnHref } from '@/utils/learnHref';
import {
  getCompletedSectionId,
  getNextIncompleteSectionId,
  LearnSectionId,
} from '@/utils/learnCompletionNavigation';
import { useFocusEffect } from '@react-navigation/native';

const SUBJECT_COLOR = '#10B981'; // green for Learn (active)

type SectionUIState = 'completed' | 'active' | 'unlocked' | 'locked';

interface SubmoduleSectionViewModel {
  id: LearnSectionId;
  title: string;
  description: string;
  iconName: keyof typeof Feather.glyphMap;
  progressPercent: number;
  uiState: SectionUIState;
  onPress: () => void;
}

export default function SubmoduleIndex() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    moduleId,
    submoduleId,
    justCompletedLearn,
    justCompletedTasks,
    justCompletedPractice,
  } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    justCompletedLearn?: string;
    justCompletedTasks?: string;
    justCompletedPractice?: string;
  }>();

  const lessonStatus = useLessonStatuses(submoduleId || '');

  const completedSectionId = getCompletedSectionId({
    justCompletedLearn,
    justCompletedTasks,
    justCompletedPractice,
  });
  const isCompletionTransition = completedSectionId !== null;

  const [learnProgressPercent, setLearnProgressPercent] = useState(0);
  const [practiceProgressPercent, setPracticeProgressPercent] = useState(0);
  const [taskProgressPercent, setTaskProgressPercent] = useState(0);
  const [isLearnProgressLoading, setIsLearnProgressLoading] = useState(true);
  const [isPracticeProgressLoading, setIsPracticeProgressLoading] =
    useState(true);
  const [isTaskProgressLoading, setIsTaskProgressLoading] = useState(true);
  const [hasLearnProgressLoadError, setHasLearnProgressLoadError] =
    useState(false);
  const [hasPracticeProgressLoadError, setHasPracticeProgressLoadError] =
    useState(false);
  const [hasTaskProgressLoadError, setHasTaskProgressLoadError] =
    useState(false);
  const [isResolvingLearnHref, setIsResolvingLearnHref] = useState(false);

  const {
    data: submoduleData,
    isLoading,
    error,
  } = useSanitySubmoduleWithLessons(submoduleId || '');
  const { data: moduleData, isLoading: isModuleLoading } =
    useSanityModuleWithSubmodules(moduleId || '');
  const {
    data: practices,
    isLoading: isPracticesLoading,
    isError: isPracticesError,
  } = useSanityPractices(submoduleId || '');
  const {
    data: tasks,
    isLoading: isTasksLoading,
    isError: isTasksError,
  } = useSanityTasks(submoduleId || '');
  const { getPracticeProgressBySubmodule } = usePracticeProgress();
  const { getTaskProgressBySubmodule } = useTaskProgress();

  const subjectColor = moduleData?.colorTheme?.hex || SUBJECT_COLOR;

  useFocusEffect(
    useCallback(() => {
      if (!moduleId || !submoduleId) return;
      let cancelled = false;
      setIsLearnProgressLoading(true);
      setHasLearnProgressLoadError(false);
      // Always force-refresh so the progress bar reflects page-level saves
      cachedProgressService
        .refreshProgress()
        .then(() =>
          cachedProgressService.getSubmoduleProgress(moduleId, submoduleId)
        )
        .then(progress => {
          if (!cancelled && progress?.progress_percent != null) {
            const p = Number(progress.progress_percent);
            setLearnProgressPercent(
              Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0
            );
          }
        })
        .catch(() => {
          if (!cancelled) setHasLearnProgressLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setIsLearnProgressLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [moduleId, submoduleId])
  );

  useFocusEffect(
    useCallback(() => {
      if (!submoduleId) return;
      let cancelled = false;
      setIsPracticeProgressLoading(true);
      setHasPracticeProgressLoadError(false);
      const total = practices?.length ?? 0;
      if (total === 0) {
        setPracticeProgressPercent(0);
        setIsPracticeProgressLoading(false);
        return undefined;
      }
      getPracticeProgressBySubmodule(submoduleId, isCompletionTransition)
        .then(rows => {
          if (cancelled) return;
          const completed = (rows || []).filter(r => r.is_completed).length;
          const p = total > 0 ? Math.round((completed / total) * 100) : 0;
          setPracticeProgressPercent(Math.min(100, Math.max(0, p)));
        })
        .catch(() => {
          if (!cancelled) setHasPracticeProgressLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setIsPracticeProgressLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [
      submoduleId,
      practices?.length,
      getPracticeProgressBySubmodule,
      isCompletionTransition,
    ])
  );

  useFocusEffect(
    useCallback(() => {
      if (!submoduleId) return;
      let cancelled = false;
      setIsTaskProgressLoading(true);
      setHasTaskProgressLoadError(false);
      const total = tasks?.length ?? 0;
      if (total === 0) {
        setTaskProgressPercent(0);
        setIsTaskProgressLoading(false);
        return undefined;
      }
      getTaskProgressBySubmodule(submoduleId, isCompletionTransition)
        .then(rows => {
          if (cancelled) return;
          const completed = (rows || []).filter(r => r.is_completed).length;
          const p = total > 0 ? Math.round((completed / total) * 100) : 0;
          setTaskProgressPercent(Math.min(100, Math.max(0, p)));
        })
        .catch(() => {
          if (!cancelled) setHasTaskProgressLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setIsTaskProgressLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [
      submoduleId,
      tasks?.length,
      getTaskProgressBySubmodule,
      isCompletionTransition,
    ])
  );

  const handleLearnPress = async () => {
    if (!moduleId || !submoduleId || !submoduleData) return;
    setIsResolvingLearnHref(true);

    const base = `/(tabs)/Learn/modules/${moduleId}/${submoduleId}`;

    // When reviewing a completed Learn section, always restart from the intro
    // (or the first lesson page if there are no intro pages).
    if (learnProgressPercent >= 100) {
      const hasIntro =
        Array.isArray(submoduleData.intro_pages) &&
        submoduleData.intro_pages.length > 0;
      const firstLessonId = submoduleData.lessons?.[0]?._id;
      const href = hasIntro
        ? `${base}/intro/1`
        : firstLessonId
          ? `${base}/lessons/${firstLessonId}/pages/1`
          : null;
      setIsResolvingLearnHref(false);
      if (href) router.push(href as any);
      return;
    }

    try {
      let user = null;
      try {
        const userResult = await progressClient.auth.getUser();
        user = userResult?.data?.user ?? null;
      } catch {
        user = null;
      }

      let lessonProgresses: any[] | null = null;
      if (user) {
        try {
          const progressResult = await progressClient
            .from('user_lesson_progress')
            .select(
              'sanity_lesson_id,is_completed,is_in_progress,current_page_type,current_page_number,current_quiz_id,current_question_number'
            )
            .eq('user_id', user.id)
            .eq('sanity_submodule_id', submoduleId);
          lessonProgresses = progressResult?.data ?? null;
        } catch {
          lessonProgresses = null;
        }
      }

      const href = getLearnHref(
        moduleId,
        submoduleId,
        submoduleData,
        lessonProgresses
      );
      if (href) {
        router.push(href as any);
      }
    } finally {
      setIsResolvingLearnHref(false);
    }
  };

  const handleTasksPress = () => {
    if (!moduleId || !submoduleId) return;
    router.push({
      pathname: '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/tasks' as any,
      params: { moduleId, submoduleId },
    });
  };

  const handlePracticePress = () => {
    if (!moduleId || !submoduleId) return;
    router.push({
      pathname:
        '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/practice' as any,
      params: { moduleId, submoduleId },
    });
  };

  const hasTasks = (tasks?.length ?? 0) > 0;
  const hasPractice = (practices?.length ?? 0) > 0;

  const sections: SubmoduleSectionViewModel[] = [
    {
      id: 'learn',
      title: t('learn.submodule.learnTitle'),
      description: t('learn.submodule.learnDescription'),
      iconName: 'book-open',
      progressPercent: learnProgressPercent,
      uiState:
        learnProgressPercent >= 100
          ? 'completed'
          : learnProgressPercent > 0
            ? 'active'
            : 'unlocked',
      onPress: handleLearnPress,
    },
    ...(hasTasks
      ? [
          {
            id: 'tasks',
            title: t('learn.submodule.tasksTitle'),
            description: t('learn.submodule.tasksDescription'),
            iconName: 'check-square',
            progressPercent: taskProgressPercent,
            uiState: (taskProgressPercent >= 100
              ? 'completed'
              : taskProgressPercent > 0
                ? 'active'
                : 'unlocked') as SectionUIState,
            onPress: handleTasksPress,
          } as SubmoduleSectionViewModel,
        ]
      : []),
    ...(hasPractice
      ? [
          {
            id: 'practice',
            title: t('learn.submodule.practiceTitle'),
            description: t('learn.submodule.practiceDescription'),
            iconName: 'target',
            progressPercent: practiceProgressPercent,
            uiState:
              practiceProgressPercent >= 100
                ? 'completed'
                : practiceProgressPercent > 0
                  ? 'active'
                  : 'unlocked',
            onPress: handlePracticePress,
          } as SubmoduleSectionViewModel,
        ]
      : []),
  ];

  const requestedNextSectionId = getNextIncompleteSectionId(
    sections,
    completedSectionId
  );

  useEffect(() => {
    if (!isCompletionTransition || !moduleId) return;
    if (
      isTasksLoading ||
      isPracticesLoading ||
      isModuleLoading ||
      isLearnProgressLoading ||
      isPracticeProgressLoading ||
      isTaskProgressLoading
    )
      return;
    if (
      isTasksError ||
      isPracticesError ||
      hasLearnProgressLoadError ||
      hasPracticeProgressLoadError ||
      hasTaskProgressLoadError ||
      tasks === undefined ||
      practices === undefined
    ) {
      router.replace({
        pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
        params: { moduleId },
      });
      return;
    }

    if (!moduleData?.submodules) {
      router.replace({
        pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
        params: { moduleId },
      });
      return;
    }

    const hasNextSectionContent = requestedNextSectionId !== null;
    if (hasNextSectionContent) return;

    const currentSubmoduleIndex = moduleData.submodules.findIndex(
      submodule => submodule._id === submoduleId
    );
    if (currentSubmoduleIndex === -1) {
      router.replace({
        pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
        params: { moduleId },
      });
      return;
    }

    const nextSubmoduleId =
      moduleData.submodules[currentSubmoduleIndex + 1]?._id;

    if (nextSubmoduleId) {
      router.replace({
        pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
        params: { moduleId, highlightSubmoduleId: nextSubmoduleId },
      });
      return;
    }

    router.replace('/(tabs)/Learn');
  }, [
    isModuleLoading,
    isLearnProgressLoading,
    isPracticeProgressLoading,
    isPracticesError,
    isPracticesLoading,
    isTaskProgressLoading,
    isTasksError,
    isTasksLoading,
    isCompletionTransition,
    hasLearnProgressLoadError,
    hasPracticeProgressLoadError,
    hasTaskProgressLoadError,
    completedSectionId,
    moduleData?.submodules,
    moduleId,
    practices,
    requestedNextSectionId,
    router,
    submoduleId,
    tasks,
  ]);

  if (
    isLoading ||
    (isCompletionTransition &&
      (isTasksLoading ||
        isPracticesLoading ||
        isModuleLoading ||
        isLearnProgressLoading ||
        isPracticeProgressLoading ||
        isTaskProgressLoading ||
        requestedNextSectionId === null))
  ) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color={subjectColor} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !submoduleData) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {error?.message || t('learn.submodule.unableToLoad')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColor = categorySymbol(moduleId, moduleData?.icon).foreground;
  const courseLessons = submoduleData.lessons ?? [];
  const completedLessonCount = courseLessons.filter(lesson =>
    lessonStatus.rows.some(
      row => row.sanity_lesson_id === lesson._id && row.is_completed
    )
  ).length;
  const lessonCompletionPercent = courseLessons.length
    ? (completedLessonCount / courseLessons.length) * 100
    : 0;
  const nextLessonId = courseLessons.find(
    lesson =>
      !lessonStatus.rows.find(row => row.sanity_lesson_id === lesson._id)
        ?.is_completed
  )?._id;
  return (
    <View style={ui.screen}>
      <TabHeader variant='minimal' />
      <ScrollView
        contentContainerStyle={ui.content}
        showsVerticalScrollIndicator={false}
      >
        <LearnBack
          title={moduleData?.title ?? t('learn.home.courses')}
          onPress={() =>
            router.replace({
              pathname: '/(tabs)/Learn/modules/[moduleId]',
              params: { moduleId },
            })
          }
        />
        <Text style={ui.title}>{submoduleData.title}</Text>
        {submoduleData.description ? (
          <Text style={ui.subtitle}>{submoduleData.description}</Text>
        ) : null}
        {!lessonStatus.loading && !lessonStatus.error && (
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: 16,
                lineHeight: 22,
                fontWeight: '600',
                color: categoryColor,
              }}
            >
              {t('learn.home.completionSummary', {
                completed: completedLessonCount,
                total: courseLessons.length,
              })}
            </Text>
            <View style={{ height: 6 }}>
              <LearnProgress
                color={categoryColor}
                value={lessonCompletionPercent}
                label={submoduleData.title}
              />
            </View>
          </View>
        )}
        {!!submoduleData.intro_pages?.length && (
          <TouchableOpacity
            accessibilityRole='button'
            style={ui.card}
            onPress={() =>
              router.push(
                `/(tabs)/Learn/modules/${moduleId}/${submoduleId}/intro/1` as any
              )
            }
          >
            <Text style={ui.rowTitle}>{t('learn.module.introduction')}</Text>
          </TouchableOpacity>
        )}
        <Text style={ui.heading}>{t('learn.segment.lessons')}</Text>
        {lessonStatus.loading ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : lessonStatus.error ? (
          <View style={{ gap: 12 }}>
            <Text style={ui.meta}>{t('learn.errorLoadingLessons')}</Text>
            <LearnRetry />
            <TouchableOpacity
              accessibilityRole='button'
              onPress={lessonStatus.refresh}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={ui.rowTitle}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#E3E3E3',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            {courseLessons.map((lesson, index) => {
              const progress = lessonStatus.rows.find(
                row => row.sanity_lesson_id === lesson._id
              );
              const done = Boolean(progress?.is_completed);
              const active =
                lesson._id === nextLessonId || progress?.is_in_progress;
              return (
                <React.Fragment key={lesson._id}>
                  {index > 0 && <View style={ui.separator} />}
                  <TouchableOpacity
                    accessibilityRole='button'
                    accessibilityLabel={`${lesson.title}. ${t(done ? 'learn.pathwayCard.done' : progress?.is_in_progress ? 'learn.home.started' : active ? 'learn.home.upNext' : 'common.start')}`}
                    activeOpacity={0.65}
                    style={[ui.row, { padding: 13, minHeight: 65 }]}
                    onPress={() => {
                      if (isResolvingLearnHref) return;
                      if (
                        index === 0 &&
                        lessonStatus.rows.length === 0 &&
                        submoduleData.intro_pages?.length
                      ) {
                        void handleLearnPress();
                        return;
                      }
                      router.push(
                        lessonResumeHref(
                          moduleId,
                          submoduleId,
                          lesson._id,
                          done ? undefined : progress
                        ) as any
                      );
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        borderWidth: done ? 0 : 2,
                        borderColor: active ? categoryColor : '#D7D7DB',
                        backgroundColor: done ? categoryColor : '#FFFFFF',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      {done ? (
                        <Feather name='check' size={15} color='#FFFFFF' />
                      ) : active ? (
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: categoryColor,
                          }}
                        />
                      ) : (
                        <Text style={ui.meta}>{index + 1}</Text>
                      )}
                    </View>
                    <View style={ui.grow}>
                      <Text style={ui.rowTitle}>{lesson.title}</Text>
                      <Text style={ui.meta}>
                        {t(
                          done
                            ? 'learn.pathwayCard.done'
                            : progress?.is_in_progress
                              ? 'learn.home.started'
                              : active
                                ? 'learn.home.upNext'
                                : 'common.start'
                        )}
                      </Text>
                    </View>
                    {active && !done ? (
                      <View style={ui.action}>
                        <Text style={ui.actionText}>
                          {t(
                            progress?.is_in_progress
                              ? 'common.continue'
                              : 'common.start'
                          )}
                        </Text>
                      </View>
                    ) : (
                      <Feather name='chevron-right' size={16} color='#999' />
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </View>
        )}
        {sections
          .filter(section => section.id !== 'learn')
          .map(section => (
            <TouchableOpacity
              key={section.id}
              accessibilityRole='button'
              onPress={section.onPress}
              style={[ui.card, ui.row]}
            >
              <Feather
                name={section.iconName}
                size={22}
                color={categoryColor}
              />
              <View style={ui.grow}>
                <Text style={ui.rowTitle}>{section.title}</Text>
                <Text style={ui.meta}>{section.description}</Text>
              </View>
              <Feather name='chevron-right' size={18} color='#999' />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  loadingText: { fontSize: 16, color: '#686464' },
  errorText: { fontSize: 16, color: '#686464' },
});
