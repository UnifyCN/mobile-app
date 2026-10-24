import { typography } from '@/constants/Typography';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSanitySubmoduleWithLessons } from '@/hooks/sanity/useSanitySubmodules';
import { useSanityModule } from '@/hooks/sanity/useSanityModules';
import { getLessonProgressesBySubmodule } from '@/services/progress/progressService';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/utils/analytics';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Layout } from '@/constants/Layout';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TIMELINE_LEFT_WIDTH = 24;
const DOT_SIZE = 16;
const LINE_WIDTH = 2;
const DEFAULT_COLOR = '#4A7C59'; // Fallback green if no colorTheme

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type LessonUIState = 'completed' | 'active' | 'locked';

interface LessonProgress {
  is_completed: boolean;
  is_in_progress: boolean;
  progress_percent: number;
}

interface LessonViewModel {
  id: string;
  title: string;
  lessonNumber: string;
  uiState: LessonUIState;
  progressPercent: number;
  isCompleted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const getLessonStyles = (
  lesson: LessonViewModel,
  prevLesson: LessonViewModel | null,
  nextLesson: LessonViewModel | null,
  subjectColor: string,
  isLastLesson: boolean
) => {
  // Dot Style
  let dotStyle: ViewStyle[] = [styles.dot];
  if (lesson.uiState === 'completed') {
    dotStyle.push({ backgroundColor: subjectColor });
  } else if (lesson.uiState === 'active') {
    dotStyle.push({
      backgroundColor: '#FFFFFF',
      borderWidth: 2,
      borderColor: subjectColor,
    });
  } else {
    // Locked
    dotStyle.push({
      backgroundColor: '#FFFFFF',
      borderWidth: 2,
      borderColor: '#D1D1D1',
    });
  }

  // Line Above Style (connects from prev dot to this dot)
  let lineAboveStyle: ViewStyle[] = [styles.lineSegment];
  if (prevLesson) {
    if (prevLesson.uiState === 'completed' && lesson.uiState === 'completed') {
      lineAboveStyle.push({ backgroundColor: subjectColor });
    } else if (
      prevLesson.uiState === 'completed' &&
      lesson.uiState === 'active'
    ) {
      // Completed → Active: SOLID subject-color (not dotted)
      lineAboveStyle.push({ backgroundColor: subjectColor });
    } else {
      lineAboveStyle.push(styles.lineDotted);
    }
  }

  // Line Below Style (connects from this dot to next dot)
  // Critical: For the last lesson, never render lineBelow
  let lineBelowStyle: ViewStyle[] = [styles.lineSegment];
  if (!isLastLesson && nextLesson) {
    if (lesson.uiState === 'completed' && nextLesson.uiState === 'completed') {
      lineBelowStyle.push({ backgroundColor: subjectColor });
    } else if (
      lesson.uiState === 'completed' &&
      nextLesson.uiState === 'active'
    ) {
      // Completed → Active: SOLID subject-color (not dotted)
      lineBelowStyle.push({ backgroundColor: subjectColor });
    } else {
      lineBelowStyle.push(styles.lineDotted);
    }
  } else {
    // Last lesson: return empty array to prevent rendering
    lineBelowStyle = [];
  }

  return { dotStyle, lineAboveStyle, lineBelowStyle };
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function SubmoduleMap() {
  const router = useRouter();
  const { t } = useTranslation();
  // submodule_viewed / lesson_started fire from the submodule index and lesson
  // pages (useLearnEvents); this screen is no longer linked from the app.
  const { trackScreen } = useAnalytics();
  const insets = useSafeAreaInsets();
  const { moduleId, submoduleId } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
  }>();

  const {
    data: submoduleData,
    isLoading,
    error,
  } = useSanitySubmoduleWithLessons(submoduleId || '');
  const { data: moduleData } = useSanityModule(moduleId || '');

  // Progress tracking state
  const [lessonProgresses, setLessonProgresses] = useState<{
    [key: string]: LessonProgress | null;
  }>({});
  const [progressLoading, setProgressLoading] = useState(true);

  // Subject color from Sanity
  const subjectColor = moduleData?.colorTheme?.hex || DEFAULT_COLOR;

  // Track submodule map view
  const submoduleTitle = submoduleData?.title;
  const lastTrackedRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (
        submoduleTitle &&
        moduleId &&
        submoduleId &&
        now - lastTrackedRef.current > 500
      ) {
        trackScreen(`Map: ${submoduleTitle}`);
        lastTrackedRef.current = now;
      }
    }, [submoduleTitle, moduleId, submoduleId, trackScreen])
  );

  // Fetch lesson progress data
  useEffect(() => {
    if (submoduleData?.lessons && submoduleId) {
      const fetchLessonProgress = async () => {
        setProgressLoading(true);
        const progressData: { [key: string]: LessonProgress | null } = {};

        try {
          const progresses = await getLessonProgressesBySubmodule(submoduleId);

          for (const lesson of submoduleData.lessons) {
            const progress = progresses[lesson._id];
            if (progress) {
              progressData[lesson._id] = {
                is_completed: progress.is_completed,
                is_in_progress: progress.is_in_progress,
                progress_percent: progress.progress_percent,
              };
            } else {
              progressData[lesson._id] = null;
            }
          }
        } catch (error) {
          console.error(
            'Error fetching progress for submodule lessons:',
            error
          );

          for (const lesson of submoduleData.lessons) {
            progressData[lesson._id] = {
              is_completed: false,
              is_in_progress: false,
              progress_percent: 0,
            };
          }
        }

        setLessonProgresses(progressData);
        setProgressLoading(false);
      };

      fetchLessonProgress();
    }
  }, [submoduleData?.lessons, submoduleId]);

  if (isLoading || progressLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            {t('learn.map.loadingSubmodule')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !submoduleData) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {t('learn.map.errorLoadingSubmodule', {
              message: error?.message || t('common.unknownError'),
            })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Find the first non-completed lesson (all lessons are now unlocked)
  const nextLesson = submoduleData.lessons.find((lesson: any) => {
    const progress = lessonProgresses[lesson._id];
    return !progress?.is_completed;
  });

  // Build lesson view models with explicit UI states
  const lessons: LessonViewModel[] = submoduleData.lessons.map(
    (lesson: any, index: number) => {
      const progress = lessonProgresses[lesson._id];
      const isCompleted = progress?.is_completed || false;
      const progressPercent = progress?.progress_percent ?? 0; // Fallback to 0

      // Format lesson number with fallbacks
      // Ensure format is submodule.order.lesson.order (e.g., "1.1", "1.2")
      let lessonNumber = '';
      if (submoduleData?.order != null && lesson.order != null) {
        // Ensure lesson.order is treated as a number, not string
        const subOrder =
          typeof submoduleData.order === 'number'
            ? submoduleData.order
            : parseInt(String(submoduleData.order), 10);
        const lesOrder =
          typeof lesson.order === 'number'
            ? lesson.order
            : parseInt(String(lesson.order), 10);
        if (!isNaN(subOrder) && !isNaN(lesOrder)) {
          lessonNumber = `${subOrder}.${lesOrder}`;
        } else if (!isNaN(lesOrder)) {
          lessonNumber = `${lesOrder}`;
        }
      } else if (lesson.order != null) {
        const lesOrder =
          typeof lesson.order === 'number'
            ? lesson.order
            : parseInt(String(lesson.order), 10);
        if (!isNaN(lesOrder)) {
          lessonNumber = `${lesOrder}`;
        }
      }
      // If both are missing, lessonNumber remains empty string

      // Determine UI state - all lessons are now unlocked
      let uiState: LessonUIState;
      if (isCompleted) {
        uiState = 'completed';
      } else if (progressPercent > 0) {
        uiState = 'active'; // Lesson in progress
      } else {
        uiState = 'active'; // All lessons are unlocked and active
      }

      // Remove any "Lesson X.X:" prefix from title if present
      let cleanTitle = lesson.title || '';
      // Remove patterns like "Lesson 1.1:", "Lesson 1.1.1:", etc.
      cleanTitle = cleanTitle.replace(/^Lesson\s+\d+(\.\d+)*:\s*/i, '');

      return {
        id: lesson._id,
        title: cleanTitle, // Clean title without prefix
        lessonNumber,
        uiState,
        progressPercent,
        isCompleted,
      };
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  // Lesson card
  const renderLessonCard = (lesson: LessonViewModel, index: number) => {
    const isActive = lesson.uiState === 'active';
    const isLocked = lesson.uiState === 'locked';
    const isFirst = index === 0;
    const isLast = index === lessons.length - 1;

    const { dotStyle, lineAboveStyle, lineBelowStyle } = getLessonStyles(
      lesson,
      isFirst ? null : lessons[index - 1],
      isLast ? null : lessons[index + 1],
      subjectColor,
      isLast
    );

    const progressPercent = Math.max(0, Math.min(100, lesson.progressPercent)); // Clamp 0-100, never NaN

    return (
      <View key={lesson.id} style={styles.lessonRow}>
        {/* Left timeline column with lines and dot */}
        <View style={styles.timelineColumn}>
          {/* Main Part: Aligns with card content */}
          <View style={styles.timelineContent}>
            {/* Line above dot */}
            <View style={styles.lineHalf}>
              {!isFirst && <View style={[...lineAboveStyle, { flex: 1 }]} />}
            </View>

            {/* Dot */}
            <View style={dotStyle} />

            {/* Line below dot */}
            <View style={styles.lineHalf}>
              {!isLast && lineBelowStyle.length > 0 && (
                <View style={[...lineBelowStyle, { flex: 1 }]} />
              )}
            </View>
          </View>

          {/* Gap Extension Part: Extends line through the padding */}
          {!isLast && lineBelowStyle.length > 0 && (
            <View style={styles.timelineGap}>
              <View style={[...lineBelowStyle, { flex: 1 }]} />
            </View>
          )}
        </View>

        {/* Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            // All lessons are now unlocked
            // Check if this is the first lesson and submodule has intro pages
            const isFirstLesson = index === 0;
            const hasIntroPages =
              submoduleData?.intro_pages &&
              submoduleData.intro_pages.length > 0;

            // Check if submodule has been started (any lesson has progress)
            const hasSubmoduleProgress = Object.values(lessonProgresses).some(
              p =>
                p?.is_in_progress ||
                (p?.progress_percent ?? 0) > 0 ||
                p?.is_completed
            );

            // If first lesson, has intro pages, and submodule hasn't been started, go to intro
            if (isFirstLesson && hasIntroPages && !hasSubmoduleProgress) {
              router.push({
                pathname:
                  '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/intro/[pageNum]' as any,
                params: {
                  moduleId,
                  submoduleId,
                  pageNum: '1',
                },
              });
            } else {
              // Otherwise, go directly to lesson. lesson_started fires from
              // the lesson page itself (useLearnEvents).
              router.push({
                pathname:
                  '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]' as any,
                params: {
                  moduleId,
                  submoduleId,
                  lessonId: lesson.id,
                },
              });
            }
          }}
          style={[
            styles.card,
            isActive && {
              backgroundColor: subjectColor,
              borderColor: subjectColor,
            },
            isLocked && styles.cardLocked,
          ]}
        >
          {lesson.lessonNumber && (
            <Text
              style={[
                styles.lessonNumber,
                isActive && styles.lessonNumberActive,
                isLocked && styles.textLocked,
              ]}
            >
              {lesson.lessonNumber}
            </Text>
          )}
          <Text
            style={[
              styles.lessonTitle,
              isActive && styles.lessonTitleActive,
              isLocked && styles.textLocked,
            ]}
          >
            {lesson.title}
          </Text>

          {/* Progress bar - only show on active lesson */}
          {isActive && (
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${progressPercent}%`,
                      backgroundColor: subjectColor,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header - White background */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + Layout.header.topInsetOffset },
        ]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() =>
              router.replace({
                pathname: '/(tabs)/Learn/modules/[moduleId]',
                params: { moduleId },
              })
            }
            style={styles.backButton}
          >
            <Feather
              name='chevron-left'
              size={Layout.header.iconSize}
              color='#000000'
            />
          </TouchableOpacity>
          <View style={styles.headerTitleCenter}>
            <Text style={styles.headerSubjectName}>
              {moduleData?.title || t('common.subject')}
            </Text>
          </View>
          <View style={styles.headerRightPlaceholder} />
        </View>

        <View style={styles.headerSectionInfo}>
          {submoduleData?.order != null && (
            <Text style={styles.sectionNumber}>
              {t('learn.module.section', { number: submoduleData.order })}
            </Text>
          )}
          <Text style={styles.sectionTitle}>{submoduleData?.title || ''}</Text>
          {submoduleData?.description && (
            <Text style={styles.sectionDescription} numberOfLines={3}>
              {submoduleData.description}
            </Text>
          )}
        </View>
      </View>

      {/* Lessons list with timeline */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {lessons.map((lesson, index) => renderLessonCard(lesson, index))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Header
  header: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 24,
    paddingHorizontal: Layout.header.horizontalPadding,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Layout.header.rowHeight,
  },
  backButton: {
    width: Layout.header.rowHeight,
    height: Layout.header.rowHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightPlaceholder: {
    width: Layout.header.rowHeight,
  },
  headerSubjectName: { ...typography.title, color: '#000000' },
  headerSectionInfo: {
    marginTop: 8,
    paddingLeft: Layout.header.horizontalPadding,
  },
  sectionNumber: { ...typography.section, color: '#000000', marginBottom: 2 },
  sectionTitle: { ...typography.title, color: '#000000', marginBottom: 8 },
  sectionDescription: {
    ...typography.secondary,
    color: '#000000',
    fontWeight: '400',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingLeft: 16,
    paddingRight: 32,
  },

  // Lesson row
  lessonRow: {
    flexDirection: 'row',
    minHeight: 70,
    paddingBottom: 18, // Increased gap between cards
  },

  // Timeline column
  timelineColumn: {
    width: TIMELINE_LEFT_WIDTH,
    alignItems: 'center',
    flexDirection: 'column',
  },
  timelineContent: {
    flex: 1, // Matches card height
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  timelineGap: {
    height: 18, // Matches lessonRow paddingBottom
    width: '100%',
    alignItems: 'center',
    position: 'absolute',
    bottom: -18,
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
    opacity: 0.4, // Reduced opacity to indicate inactive state
  },

  // Dots
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // default
  },

  // Card
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14, // Increased padding for bigger cards
    marginLeft: 16, // Explicit gap from timeline
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardLocked: {
    opacity: 0.5,
  },
  lessonNumber: {
    ...typography.secondary,
    color: '#1A1A1A',
    marginBottom: 2,
    fontWeight: '600',
  },
  lessonNumberActive: {
    color: '#FFFFFF',
  },
  lessonTitle: { ...typography.cardTitle, color: '#1A1A1A' },
  lessonTitleActive: {
    color: '#FFFFFF',
  },
  textLocked: {
    color: '#AAAAAA',
  },

  // Progress bar
  progressBarContainer: {
    marginTop: 8,
    width: '100%',
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Loading and Error States
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: { ...typography.body, color: '#6B7280', textAlign: 'center' },
  errorText: { ...typography.body, color: '#EF4444', textAlign: 'center' },
});
