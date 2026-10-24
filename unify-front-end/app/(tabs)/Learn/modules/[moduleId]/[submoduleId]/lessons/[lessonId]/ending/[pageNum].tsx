import { typography } from '@/constants/Typography';
import { categorySymbol } from '@/components/learn/CategorySymbol';
import { saveLessonReview } from '@/services/learn/lessonReviews';
import StructuredLesson from '@/components/learn/StructuredLesson';
import LearnRetry from '@/components/learn/LearnRetry';
import { saveResumePosition } from '@/services/progress/progressService';
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getLessonExitDestination,
  normalizeLearnOrigin,
} from '@/utils/learnOriginNavigation';
import { MaterialIcons } from '@expo/vector-icons';
import { AntDesign } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import StarFilled from '@/components/StarFilled';
import StarOutline from '@/components/StarOutline';
import { Theme } from '@/constants/Theme';

import { useSanityLesson } from '@/hooks/sanity/useSanityLessons';
import { useSanityModule } from '@/hooks/sanity/useSanityModules';
import { useSanitySubmoduleWithLessons } from '@/hooks/sanity/useSanitySubmodules';
import { useSanityLessonQuizzes } from '@/hooks/sanity/useSanityQuizzes';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';
import SubmoduleProgressBar from '@/components/learn/SubmoduleProgressBar';

// Progress related imports
import {
  calculateEndingProgress,
  getLessonTotalPages,
} from '@/utils/submoduleProgress';
import { useLessonProgress } from '@/hooks/progress/useLessonProgress';
import { hasLoadedContentItem } from '@/utils/learnCompletionNavigation';
import { getOrderedLegacyPageNumber } from '@/utils/lessonContentBlocks';
import { useAnalytics } from '@/utils/analytics';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import { useFocusEffect } from '@react-navigation/native';

export default function EndingPageScreen() {
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
  // Joins the lesson visit, so Back to page 1 after a resume here is not a
  // lesson_started.
  const { onLessonScreenFocused } = useLearnEvents();
  useFocusEffect(
    useCallback(() => {
      if (lessonId) onLessonScreenFocused(lessonId);
    }, [lessonId, onLessonScreenFocused])
  );
  const [showExitModal, setShowExitModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const operationPending = useRef(false);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const currentPage = parseInt(pageNum || '1', 10);

  const { data: lesson, isLoading: loadingLesson } = useSanityLesson(
    lessonId || ''
  );
  const orderedPageNumber = getOrderedLegacyPageNumber({
    lesson,
    pageType: 'ending',
    pageNumber: currentPage,
  });
  const {
    data: quizzes,
    isLoading: quizzesLoading,
    error: quizzesError,
  } = useSanityLessonQuizzes(lessonId || '');
  const { data: moduleData } = useSanityModule(moduleId || '');
  const {
    data: submoduleData,
    isLoading: submoduleLoading,
    error: submoduleError,
  } = useSanitySubmoduleWithLessons(submoduleId || '');

  // Progress tracking
  const { saveLessonCompletion } = useLessonProgress();

  // Sort ending pages by order
  const endingPages = lesson?.ending_pages
    ? [...lesson.ending_pages].sort((a, b) => a.order - b.order)
    : [];
  const currentPageData = endingPages[currentPage - 1];
  const currentPageKey = currentPageData?._key;
  const totalPages = endingPages.length;

  // Calculate progress for the progress bar
  const progress = calculateEndingProgress(
    submoduleData || null,
    lessonId || '',
    currentPage
  );

  // Track screen view
  const TRACKING_THROTTLE_MS = 500;
  const lessonTitle = lesson?.title;
  const lastTrackedPageRef = useRef<string>('');
  const lastTrackedRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      if (orderedPageNumber !== undefined) return;
      if (
        !operationPending.current &&
        currentPageKey &&
        lessonId &&
        submoduleId &&
        moduleId
      ) {
        void saveResumePosition(
          lessonId,
          submoduleId,
          moduleId,
          'ending',
          currentPage
        );
      }
      const now = Date.now();
      const pageKey = `${lessonId}-${currentPage}`;
      // Only track if: data is loaded, throttle passed, AND this is a different page than last tracked
      if (
        lessonTitle &&
        now - lastTrackedRef.current > TRACKING_THROTTLE_MS &&
        lastTrackedPageRef.current !== pageKey
      ) {
        trackScreen(
          `Ending Page: ${lessonTitle} - ${currentPage}/${totalPages}`
        );
        lastTrackedRef.current = now;
        lastTrackedPageRef.current = pageKey;
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

  const isLastLesson = () => {
    const currentIndex = getCurrentLessonIndex();
    return currentIndex === (submoduleData?.lessons?.length || 0) - 1;
  };

  const runSaveOperation = async (action: () => Promise<void>) => {
    if (operationPending.current) return;
    operationPending.current = true;
    setIsSaving(true);
    try {
      await action();
    } catch {
      Alert.alert(t('common.somethingWentWrong'), t('common.tryAgain'));
    } finally {
      operationPending.current = false;
      setIsSaving(false);
    }
  };

  const persistCurrentPosition = async () => {
    const saved = await saveResumePosition(
      lessonId,
      submoduleId,
      moduleId,
      'ending',
      currentPage
    );
    if (!saved) throw new Error('Ending resume save failed');
  };

  const handleSaveAndLeave = () =>
    runSaveOperation(async () => {
      await persistCurrentPosition();
      setShowExitModal(false);
      if (origin === 'checklist') {
        router.replace(getLessonExitDestination(origin, '') as any);
        return;
      }
      router.push({
        pathname: '/(tabs)/Learn/modules/[moduleId]/[submoduleId]' as any,
        params: { moduleId, submoduleId },
      });
    });

  const handleContinue = () => {
    if (operationPending.current) return;
    setShowExitModal(false);
  };

  // ---- core "finish this lesson" logic, reused by review modal ----
  // Must be async + awaited: if we navigate before the upsert lands, the
  // submodule index's focus effect reads stale `user_lesson_progress` and shows
  // e.g. 83% instead of Completed. The cached-progress refresh inside
  // saveLessonCompletion also needs to finish before we leave, so the next
  // focus picks up the fresh cache.
  const completeLessonAndNavigate = async () => {
    // Canonical total-page count for user_lesson_progress — must match every
    // other save site so completed_pages / total_pages is stable.
    const totalAllPages = getLessonTotalPages(lesson, quizzes);

    await persistCurrentPosition();
    const didSave = await saveLessonCompletion(
      lessonId || '',
      submoduleId || '',
      moduleId || '',
      totalAllPages
    );
    if (!didSave) throw new Error('Lesson completion save failed');
    setShowReviewModal(false);

    // Navigate: either back to submodule index (last lesson) or to next lesson
    if (isLastLesson()) {
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
  };

  const handleNext = async () => {
    if (operationPending.current) return;
    if (currentPage < totalPages) {
      // Go to next ending page
      router.push({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/ending/[pageNum]' as any,
        params: {
          moduleId,
          submoduleId,
          lessonId,
          pageNum: (currentPage + 1).toString(),
          ...originParams,
        },
      });
    } else {
      // We're on the final ending page: show review bottom sheet
      setRating(null);
      setComment('');
      setShowReviewModal(true);
    }
  };

  const handleBack = () => {
    if (operationPending.current) return;
    if (currentPage > 1) {
      // Go to previous ending page
      router.push({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/ending/[pageNum]' as any,
        params: {
          moduleId,
          submoduleId,
          lessonId,
          pageNum: (currentPage - 1).toString(),
          ...originParams,
        },
      });
    } else {
      // First ending page, go back to last quiz/activity/lesson page
      if (quizzes && quizzes.length > 0) {
        const sortedQuizzes = [...quizzes].sort(
          (a, b) => a.order_number - b.order_number
        );
        const lastQuiz = sortedQuizzes[sortedQuizzes.length - 1];
        const lastQuizQuestions = lastQuiz.questions?.length || 1;
        router.push({
          pathname:
            '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/quizzes/[quizId]/pages/[questionNum]' as any,
          params: {
            moduleId,
            submoduleId,
            lessonId,
            quizId: lastQuiz._id,
            questionNum: lastQuizQuestions.toString(),
            ...originParams,
          },
        });
      } else if (lesson?.activity_pages && lesson.activity_pages.length > 0) {
        router.push({
          pathname:
            '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/activities/[pageNum]' as any,
          params: {
            moduleId,
            submoduleId,
            lessonId,
            pageNum: lesson.activity_pages.length.toString(),
            ...originParams,
          },
        });
      } else {
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
        }
      }
    }
  };

  // --- review actions ---
  const handleSubmitReview = () => {
    if (!rating) return;
    return runSaveOperation(async () => {
      await saveLessonReview(lessonId, rating, comment);
      await completeLessonAndNavigate();
    });
  };

  const handleSkipReview = () => runSaveOperation(completeLessonAndNavigate);

  if (loadingLesson || quizzesLoading || submoduleLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text>{t('learn.lesson.loadingEnding')}</Text>
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
          <Text>{t('learn.lesson.errorLoadingEnding')}</Text>
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
        submoduleTitle={submoduleData?.title || 'Submodule'}
        submoduleOrder={submoduleData?.order || 1}
        onClose={() => setShowExitModal(true)}
        colorHex={categorySymbol(moduleId).foreground}
      />

      <StructuredLesson
        key={`${submoduleId}-${currentPage}`}
        title={currentPageData.title || ''}
        sections={[
          {
            _key: currentPageData._key || 'content',
            _type: 'lessonConcept',
            content: currentPageData.content || [],
          },
        ]}
        markDefs={currentPageData.markDefs}
        highlights={[]}
        onScrollBeginDrag={() => {}}
      />

      {/* Navigation buttons - anchored at bottom */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.nextBtn,
            { backgroundColor: '#191919' },
            isSaving && styles.nextBtnDisabled,
          ]}
          onPress={handleNext}
          disabled={isSaving}
        >
          <Text style={styles.nextBtnText}>{t('common.next')}</Text>
        </TouchableOpacity>
      </View>

      {/* Exit modal */}
      <Modal
        visible={showExitModal}
        transparent
        animationType='fade'
        onRequestClose={handleContinue}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('learn.lesson.exitTitle')}</Text>
            <Text style={styles.modalDesc}>
              {t('learn.lesson.exitBody1')}
              {'\n'}
              {t('learn.lesson.exitBody2')}
            </Text>

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              disabled={isSaving}
              onPress={handleSaveAndLeave}
            >
              <Text style={styles.modalPrimaryBtnText}>
                {t('learn.lesson.exitSave')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              disabled={isSaving}
              onPress={handleContinue}
            >
              <Text style={styles.modalSecondaryBtnText}>
                {t('learn.lesson.exitContinue')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* REVIEW BOTTOM SHEET */}
      <Modal
        visible={showReviewModal}
        transparent
        animationType='slide'
        onRequestClose={handleSkipReview}
      >
        <TouchableWithoutFeedback accessible={false} onPress={handleSkipReview}>
          <KeyboardAvoidingView
            style={styles.reviewOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableWithoutFeedback accessible={false} onPress={() => {}}>
              <ScrollView
                style={{ maxHeight: '90%', flexGrow: 0 }}
                contentContainerStyle={styles.reviewContainer}
                keyboardShouldPersistTaps='handled'
                keyboardDismissMode='interactive'
                accessibilityViewIsModal
              >
                <View style={styles.reviewHandle} />

                <Text style={styles.reviewTitle}>
                  {t('learn.lesson.reviewTitle')}
                </Text>

                {/* stars */}
                <View
                  style={[
                    styles.reviewStarsRow,
                    rating === null
                      ? styles.starsSpacingNoComment
                      : styles.starsSpacingWithComment,
                  ]}
                >
                  {[1, 2, 3, 4, 5].map(i => {
                    const selected = rating !== null && i <= rating;

                    return (
                      <TouchableOpacity
                        key={i}
                        accessibilityRole='radio'
                        accessibilityLabel={t('learn.lesson.reviewRating', {
                          count: i,
                        })}
                        accessibilityState={{
                          checked: rating === i,
                          disabled: isSaving,
                        }}
                        activeOpacity={0.8}
                        disabled={isSaving}
                        onPress={() => setRating(i)}
                        style={styles.starTouch}
                      >
                        {selected ? (
                          <StarFilled
                            size={40}
                            color={moduleData?.colorTheme?.hex || '#575757'}
                          />
                        ) : (
                          <StarOutline size={40} color='#B4B1B1' />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* comment box appears after selecting rating */}
                {rating !== null && (
                  <View style={styles.commentBox}>
                    <TextInput
                      style={styles.commentInput}
                      accessibilityLabel={t('learn.lesson.reviewPlaceholder')}
                      multiline
                      placeholder={t('learn.lesson.reviewPlaceholder')}
                      placeholderTextColor='#878787'
                      maxLength={2000}
                      editable={!isSaving}
                      value={comment}
                      onChangeText={setComment}
                      textAlignVertical='top'
                    />
                  </View>
                )}

                {/* submit button */}
                <TouchableOpacity
                  style={[
                    styles.reviewSubmitBtn,
                    {
                      backgroundColor:
                        moduleData?.colorTheme?.hex || Theme.primaryGatherRed,
                    },
                  ]}
                  accessibilityRole='button'
                  accessibilityState={{
                    disabled: isSaving || rating === null,
                    busy: isSaving,
                  }}
                  disabled={isSaving || rating === null}
                  onPress={handleSubmitReview}
                >
                  <Text style={styles.reviewSubmitText}>
                    {t('common.submit')}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingHorizontal: 20, paddingBottom: 100 },

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
    textAlign: 'center',
    marginTop: 20,
  },

  content: {
    gap: 25,
    marginBottom: 30,
  },
  contentText: { ...typography.reading, color: '#424242', marginBottom: 10 },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Navigation styles
  navigationContainer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    gap: 12,
  },
  backBtn: {
    backgroundColor: '#E6E6E6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
  },
  backBtnText: { ...typography.cardTitle, color: '#374151' },
  nextBtn: {
    backgroundColor: '#1A1919',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
  },
  nextBtnText: { ...typography.cardTitle, color: '#fff' },
  nextBtnDisabled: {
    opacity: 0.7,
  },

  // Exit modal styles
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

  // REVIEW SHEET
  reviewOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  reviewContainer: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 13,
    paddingBottom: 10,
    paddingHorizontal: 19,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    minHeight: 230,
  },
  reviewHandle: {
    alignSelf: 'center',
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 18,
  },
  reviewTitle: {
    ...typography.title,
    alignSelf: 'center',
    width: '100%',
    textAlign: 'center',
    color: '#000000',
    marginBottom: 25,
    marginTop: 18,
    letterSpacing: 1.2,
  },
  reviewStarsRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8, // closer stars
  },

  starsSpacingNoComment: {
    marginBottom: 35, // <- Figma ~40
  },
  starsSpacingWithComment: {
    marginBottom: 20, // <- cuando aparece comment box, el espacio baja
  },

  starBoxSelected: {
    borderColor: Theme.primaryGatherRed,
  },
  starTouch: {
    paddingHorizontal: 15,
    paddingVertical: 5, // touch-friendly area without visual box
  },
  commentBox: {
    width: '100%',
    height: 130,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3F3F3F',
    backgroundColor: '#FFFFFF',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignSelf: 'center',
    marginBottom: 25,
  },
  commentInput: {
    ...typography.body,
    flex: 1,
    color: '#000000',
    textAlignVertical: 'top',
  },
  reviewSubmitBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: 10,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 45,
  },
  reviewSubmitText: { ...typography.button, color: '#FFFFFF' },
});
