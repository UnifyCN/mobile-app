import { typography } from '@/constants/Typography';
import { categorySymbol } from '@/components/learn/CategorySymbol';
import LearnRetry from '@/components/learn/LearnRetry';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getLessonExitDestination,
  normalizeLearnOrigin,
} from '@/utils/learnOriginNavigation';
import { Feather } from '@expo/vector-icons';
import { useSanityLesson } from '@/hooks/sanity/useSanityLessons';
import { useSanityModule } from '@/hooks/sanity/useSanityModules';
import { useSanityLessonQuizzes } from '@/hooks/sanity/useSanityQuizzes';
import { useSanitySubmoduleWithLessons } from '@/hooks/sanity/useSanitySubmodules';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';
import SubmoduleProgressBar from '@/components/learn/SubmoduleProgressBar';
import {
  calculateActivityProgress,
  getLastLessonPageNumber,
  getLessonTotalPages,
} from '@/utils/submoduleProgress';
import { useLessonProgress } from '@/hooks/progress/useLessonProgress';
import { hasLoadedContentItem } from '@/utils/learnCompletionNavigation';
import { getOrderedLegacyPageNumber } from '@/utils/lessonContentBlocks';
import {
  saveActivityInput,
  getActivityInputsByPage,
  saveResumePosition,
  ACTIVITY_QUESTION_PREFIX,
} from '@/services/progress/progressService';
import { useAnalytics } from '@/utils/analytics';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import { useFocusEffect } from '@react-navigation/native';

export default function ActivityPageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    moduleId,
    submoduleId,
    lessonId,
    pageNum,
    origin: originParam,
  } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    lessonId: string;
    pageNum: string;
    origin?: string | string[];
  }>();
  const origin = normalizeLearnOrigin(originParam);
  const originParams = origin ? { origin } : {};
  const { trackScreen } = useAnalytics();
  const { onLessonPageFocused, onActivitySubmitted } = useLearnEvents();
  const [showExitModal, setShowExitModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [inputValues, setInputValues] = useState<{ [key: string]: string }>({});
  const [questionAnswers, setQuestionAnswers] = useState<{
    [key: string]: string | string[];
  }>({});
  const [isSaving, setIsSaving] = useState(false);

  const currentPage = Number(pageNum || '1');
  const { data: lesson, isLoading: loadingLesson } = useSanityLesson(
    lessonId || ''
  );
  const orderedPageNumber = getOrderedLegacyPageNumber({
    lesson,
    pageType: 'activity',
    pageNumber: currentPage,
  });
  const { data: moduleData } = useSanityModule(moduleId || '');
  const {
    data: quizzes,
    isLoading: quizzesLoading,
    error: quizzesError,
  } = useSanityLessonQuizzes(lessonId || '');
  const {
    data: submoduleData,
    isLoading: submoduleLoading,
    error: submoduleError,
  } = useSanitySubmoduleWithLessons(submoduleId || '');

  // Debounce timers for autosaving free-text inputs, keyed by field.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Fields the user has edited on this page. Guards the async restore below from
  // clobbering fresh input if the fetch resolves after the user starts typing.
  const touchedRef = useRef<Set<string>>(new Set());

  // Hydrate any previously-saved inputs/answers for this page so the user's work
  // survives Next/Back and exiting/re-entering the lesson. Replaces the old effect
  // that unconditionally wiped state to {} on every page change.
  useEffect(() => {
    let cancelled = false;
    setIsSubmitted(false);
    setInputValues({});
    setQuestionAnswers({});
    touchedRef.current = new Set();
    const pageKey = lesson?.activity_pages?.[currentPage - 1]?._key;
    if (!lessonId || !pageKey) return;
    getActivityInputsByPage(lessonId).then(byPage => {
      if (cancelled) return;
      const saved = byPage[pageKey];
      if (!saved) return;
      // Only fill fields the user hasn't touched or already set (avoids a slow
      // fetch overwriting input typed during the load).
      setInputValues(prev => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(saved.inputValues)) {
          if (!touchedRef.current.has(k) && next[k] === undefined) next[k] = v;
        }
        return next;
      });
      setQuestionAnswers(prev => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(saved.questionAnswers)) {
          if (!touchedRef.current.has(k) && next[k] === undefined) next[k] = v;
        }
        return next;
      });
      if (touchedRef.current.size === 0) setIsSubmitted(saved.isSubmitted);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPage, lessonId, lesson?.activity_pages]);

  // Progress tracking
  const { saveLessonCompletion } = useLessonProgress();
  const currentPageData = lesson?.activity_pages?.[currentPage - 1];
  const currentPageKey = currentPageData?._key;
  const totalPages = lesson?.activity_pages?.length || 0;
  // Canonical denominator for user_lesson_progress.total_pages.
  const lessonTotalPages = getLessonTotalPages(lesson, quizzes);

  // Calculate progress for the progress bar - keep it static/offline
  const progress = calculateActivityProgress(
    submoduleData || null,
    lessonId || '',
    currentPage
  );

  // Track activity page view
  const TRACKING_THROTTLE_MS = 500;
  const lessonTitle = lesson?.title;
  const lastTrackedPageRef = useRef<string>('');
  const lastTrackedRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      if (orderedPageNumber !== undefined) return;
      const now = Date.now();
      const pageKey = `${lessonId}-${currentPage}`;
      // Only track if: data is loaded, throttle passed, AND this is a different page than last tracked
      if (
        lessonTitle &&
        now - lastTrackedRef.current > TRACKING_THROTTLE_MS &&
        lastTrackedPageRef.current !== pageKey
      ) {
        trackScreen(
          `Activity Page: ${lessonTitle} - ${currentPage}/${totalPages}`
        );
        lastTrackedRef.current = now;
        lastTrackedPageRef.current = pageKey;
      }
      // Persist resume position so exit → re-enter lands back on this activity page.
      if (currentPageKey && lessonId && submoduleId && moduleId) {
        saveResumePosition(
          lessonId,
          submoduleId,
          moduleId,
          'activity',
          currentPage
        );
      }
    }, [
      lessonTitle,
      lessonId,
      submoduleId,
      moduleId,
      currentPageKey,
      orderedPageNumber,
      currentPage,
      totalPages,
      trackScreen,
    ])
  );

  // Joins the lesson visit (resuming here is not a start). An activity page is
  // the lesson's first page only when the lesson has no content pages.
  const contentPageCount = lesson?.pages?.length || 0;
  useFocusEffect(
    useCallback(() => {
      if (
        orderedPageNumber !== undefined ||
        !currentPageKey ||
        !moduleId ||
        !submoduleId ||
        !lessonId ||
        !lessonTitle
      )
        return;
      onLessonPageFocused(
        moduleId,
        submoduleId,
        lessonId,
        contentPageCount + currentPage,
        lessonTitle
      );
    }, [
      moduleId,
      submoduleId,
      lessonId,
      lessonTitle,
      orderedPageNumber,
      currentPageKey,
      contentPageCount,
      currentPage,
      onLessonPageFocused,
    ])
  );

  // Helper functions for sequential navigation
  const getCurrentLessonIndex = () => {
    if (!submoduleData?.lessons) return -1;
    return submoduleData.lessons.findIndex(l => l._id === lessonId);
  };

  const getNextLesson = () => {
    const currentIndex = getCurrentLessonIndex();
    if (currentIndex === -1 || !submoduleData?.lessons) return null;
    return submoduleData.lessons[currentIndex + 1] || null;
  };

  const getPreviousLesson = () => {
    const currentIndex = getCurrentLessonIndex();
    if (currentIndex === -1 || !submoduleData?.lessons) return null;
    return submoduleData.lessons[currentIndex - 1] || null;
  };

  const handleSaveAndLeave = () => {
    setShowExitModal(false);
    if (origin === 'checklist') {
      router.replace(getLessonExitDestination(origin, '') as any);
      return;
    }
    router.push({
      pathname: '/(tabs)/Learn/modules/[moduleId]/[submoduleId]' as any,
      params: { moduleId, submoduleId },
    });
  };

  const handleContinue = () => {
    setShowExitModal(false);
  };

  const handleInputChange = (fieldKey: string, value: string) => {
    touchedRef.current.add(fieldKey);
    setInputValues(prev => ({ ...prev, [fieldKey]: value }));
    // Debounced autosave of free-text so it survives navigation without a write
    // on every keystroke.
    const pageKey = currentPageData?._key;
    if (!pageKey || !lessonId || !submoduleId || !moduleId) return;
    // Key timers by page + field so a pending save is never cancelled by the same
    // field key on another page.
    const timerKey = `${pageKey}:${fieldKey}`;
    if (saveTimers.current[timerKey])
      clearTimeout(saveTimers.current[timerKey]);
    saveTimers.current[timerKey] = setTimeout(() => {
      saveActivityInput(
        lessonId,
        submoduleId,
        moduleId,
        pageKey,
        fieldKey,
        value,
        false
      );
    }, 600);
  };

  const handleQuestionAnswer = (
    questionKey: string,
    answer: string | string[]
  ) => {
    touchedRef.current.add(questionKey);
    setQuestionAnswers(prev => ({ ...prev, [questionKey]: answer }));
    // Selections are cheap and discrete — persist immediately.
    const pageKey = currentPageData?._key;
    if (!pageKey || !lessonId || !submoduleId || !moduleId) return;
    saveActivityInput(
      lessonId,
      submoduleId,
      moduleId,
      pageKey,
      `${ACTIVITY_QUESTION_PREFIX}${questionKey}`,
      JSON.stringify(answer),
      false
    );
  };

  const handleSubmit = async () => {
    setIsSubmitted(true);
    const pageKey = currentPageData?._key;
    if (moduleId && submoduleId && lessonId && pageKey) {
      // Flush any pending debounced saves and persist final values as submitted.
      Object.values(saveTimers.current).forEach(clearTimeout);
      saveTimers.current = {};
      Object.entries(inputValues).forEach(([fieldKey, value]) => {
        saveActivityInput(
          lessonId,
          submoduleId,
          moduleId,
          pageKey,
          fieldKey,
          value,
          true
        );
      });
      Object.entries(questionAnswers).forEach(([questionKey, answer]) => {
        saveActivityInput(
          lessonId,
          submoduleId,
          moduleId,
          pageKey,
          `${ACTIVITY_QUESTION_PREFIX}${questionKey}`,
          JSON.stringify(answer),
          true
        );
      });
      onActivitySubmitted(moduleId, submoduleId, lessonId, pageKey);
    }
  };

  const handleNext = async () => {
    if (currentPage < totalPages) {
      // Go to next activity page
      router.push({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/activities/[pageNum]' as any,
        params: {
          moduleId,
          submoduleId,
          lessonId,
          pageNum: (currentPage + 1).toString(),
          ...originParams,
        },
      });
    } else {
      // All activity pages completed, check if there are quizzes
      if (quizzes && quizzes.length > 0) {
        // Navigate to first quiz (sorted by order_number)
        const sortedQuizzes = quizzes.sort(
          (a, b) => a.order_number - b.order_number
        );
        const firstQuiz = sortedQuizzes[0];
        router.push({
          pathname:
            '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/quizzes/[quizId]' as any,
          params: {
            moduleId,
            submoduleId,
            lessonId,
            quizId: firstQuiz._id,
            ...originParams,
          },
        });
      } else {
        // No quizzes, check if there are ending pages
        const totalEndingPages = lesson?.ending_pages?.length || 0;
        if (totalEndingPages > 0) {
          // Navigate to first ending page
          router.push({
            pathname:
              '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/ending/[pageNum]' as any,
            params: {
              moduleId,
              submoduleId,
              lessonId,
              pageNum: '1',
              ...originParams,
            },
          });
        } else {
          // No ending pages, save this lesson as completed before navigating
          setIsSaving(true);
          let didSave = false;
          try {
            didSave = await saveLessonCompletion(
              lessonId || '',
              submoduleId || '',
              moduleId || '',
              lessonTotalPages
            );
          } finally {
            setIsSaving(false);
          }

          if (!didSave) {
            Alert.alert(t('common.somethingWentWrong'), t('common.tryAgain'));
            return;
          }

          // Check if this is the last lesson
          const currentIndex = getCurrentLessonIndex();
          const isLastLesson =
            currentIndex === (submoduleData?.lessons?.length || 0) - 1;

          if (isLastLesson) {
            router.dismissTo({
              pathname: '/(tabs)/Learn/modules/[moduleId]/[submoduleId]' as any,
              params: {
                moduleId,
                submoduleId,
                justCompletedLearn: '1',
                ...originParams,
              },
            });
          } else {
            // Go to next lesson
            const nextLesson = getNextLesson();
            if (nextLesson) {
              router.push({
                pathname:
                  '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]' as any,
                params: {
                  moduleId,
                  submoduleId,
                  lessonId: nextLesson._id,
                  pageNum: '1',
                  ...originParams,
                },
              });
            }
          }
        }
      }
    }
  };

  const handleBack = () => {
    if (currentPage > 1) {
      // Go to previous activity page
      router.push({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/activities/[pageNum]' as any,
        params: {
          moduleId,
          submoduleId,
          lessonId,
          pageNum: (currentPage - 1).toString(),
          ...originParams,
        },
      });
    } else {
      // First activity page, go back to last lesson page
      const totalLessonPages = lesson?.pages?.length || 0;
      if (totalLessonPages > 0) {
        router.push({
          pathname:
            '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]' as any,
          params: {
            moduleId,
            submoduleId,
            lessonId,
            pageNum: totalLessonPages.toString(),
            ...originParams,
          },
        });
      } else {
        // No lesson pages, go to previous lesson
        const previousLesson = getPreviousLesson();
        if (previousLesson) {
          router.push({
            pathname:
              '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]' as any,
            params: {
              moduleId,
              submoduleId,
              lessonId: previousLesson._id,
              pageNum: String(getLastLessonPageNumber(previousLesson)),
              ...originParams,
            },
          });
        } else {
          router.push({
            pathname: '/(tabs)/Learn/modules/[moduleId]/[submoduleId]' as any,
            params: { moduleId, submoduleId, ...originParams },
          });
        }
      }
    }
  };

  if (loadingLesson || quizzesLoading || submoduleLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text>{t('learn.lesson.loadingActivity')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (orderedPageNumber !== undefined) {
    return (
      <Redirect
        href={{
          pathname:
            '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]',
          params: {
            moduleId,
            submoduleId,
            lessonId,
            pageNum: String(orderedPageNumber),
            ...originParams,
          },
        }}
      />
    );
  }

  if (
    !lesson ||
    !currentPageData ||
    quizzesError ||
    submoduleError ||
    !hasLoadedContentItem(submoduleData?.lessons, lessonId)
  ) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text>{t('learn.lesson.errorLoadingActivity')}</Text>
          <LearnRetry />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Progress Bar */}
      <SubmoduleProgressBar
        lessonLayout
        currentProgress={progress.currentPage}
        totalPages={progress.totalPages}
        submoduleTitle={
          submoduleData?.title || t('learn.lesson.submoduleFallback')
        }
        submoduleOrder={submoduleData?.order || 1}
        onClose={() => setShowExitModal(true)}
        colorHex={categorySymbol(moduleId).foreground}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text style={styles.pageTitle}>{currentPageData.title}</Text>

        {/* Instructions with embedded input fields and questions */}
        <View style={styles.instructionsContainer}>
          <RichTextRenderer
            compactContainer
            blocks={currentPageData.instructions || []}
            markDefs={currentPageData.instructionsMarkDefs}
            inputValues={inputValues}
            onInputChange={handleInputChange}
            questionAnswers={questionAnswers}
            onQuestionAnswer={handleQuestionAnswer}
            showQuestionFeedback={isSubmitted}
          />
        </View>

        {/* Answer box (if available and submitted) */}
        {currentPageData.answer_box && isSubmitted && (
          <View style={styles.answerBoxContainer}>
            {currentPageData.answer_box.title && (
              <Text style={styles.answerBoxTitle}>
                {currentPageData.answer_box.title}
              </Text>
            )}
            <RichTextRenderer
              compactContainer
              blocks={currentPageData.answer_box.content || []}
              markDefs={currentPageData.answer_box.markDefs}
              styles={{
                normal: {
                  ...typography.reading,
                  color: '#3F3F3F',
                  marginBottom: 0,
                },
                bullet: {
                  ...typography.reading,
                  color: '#3F3F3F',
                  marginBottom: 0,
                },
                number: {
                  ...typography.reading,
                  color: '#3F3F3F',
                  marginBottom: 0,
                },
                strong: {
                  ...typography.reading,
                  fontWeight: '700',
                  color: '#3F3F3F',
                },
              }}
            />
          </View>
        )}
      </ScrollView>

      {/* Navigation buttons - anchored at bottom */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.nextBtn,
            { backgroundColor: moduleData?.colorTheme?.hex || '#575757' },
            isSaving && styles.nextBtnDisabled,
          ]}
          onPress={isSubmitted ? handleNext : handleSubmit}
          disabled={isSaving}
        >
          <Text style={styles.nextBtnText}>
            {!isSubmitted
              ? t('common.submit')
              : currentPage < totalPages
                ? t('common.next')
                : quizzes && quizzes.length > 0
                  ? t('learn.lesson.takeQuiz')
                  : t('common.next')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Exit modal */}
      <Modal
        visible={showExitModal}
        transparent
        animationType='fade'
        onRequestClose={() => setShowExitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('learn.lesson.exitActivityTitle')}
            </Text>
            <Text style={styles.modalDesc}>{t('learn.lesson.exitBody')}</Text>

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={handleSaveAndLeave}
            >
              <Text style={styles.modalPrimaryBtnText}>
                {t('learn.lesson.exitSave')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={handleContinue}
            >
              <Text style={styles.modalSecondaryBtnText}>
                {t('learn.lesson.exitActivityContinue')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  container: { paddingHorizontal: 20, paddingBottom: 24 },

  // Page indicator
  pageIndicatorContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  pageIndicator: {
    ...typography.secondary,
    color: '#6B7280',
    fontWeight: '600',
  },

  pageTitle: {
    ...typography.title,
    color: '#000',
    marginBottom: 20,
    textAlign: 'left',
    marginTop: 20,
  },

  instructionsContainer: {
    marginBottom: 15,
  },

  inputFieldsContainer: {
    marginBottom: 30,
    gap: 20,
  },

  inputFieldContainer: {
    gap: 8,
  },

  inputLabel: { ...typography.cardTitle, color: '#374151' },

  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },

  largeInput: {
    minHeight: 100,
    height: 300,
    textAlignVertical: 'top',
  },

  midInput: {
    height: 60,
  },

  smallInput: {
    height: 44,
  },

  answerBoxContainer: {
    backgroundColor: 'transparent', // ← no filled background
    borderLeftWidth: 5,
    borderLeftColor: '#3F3F3F',
    paddingLeft: 15, // Figma
    paddingRight: 0,
    paddingVertical: 0,
    alignSelf: 'center',
    width: 353, // Figma width
    maxWidth: '100%',
    minHeight: 30, // Match one line height (lineHeight: 20), grows with content
    marginTop: 0,
    marginBottom: 30,
  },

  // If you keep a separate title (not typical for this tip style):
  answerBoxTitle: {
    ...typography.secondary,
    color: '#3F3F3F',
    marginBottom: 10,
    fontWeight: '600',
  },

  answerBoxText: {
    ...typography.secondary,
    color: '#F5F5F5',
    fontWeight: '400',
  },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Navigation styles
  navigationContainer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 23,
    paddingVertical: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    gap: 12,
  },
  backBtn: {
    backgroundColor: '#E5E7EB',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
  },
  backBtnText: { ...typography.cardTitle, color: '#374151' },
  nextBtn: {
    backgroundColor: '#575757',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
  },
  nextBtnText: { ...typography.cardTitle, color: '#fff' },
  nextBtnDisabled: {
    opacity: 0.7,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.section,
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDesc: {
    ...typography.secondary,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalPrimaryBtn: {
    width: '100%',
    backgroundColor: '#575757',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalPrimaryBtnText: { ...typography.cardTitle, color: '#fff' },
  modalSecondaryBtn: {
    width: '100%',
    backgroundColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSecondaryBtnText: { ...typography.cardTitle, color: '#000' },
});
