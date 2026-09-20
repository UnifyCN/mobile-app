import { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export interface QuizSelections {
  goal: string | null;
  topics: string[];
}

interface MatchingOnboardingQuizProps {
  onComplete: (selections: QuizSelections) => Promise<void> | void;
  onClose: () => void;
  isSubmitting?: boolean;
}

const TOTAL_STEPS = 3;

// Orange theme colors from Figma
const COLORS = {
  primary: '#ff9b3d', // Orange (button, selected states)
  primaryLight: '#ffdfc1', // Light orange (icon backgrounds)
  primaryDark: '#ff820b', // Dark orange (icon color)
  headerBg: '#ff9d40', // Header background orange
  headerIconBg: '#ffcea0', // Header icon circle background
  text: '#000000', // Black text
  textSecondary: '#6B7280',
  border: '#c4c4c4', // Gray border
  radioBorder: '#d0d0d0', // Radio border
  white: '#FFFFFF',
  success: '#10B981',
  successLight: '#ECFDF5',
};

// Question data for each step. `value` fields are persisted to Supabase, so
// they stay in English; only the label keys are translated at render time.
const QUESTION_DATA = {
  1: {
    icon: 'group-add',
    titleKey: 'circles.quiz.step1Title',
    subtitleKey: 'circles.quiz.step1Subtitle',
  },
  2: {
    icon: 'chat-bubble',
    titleKey: 'circles.quiz.step2Title',
    subtitleKey: 'circles.quiz.step2Subtitle',
  },
  3: {
    icon: 'check-circle',
    titleKey: 'circles.quiz.step3Title',
    subtitleKey: 'circles.quiz.step3Subtitle',
  },
};

const goalOptions = [
  {
    value: 'make_friends',
    labelKey: 'circles.quiz.goals.make_friends',
    icon: 'group-add',
  },
  {
    value: 'practice_english',
    labelKey: 'circles.quiz.goals.practice_english',
    icon: 'chat-bubble',
  },
  {
    value: 'job_search',
    labelKey: 'circles.quiz.goals.job_search',
    icon: 'work',
  },
  {
    value: 'wellness',
    labelKey: 'circles.quiz.goals.wellness',
    icon: 'emoji-emotions',
  },
];

const topicOptions = [
  {
    value: 'immigration',
    labelKey: 'circles.quiz.topics.immigration',
    icon: 'description',
  },
  { value: 'housing', labelKey: 'circles.quiz.topics.housing', icon: 'home' },
  {
    value: 'finances',
    labelKey: 'circles.quiz.topics.finances',
    icon: 'account-balance',
  },
  {
    value: 'community',
    labelKey: 'circles.quiz.topics.community',
    icon: 'groups',
  },
  {
    value: 'career',
    labelKey: 'circles.quiz.topics.career',
    icon: 'trending-up',
  },
];

// Selection card component
function SelectionCard({
  label,
  icon,
  selected,
  onPress,
  multiSelect = false,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
  multiSelect?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.selectionCard, selected && styles.selectionCardSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.selectionIcon}>
        <MaterialIcons
          name={icon as any}
          size={20}
          color={COLORS.primaryDark}
        />
      </View>
      <Text style={styles.selectionLabel}>{label}</Text>
      <View
        style={[
          multiSelect ? styles.checkbox : styles.radio,
          selected &&
            (multiSelect ? styles.checkboxSelected : styles.radioSelected),
        ]}
      >
        {selected &&
          (multiSelect ? (
            <Feather name='check' size={14} color={COLORS.white} />
          ) : null)}
      </View>
    </TouchableOpacity>
  );
}

// Orange header banner component
function QuestionHeader({
  step,
  onClose,
}: {
  step: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const questionData = QUESTION_DATA[step as keyof typeof QUESTION_DATA];
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.orangeHeader, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={onClose}
        activeOpacity={0.7}
      >
        <Feather name='x' size={24} color={COLORS.white} />
      </TouchableOpacity>

      <View style={styles.headerContent}>
        <View style={styles.headerIconCircle}>
          <MaterialIcons
            name={questionData.icon as any}
            size={20}
            color={COLORS.white}
          />
        </View>
        <Text style={styles.headerTitle}>{t(questionData.titleKey)}</Text>
        <Text style={styles.headerSubtitle}>{t(questionData.subtitleKey)}</Text>
      </View>
    </View>
  );
}

export function MatchingOnboardingQuiz({
  onComplete,
  onClose,
  isSubmitting,
}: MatchingOnboardingQuizProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});

  // Animation for step transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateTransition = (callback: () => void) => {
    // Execute callback in the middle of the animation (after fade out, before fade in)
    // Using animation completion callbacks instead of setTimeout to prevent
    // callback from firing after component unmount
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = () => {
    if (step === 1 && !goal) {
      setErrors({ 1: t('circles.quiz.errorPickGoal') });
      return;
    }
    if (step === 2 && topics.length === 0) {
      setErrors({ 2: t('circles.quiz.errorPickTopic') });
      return;
    }
    setErrors({});
    animateTransition(() => setStep(prev => Math.min(prev + 1, TOTAL_STEPS)));
  };

  const handleBack = () => {
    if (step === 1) return;
    setErrors({});
    animateTransition(() => setStep(prev => Math.max(prev - 1, 1)));
  };

  const toggleTopic = (value: string) => {
    setTopics(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
    setErrors({});
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stepContentContainer}
          >
            <View style={styles.optionsContainer}>
              {goalOptions.map(option => (
                <SelectionCard
                  key={option.value}
                  label={t(option.labelKey)}
                  icon={option.icon}
                  selected={goal === option.value}
                  onPress={() => {
                    setGoal(option.value);
                    setErrors({});
                  }}
                />
              ))}
            </View>
            {errors[1] && <Text style={styles.errorText}>{errors[1]}</Text>}
          </ScrollView>
        );

      case 2:
        return (
          <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stepContentContainer}
          >
            <View style={styles.optionsContainer}>
              {topicOptions.map(option => (
                <SelectionCard
                  key={option.value}
                  label={t(option.labelKey)}
                  icon={option.icon}
                  selected={topics.includes(option.value)}
                  onPress={() => toggleTopic(option.value)}
                  multiSelect
                />
              ))}
            </View>
            {topics.length > 0 && (
              <View style={styles.selectedCount}>
                <Feather name='check-circle' size={16} color={COLORS.success} />
                <Text style={styles.selectedCountText}>
                  {t('circles.quiz.topicsSelected', { count: topics.length })}
                </Text>
              </View>
            )}
            {errors[2] && <Text style={styles.errorText}>{errors[2]}</Text>}
          </ScrollView>
        );

      case 3:
        return (
          <View style={styles.completionContainer}>
            <View style={styles.completionIconContainer}>
              <View style={styles.completionIconRing} />
              <View style={styles.completionIconCircle}>
                <Feather name='check' size={32} color={COLORS.white} />
              </View>
            </View>
            <Text style={styles.completionTitle}>
              {t('circles.quiz.step3Title')}
            </Text>
            <Text style={styles.completionSubtitle}>
              {t('circles.quiz.completionSubtitle')}
            </Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                {t('circles.quiz.summaryLabel')}
              </Text>
              <View style={styles.summaryRow}>
                <MaterialIcons
                  name='group-add'
                  size={16}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.summaryText}>
                  {(() => {
                    const selected = goalOptions.find(g => g.value === goal);
                    return selected
                      ? t(selected.labelKey)
                      : t('circles.quiz.notSelected');
                  })()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <MaterialIcons
                  name='chat-bubble'
                  size={16}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.summaryText}>
                  {t('circles.quiz.topicsToDiscuss', { count: topics.length })}
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.root}>
      {/* Orange header banner */}
      <QuestionHeader step={step} onClose={onClose} />

      {/* Animated step content */}
      <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim }]}>
        {renderStep()}
      </Animated.View>

      {/* Footer with navigation buttons */}
      <View style={styles.footer}>
        {step < TOTAL_STEPS ? (
          <View style={styles.buttonRow}>
            {step > 1 ? (
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Feather name='arrow-left' size={20} color={COLORS.text} />
                <Text style={styles.backButtonText}>{t('common.back')}</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>{t('common.next')}</Text>
              <Feather name='arrow-right' size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => onComplete({ goal, topics })}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.joinButtonText}>
                  {t('circles.quiz.joinWaitingRoom')}
                </Text>
                <Feather name='arrow-right' size={18} color={COLORS.white} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  // Orange header banner
  orangeHeader: {
    backgroundColor: COLORS.headerBg,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  closeButton: {
    position: 'absolute',
    left: 20,
    zIndex: 1,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 16,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 100,
    backgroundColor: COLORS.headerIconBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 10,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  // Content
  contentWrapper: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
  },
  stepContentContainer: {
    paddingHorizontal: 30,
    paddingTop: 24,
    paddingBottom: 24,
  },
  // Options
  optionsContainer: {
    gap: 16,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: 12,
  },
  selectionCardSelected: {
    borderColor: COLORS.primary,
  },
  selectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  // Radio & Checkbox
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.radioBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.radioBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  // Selected count
  selectedCount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  selectedCountText: {
    fontSize: 16,
    color: COLORS.success,
    fontWeight: '500',
  },
  // Error
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  // Completion
  completionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  completionIconContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  completionIconRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.successLight,
  },
  completionIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  completionSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  // Footer
  footer: {
    paddingHorizontal: 40,
    paddingTop: 16,
    paddingBottom: 34,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.white,
    gap: 12,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    minHeight: 52,
    borderRadius: 12,
    gap: 12,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
