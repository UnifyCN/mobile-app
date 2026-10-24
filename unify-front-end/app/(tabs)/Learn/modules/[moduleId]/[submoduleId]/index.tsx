import { typography } from '@/constants/Typography';
import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  ViewStyle,
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
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import {
  getCompletedSectionId,
  getNextIncompleteSectionId,
  LearnSectionId,
} from '@/utils/learnCompletionNavigation';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layout } from '@/constants/Layout';
import {
  normalizeLearnOrigin,
  withLearnOrigin,
} from '@/utils/learnOriginNavigation';

const SUBJECT_COLOR = '#10B981'; // green for Learn (active)

const TIMELINE_LEFT_WIDTH = 24;
const DOT_SIZE = 16;
const LINE_WIDTH = 2;

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

function getSectionStyles(
  section: SubmoduleSectionViewModel,
  prevSection: SubmoduleSectionViewModel | null,
  nextSection: SubmoduleSectionViewModel | null,
  subjectColor: string
): {
  dotStyle: ViewStyle[];
  lineAboveStyle: ViewStyle[];
  lineBelowStyle: ViewStyle[];
} {
  let dotStyle: ViewStyle[] = [styles.dot];
  if (section.uiState === 'completed') {
    dotStyle.push({ backgroundColor: subjectColor });
  } else if (section.uiState === 'active' || section.uiState === 'unlocked') {
    dotStyle.push({
      backgroundColor: '#FFFFFF',
      borderWidth: 2,
      borderColor: subjectColor,
    });
  } else {
    dotStyle.push({
      backgroundColor: '#FFFFFF',
      borderWidth: 2,
      borderColor: '#D1D1D1',
    });
  }

  let lineAboveStyle: ViewStyle[] = [styles.lineSegment];
  if (prevSection) {
    if (
      prevSection.uiState === 'completed' &&
      section.uiState === 'completed'
    ) {
      lineAboveStyle.push({ backgroundColor: subjectColor });
    } else if (
      prevSection.uiState === 'completed' &&
      (section.uiState === 'active' || section.uiState === 'unlocked')
    ) {
      lineAboveStyle.push(styles.lineDotted);
      lineAboveStyle.push({ borderColor: subjectColor });
    } else {
      lineAboveStyle.push(styles.lineDotted);
    }
  }

  let lineBelowStyle: ViewStyle[] = [styles.lineSegment];
  if (nextSection) {
    if (
      section.uiState === 'completed' &&
      nextSection.uiState === 'completed'
    ) {
      lineBelowStyle.push({ backgroundColor: subjectColor });
    } else if (
      section.uiState === 'completed' &&
      (nextSection.uiState === 'active' || nextSection.uiState === 'unlocked')
    ) {
      lineBelowStyle.push(styles.lineDotted);
      lineBelowStyle.push({ borderColor: subjectColor });
    } else {
      lineBelowStyle.push(styles.lineDotted);
    }
  }

  return { dotStyle, lineAboveStyle, lineBelowStyle };
}

export default function SubmoduleIndex() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    moduleId,
    submoduleId,
    justCompletedLearn,
    justCompletedTasks,
    justCompletedPractice,
    origin: originParam,
  } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    justCompletedLearn?: string;
    justCompletedTasks?: string;
    justCompletedPractice?: string;
    origin?: string | string[];
  }>();
  const origin = normalizeLearnOrigin(originParam);

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
  const [openedCardId, setOpenedCardId] = useState<string | null>('learn');

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

  const sectionNumber =
    (moduleData?.submodules?.findIndex(s => s?._id === submoduleId) ?? 0) + 1;

  const { onSubmoduleFocused } = useLearnEvents();
  const submoduleTitle = submoduleData?.title;
  useFocusEffect(
    useCallback(() => {
      if (!moduleId || !submoduleId || !submoduleTitle) return;
      onSubmoduleFocused(moduleId, submoduleId, submoduleTitle);
    }, [moduleId, submoduleId, submoduleTitle, onSubmoduleFocused])
  );

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
      if (href) router.push(withLearnOrigin(href, origin) as any);
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
        router.push(withLearnOrigin(href, origin) as any);
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

  const highlightedSectionId =
    requestedNextSectionId ??
    sections.find(section => section.progressPercent < 100)?.id ??
    sections[0]?.id ??
    null;

  useLayoutEffect(() => {
    setOpenedCardId(highlightedSectionId);
  }, [highlightedSectionId]);

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
        params: { moduleId, ...(origin ? { origin } : {}) },
      });
      return;
    }

    if (!moduleData?.submodules) {
      router.replace({
        pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
        params: { moduleId, ...(origin ? { origin } : {}) },
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
        params: { moduleId, ...(origin ? { origin } : {}) },
      });
      return;
    }

    const nextSubmoduleId =
      moduleData.submodules[currentSubmoduleIndex + 1]?._id;

    if (nextSubmoduleId) {
      router.replace({
        pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
        params: {
          moduleId,
          highlightSubmoduleId: nextSubmoduleId,
          ...(origin ? { origin } : {}),
        },
      });
      return;
    }

    router.replace(
      origin === 'checklist' ? '/(tabs)/Checklist' : '/(tabs)/Learn'
    );
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
    origin,
    practices,
    requestedNextSectionId,
    router,
    submoduleId,
    tasks,
  ]);

  const handleCardTap = (section: SubmoduleSectionViewModel) => {
    if (openedCardId === section.id) {
      section.onPress();
    } else {
      setOpenedCardId(section.id);
    }
  };

  const renderSectionCard = (
    section: SubmoduleSectionViewModel,
    index: number
  ) => {
    const isOpened = openedCardId === section.id;
    const isLocked = section.uiState === 'locked';
    const isFirst = index === 0;
    const isLast = index === sections.length - 1;

    const { dotStyle, lineAboveStyle, lineBelowStyle } = getSectionStyles(
      section,
      isFirst ? null : sections[index - 1],
      isLast ? null : sections[index + 1],
      subjectColor
    );
    const statusLabel =
      section.progressPercent >= 100
        ? t('common.completed')
        : section.progressPercent > 0
          ? t('learn.submodule.percentComplete', {
              percent: Math.round(section.progressPercent),
            })
          : null;
    const ctaLabel =
      section.progressPercent >= 100
        ? t('common.review')
        : section.progressPercent > 0
          ? t('common.continue')
          : t('common.start');

    return (
      <View key={section.id} style={styles.sectionRow}>
        <View style={styles.timelineColumn}>
          <View style={styles.timelineContent}>
            <View style={styles.lineHalf}>
              {!isFirst && <View style={[...lineAboveStyle, { flex: 1 }]} />}
            </View>
            <View style={dotStyle} />
            <View style={styles.lineHalf}>
              {!isLast && <View style={[...lineBelowStyle, { flex: 1 }]} />}
            </View>
          </View>
          {!isLast && (
            <View style={styles.timelineGap}>
              <View style={[...lineBelowStyle, { flex: 1 }]} />
            </View>
          )}
        </View>
        <TouchableOpacity
          activeOpacity={isLocked ? 1 : 0.8}
          onPress={() => handleCardTap(section)}
          style={[
            styles.card,
            isOpened && styles.cardOpened,
            isOpened && {
              backgroundColor: subjectColor,
              borderColor: subjectColor,
            },
            isLocked && styles.cardLocked,
          ]}
        >
          <View style={styles.cardInner}>
            <View style={styles.cardTopRow}>
              <Text
                style={[
                  styles.cardTitle,
                  isOpened && styles.cardTitleOpened,
                  isLocked && styles.textLocked,
                ]}
              >
                {section.title}
              </Text>
              <Feather
                name={section.iconName}
                size={16}
                style={[
                  styles.cardIcon,
                  isOpened && styles.cardIconOpened,
                  isLocked && styles.textLocked,
                ]}
              />
            </View>
            <Text
              style={[
                styles.sectionDescription,
                isOpened && styles.lessonCountOpened,
                isLocked && styles.textLocked,
              ]}
            >
              {section.description}
            </Text>
            {!!statusLabel && (
              <Text
                style={[
                  styles.sectionStatus,
                  isOpened && styles.sectionStatusOpened,
                  isLocked && styles.textLocked,
                ]}
              >
                {statusLabel}
              </Text>
            )}
            {isOpened && (
              <View style={styles.startCtaWrap}>
                <View style={styles.startCta}>
                  {section.id === 'learn' && isResolvingLearnHref ? (
                    <ActivityIndicator size='small' color={subjectColor} />
                  ) : (
                    <Text
                      style={[styles.startCtaText, { color: subjectColor }]}
                    >
                      {ctaLabel}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

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

  return (
    <View style={styles.pageContainer}>
      {/* White header: back, icon, title, description */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: '#FFFFFF',
            paddingTop: insets.top + Layout.header.topInsetOffset,
          },
        ]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => {
              if (origin === 'checklist') {
                router.replace('/(tabs)/Checklist');
                return;
              }
              router.replace({
                pathname: '/(tabs)/Learn/modules/[moduleId]' as any,
                params: { moduleId },
              });
            }}
            style={styles.backButton}
          >
            <Feather name='chevron-left' size={28} color='#000' />
          </TouchableOpacity>
          <View style={styles.headerCenterWrap}>
            <Text style={styles.headerModuleName} numberOfLines={1}>
              {moduleData?.title ?? ''}
            </Text>
          </View>
          <View style={styles.headerRightPlaceholder} />
        </View>

        <View style={styles.headerTitleWrap}>
          <View style={styles.headerTitleBlock}>
            <View style={styles.headerSectionPill}>
              <Text style={styles.headerSectionLabel}>
                {t('learn.module.section', { number: sectionNumber })}
              </Text>
            </View>
            <Text style={styles.headerTitle}>{submoduleData.title}</Text>
          </View>
        </View>

        <View style={styles.headerDescriptionWrap}>
          <Text style={styles.headerDescription}>
            {submoduleData.description ||
              t('learn.submodule.defaultDescription')}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section, index) => renderSectionCard(section, index))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEDEF',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    paddingHorizontal: 16,
    marginTop: 14,
  },
  headerTitleBlock: {
    marginLeft: 16,
    marginBottom: 8,
  },
  headerSectionPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E6E9EE',
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  headerSectionLabel: {
    ...typography.caption,
    color: '#5A6270',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  headerTitle: { ...typography.title, color: '#101114', letterSpacing: -0.4 },
  headerDescriptionWrap: {
    paddingHorizontal: 16,
    marginTop: 2,
    paddingBottom: 4,
  },
  headerDescription: {
    ...typography.secondary,
    color: '#4B5563',
    marginLeft: 16,
    marginRight: 10,
    fontWeight: '400',
  },
  headerCenterWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  headerModuleName: {
    ...typography.section,
    color: '#111111',
    letterSpacing: -0.2,
  },
  headerRightPlaceholder: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingLeft: 16,
    paddingRight: 32,
  },
  sectionRow: {
    flexDirection: 'row',
    minHeight: 64,
    paddingBottom: 16,
  },
  timelineColumn: {
    width: TIMELINE_LEFT_WIDTH,
    alignItems: 'center',
    flexDirection: 'column',
  },
  timelineContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  timelineGap: {
    height: 16,
    width: '100%',
    alignItems: 'center',
    position: 'absolute',
    bottom: -16,
  },
  lineHalf: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  lineSegment: {
    width: LINE_WIDTH,
    backgroundColor: '#D1D1D1',
  },
  lineDotted: {
    width: LINE_WIDTH,
    backgroundColor: '#D1D1D1',
    opacity: 0.4,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginLeft: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardOpened: {
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    transform: [{ scale: 1.01 }],
  },
  cardLocked: {
    opacity: 0.5,
  },
  cardInner: {
    minHeight: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  cardTitle: { ...typography.cardTitle, color: '#1A1A1A' },
  cardTitleOpened: {
    color: '#FFFFFF',
  },
  cardIcon: {
    color: '#7B8698',
  },
  cardIconOpened: {
    color: '#FFFFFF',
  },
  sectionDescription: {
    ...typography.secondary,
    color: '#62605B',
    marginBottom: 0,
    fontWeight: '400',
  },
  lessonCountOpened: {
    color: 'rgba(255,255,255,0.85)',
  },
  sectionStatus: {
    ...typography.caption,
    color: '#62605B',
    marginTop: 4,
    fontWeight: '500',
  },
  sectionStatusOpened: {
    color: 'rgba(255,255,255,0.8)',
  },
  textLocked: {
    color: '#AAAAAA',
  },
  startCtaWrap: {
    marginTop: 8,
  },
  startCta: {
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startCtaText: { ...typography.button },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: { ...typography.body, color: '#6B7280', marginTop: 12 },
  errorText: { ...typography.body, color: '#EF4444', textAlign: 'center' },
});
