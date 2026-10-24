import { typography } from '@/constants/Typography';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft } from 'lucide-react-native';

import { GiftBoxIcon } from '@/components/giveaway/GiftBoxIcon';
import { SuccessCelebration } from '@/components/giveaway/SuccessCelebration';

import { Theme } from '@/constants/Theme';
import { GIVEAWAY } from '@/constants/Giveaway';
import {
  useGiveawayEntry,
  GIVEAWAY_ENTRY_QUERY_KEY,
} from '@/hooks/giveaway/useGiveawayEntry';
import { submitGiveawayEntry } from '@/services/giveaway/submitGiveawayEntry';
import type { GiveawayEntryInput } from '@/services/giveaway/types';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveCountdown } from '@/components/giveaway/LiveCountdown';

type Step = 'welcome' | 'question' | 'details' | 'success';

interface DetailsErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  skillAnswer?: string;
  consent?: string;
}

const VALIDATION_KEY_MAP: Record<string, string> = {
  short_answer_required: 'giveaway.errors.shortAnswerRequired',
  short_answer_too_long: 'giveaway.errors.shortAnswerTooLong',
  first_name_required: 'giveaway.errors.firstNameRequired',
  last_name_required: 'giveaway.errors.lastNameRequired',
  email_invalid: 'giveaway.errors.emailInvalid',
  skill_answer_required: 'giveaway.errors.skillAnswerRequired',
  skill_answer_incorrect: 'giveaway.errors.skillAnswerIncorrect',
  consent_required: 'giveaway.errors.consentRequired',
};

export default function GiveawayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { capture } = useAnalytics();
  const { data: existingEntry, isLoading: entryLoading } = useGiveawayEntry();

  const [step, setStep] = useState<Step>('welcome');
  const [shortAnswer, setShortAnswer] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skillAnswer, setSkillAnswer] = useState('');
  const [consent, setConsent] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [detailsErrors, setDetailsErrors] = useState<DetailsErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToTop = () =>
    scrollRef.current?.scrollTo({ y: 0, animated: true });

  const clearDetailsError = (field: keyof DetailsErrors) => {
    setDetailsErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // If the user has already entered (e.g. came back to /giveaway after the
  // fact), jump straight to the success state so we never let them re-submit.
  useEffect(() => {
    if (existingEntry && step !== 'success') {
      setStep('success');
    }
  }, [existingEntry, step]);

  // Fire step_viewed when the active step changes.
  useEffect(() => {
    capture(AnalyticsEvents.GIVEAWAY_STEP_VIEWED, { step });
  }, [step, capture]);

  const mutation = useMutation({
    mutationFn: (input: GiveawayEntryInput) => submitGiveawayEntry(input),
    onSuccess: result => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: GIVEAWAY_ENTRY_QUERY_KEY });
        capture(AnalyticsEvents.GIVEAWAY_ENTRY_SUBMITTED, {
          has_phone: phone.trim().length > 0,
          answer_length: shortAnswer.trim().length,
        });
        setStep('success');
      } else {
        if (result.reason === 'validation' && result.message) {
          const key = VALIDATION_KEY_MAP[result.message];
          setSubmitError(key ? t(key) : t('giveaway.errors.submitFailed'));
        } else if (result.reason === 'duplicate') {
          setSubmitError(t('giveaway.errors.duplicate'));
          queryClient.invalidateQueries({
            queryKey: GIVEAWAY_ENTRY_QUERY_KEY,
          });
        } else if (result.reason === 'expired') {
          setSubmitError(t('giveaway.errors.expired'));
        } else {
          setSubmitError(t('giveaway.errors.submitFailed'));
        }
        capture(AnalyticsEvents.GIVEAWAY_ENTRY_FAILED, {
          reason: result.reason,
        });
      }
    },
    onError: () => {
      setSubmitError(t('giveaway.errors.submitFailed'));
      capture(AnalyticsEvents.GIVEAWAY_ENTRY_FAILED, { reason: 'network' });
    },
  });

  const stepOrder: Step[] = useMemo(
    () => ['welcome', 'question', 'details'],
    []
  );
  const currentIndex = stepOrder.indexOf(step);
  const isFinalStep = step === 'details';

  const handleBack = () => {
    setQuestionError(null);
    setDetailsErrors({});
    setSubmitError(null);
    if (step === 'success') {
      router.back();
      return;
    }
    if (step === 'welcome') {
      router.back();
      return;
    }
    const prev = stepOrder[currentIndex - 1];
    if (prev) setStep(prev);
  };

  const validateQuestion = (): boolean => {
    const value = shortAnswer.trim();
    if (!value) {
      setQuestionError(t('giveaway.errors.shortAnswerRequired'));
      scrollToTop();
      return false;
    }
    if (value.length > GIVEAWAY.shortAnswerMaxLength) {
      setQuestionError(t('giveaway.errors.shortAnswerTooLong'));
      scrollToTop();
      return false;
    }
    setQuestionError(null);
    return true;
  };

  /**
   * Collects every invalid field at once so users see all the missing
   * pieces in one pass instead of fixing them one at a time.
   */
  const validateDetails = (): boolean => {
    const errors: DetailsErrors = {};
    if (!firstName.trim()) {
      errors.firstName = t('giveaway.errors.firstNameRequired');
    }
    if (!lastName.trim()) {
      errors.lastName = t('giveaway.errors.lastNameRequired');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = t('giveaway.errors.emailInvalid');
    }
    if (GIVEAWAY.enableSkillQuestion && !skillAnswer.trim()) {
      errors.skillAnswer = t('giveaway.errors.skillAnswerRequired');
    }
    if (!consent) {
      errors.consent = t('giveaway.errors.consentRequired');
    }
    setDetailsErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToTop();
      return false;
    }
    return true;
  };

  const handlePrimary = () => {
    if (step === 'welcome') {
      setStep('question');
      return;
    }
    if (step === 'question') {
      if (validateQuestion()) setStep('details');
      return;
    }
    if (step === 'details') {
      if (!validateDetails()) return;
      setSubmitError(null);
      mutation.mutate({
        shortAnswer: shortAnswer.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        skillAnswer: GIVEAWAY.enableSkillQuestion
          ? skillAnswer.trim()
          : undefined,
        termsAccepted: consent,
      });
      return;
    }
    if (step === 'success') {
      router.back();
    }
  };

  if (entryLoading) {
    return (
      <View style={[styles.root, styles.loadingRoot]}>
        <ActivityIndicator color={Theme.black} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        accessibilityRole='header'
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole='button'
          accessibilityLabel={t('common.back')}
        >
          <ChevronLeft color={Theme.black} size={24} strokeWidth={2.2} />
        </Pressable>
        {step !== 'success' && (
          <Text style={styles.stepIndicator}>
            {Math.min(currentIndex + 1, stepOrder.length)} / {stepOrder.length}
          </Text>
        )}
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          key={step}
          entering={FadeIn.duration(220)}
          style={styles.stepWrap}
        >
          {step === 'welcome' && <WelcomeStep />}
          {step === 'question' && (
            <QuestionStep
              value={shortAnswer}
              onChange={text => {
                setShortAnswer(text);
                if (questionError) setQuestionError(null);
              }}
              error={questionError}
            />
          )}
          {step === 'details' && (
            <DetailsStep
              firstName={firstName}
              lastName={lastName}
              email={email}
              phone={phone}
              skillAnswer={skillAnswer}
              consent={consent}
              onFirstName={v => {
                setFirstName(v);
                clearDetailsError('firstName');
              }}
              onLastName={v => {
                setLastName(v);
                clearDetailsError('lastName');
              }}
              onEmail={v => {
                setEmail(v);
                clearDetailsError('email');
              }}
              onPhone={setPhone}
              onSkillAnswer={v => {
                setSkillAnswer(v);
                clearDetailsError('skillAnswer');
              }}
              onConsentChange={value => {
                setConsent(value);
                clearDetailsError('consent');
              }}
              errors={detailsErrors}
              submitError={submitError}
            />
          )}
          {step === 'success' && (
            <SuccessStep
              firstName={existingEntry?.first_name ?? firstName.trim()}
            />
          )}
        </Animated.View>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <Pressable
          onPress={handlePrimary}
          disabled={mutation.isPending}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !mutation.isPending && styles.primaryButtonPressed,
            mutation.isPending && styles.primaryButtonDisabled,
          ]}
          accessibilityRole='button'
        >
          {mutation.isPending ? (
            <ActivityIndicator color={Theme.white} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {step === 'welcome' && t('giveaway.welcome.cta')}
              {step === 'question' && t('giveaway.question.cta')}
              {step === 'details' && t('giveaway.details.cta')}
              {step === 'success' && t('giveaway.success.cta')}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function WelcomeStep() {
  const { t } = useTranslation();
  const rules = [
    t('giveaway.welcome.rule1'),
    t('giveaway.welcome.rule2'),
    t('giveaway.welcome.rule3'),
    t('giveaway.welcome.rule4'),
  ];
  return (
    <View>
      <View style={styles.liveCountdownWrap}>
        <Text style={styles.countdownLabelInline}>
          {t('giveaway.banner.countdownPrefix')}
        </Text>
        <LiveCountdown />
      </View>
      <View style={styles.prizeIconWrap}>
        <GiftBoxIcon size={44} />
      </View>
      <Text style={styles.title}>{t('giveaway.welcome.title')}</Text>
      <Text style={styles.subtitle}>{t('giveaway.welcome.subtitle')}</Text>
      <Text style={styles.sectionTitle}>
        {t('giveaway.welcome.rulesTitle')}
      </Text>
      <View style={styles.rulesList}>
        {rules.map((rule, idx) => (
          <View key={idx} style={styles.ruleRow}>
            <View style={styles.ruleBullet} />
            <Text style={styles.ruleText}>{rule}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

interface QuestionStepProps {
  value: string;
  onChange: (text: string) => void;
  error: string | null;
}

function QuestionStep({ value, onChange, error }: QuestionStepProps) {
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.title}>{t('giveaway.question.title')}</Text>
      <Text style={styles.prompt}>{t('giveaway.question.prompt')}</Text>
      <TextInput
        style={[styles.textArea, !!error && styles.inputError]}
        value={value}
        onChangeText={onChange}
        placeholder={t('giveaway.question.placeholder')}
        placeholderTextColor={Theme.textInactiveTab}
        multiline
        maxLength={GIVEAWAY.shortAnswerMaxLength}
        textAlignVertical='top'
        accessibilityLabel={t('giveaway.question.prompt')}
      />
      <View style={styles.belowInputRow}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <View />}
        <Text style={styles.charCount}>
          {t('giveaway.question.charCount', { count: value.length })}
        </Text>
      </View>
    </View>
  );
}

interface DetailsStepProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  skillAnswer: string;
  consent: boolean;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onEmail: (v: string) => void;
  onPhone: (v: string) => void;
  onSkillAnswer: (v: string) => void;
  onConsentChange: (v: boolean) => void;
  errors: DetailsErrors;
  submitError: string | null;
}

function DetailsStep({
  firstName,
  lastName,
  email,
  phone,
  skillAnswer,
  consent,
  onFirstName,
  onLastName,
  onEmail,
  onPhone,
  onSkillAnswer,
  onConsentChange,
  errors,
  submitError,
}: DetailsStepProps) {
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.title}>{t('giveaway.details.title')}</Text>

      <FieldLabel>{t('giveaway.details.firstName')}</FieldLabel>
      <TextInput
        style={[styles.textInput, !!errors.firstName && styles.inputError]}
        value={firstName}
        onChangeText={onFirstName}
        autoCapitalize='words'
        autoComplete='given-name'
        textContentType='givenName'
        accessibilityLabel={t('giveaway.details.firstName')}
      />
      <FieldError message={errors.firstName} />

      <FieldLabel>{t('giveaway.details.lastName')}</FieldLabel>
      <TextInput
        style={[styles.textInput, !!errors.lastName && styles.inputError]}
        value={lastName}
        onChangeText={onLastName}
        autoCapitalize='words'
        autoComplete='family-name'
        textContentType='familyName'
        accessibilityLabel={t('giveaway.details.lastName')}
      />
      <FieldError message={errors.lastName} />

      <FieldLabel>{t('giveaway.details.email')}</FieldLabel>
      <TextInput
        style={[styles.textInput, !!errors.email && styles.inputError]}
        value={email}
        onChangeText={onEmail}
        keyboardType='email-address'
        autoCapitalize='none'
        autoComplete='email'
        textContentType='emailAddress'
        accessibilityLabel={t('giveaway.details.email')}
      />
      <FieldError message={errors.email} />

      <FieldLabel>{t('giveaway.details.phone')}</FieldLabel>
      <TextInput
        style={styles.textInput}
        value={phone}
        onChangeText={onPhone}
        keyboardType='phone-pad'
        autoComplete='tel'
        textContentType='telephoneNumber'
        accessibilityLabel={t('giveaway.details.phone')}
      />

      {GIVEAWAY.enableSkillQuestion && (
        <>
          <FieldLabel>{t('giveaway.details.skillQuestion')}</FieldLabel>
          <Text style={styles.skillHelp}>
            {t('giveaway.details.skillQuestionHelp')}
          </Text>
          <View style={styles.skillQuestionBox}>
            <Text style={styles.skillQuestionText}>
              {GIVEAWAY.skillQuestion} = ?
            </Text>
          </View>
          <TextInput
            style={[
              styles.textInput,
              !!errors.skillAnswer && styles.inputError,
            ]}
            value={skillAnswer}
            onChangeText={onSkillAnswer}
            keyboardType='number-pad'
            accessibilityLabel={t('giveaway.details.skillQuestion')}
            accessibilityHint={t('giveaway.details.skillQuestionHelp')}
          />
          <FieldError message={errors.skillAnswer} />
        </>
      )}

      <Pressable
        style={({ pressed }) => [styles.consentRow, pressed && styles.pressed]}
        onPress={() => onConsentChange(!consent)}
        accessibilityRole='checkbox'
        accessibilityState={{ checked: consent }}
      >
        <View
          style={[
            styles.checkbox,
            consent && styles.checkboxChecked,
            !!errors.consent && !consent && styles.checkboxError,
          ]}
        >
          {consent && <Check color={Theme.white} size={14} strokeWidth={3} />}
        </View>
        <Text style={styles.consentText}>{t('giveaway.details.consent')}</Text>
      </Pressable>
      {!!errors.consent && (
        <Text style={[styles.errorText, styles.consentErrorText]}>
          {errors.consent}
        </Text>
      )}

      {!!submitError && (
        <Text style={[styles.errorText, styles.submitErrorText]}>
          {submitError}
        </Text>
      )}
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text style={[styles.errorText, styles.fieldErrorText]}>{message}</Text>
  );
}

function SuccessStep({ firstName }: { firstName: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.successWrap}>
      <SuccessCelebration />
      <Text style={[styles.title, styles.successTitle]}>
        {t('giveaway.success.title')}
      </Text>
      <Text style={[styles.subtitle, styles.successSubtitle]}>
        {firstName
          ? t('giveaway.success.subtitlePersonalized', { name: firstName })
          : t('giveaway.success.subtitle')}
      </Text>
      <View style={styles.successDeadlineCard}>
        <Text style={styles.countdownLabel}>
          {t('giveaway.success.deadlineLabel')}
        </Text>
        <Text style={styles.successDeadlineValue}>
          {t('giveaway.success.deadlineDate')}
        </Text>
      </View>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  loadingRoot: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: Theme.white,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightPlaceholder: {
    width: 36,
    height: 36,
  },
  stepIndicator: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  prizeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { ...typography.title, color: Theme.black, marginBottom: 12 },
  subtitle: {
    ...typography.body,
    color: Theme.textAlternateGray,
    marginBottom: 24,
  },
  prompt: {
    ...typography.body,
    color: Theme.textAlternateGray,
    marginBottom: 16,
  },
  liveCountdownWrap: {
    marginBottom: 28,
  },
  countdownLabelInline: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textAlternateGray,
    letterSpacing: 0.8,
    // Uppercase via presentation, not via .toUpperCase() on the localized
    // string — locales like German have casing rules that JS uppercasing
    // breaks (e.g. ß → SS is not always desired).
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  countdownLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Theme.textAlternateGray,
  },
  sectionTitle: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
    fontWeight: '700',
  },
  rulesList: {
    gap: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ruleBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.black,
    marginTop: 8,
  },
  ruleText: { ...typography.secondary, flex: 1, color: Theme.black },
  textArea: {
    ...typography.body,
    minHeight: 140,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderCard,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Theme.black,
    backgroundColor: Theme.white,
  },
  inputError: {
    borderColor: Theme.destructive,
  },
  belowInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 18,
  },
  charCount: {
    ...typography.caption,
    color: Theme.textInactiveTab,
    fontWeight: '500',
  },
  errorText: {
    ...typography.caption,
    color: Theme.destructive,
    fontWeight: '500',
  },
  fieldErrorText: {
    marginTop: 6,
  },
  consentErrorText: {
    marginTop: 8,
    marginLeft: 34,
  },
  submitErrorText: {
    marginTop: 16,
  },
  fieldLabel: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    marginTop: 18,
    marginBottom: 6,
    fontWeight: '600',
  },
  textInput: {
    ...typography.body,
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: Theme.black,
    backgroundColor: Theme.white,
  },
  skillHelp: {
    ...typography.caption,
    color: Theme.textInactiveTab,
    marginBottom: 8,
  },
  skillQuestionBox: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  skillQuestionText: {
    ...typography.cardTitle,
    color: Theme.black,
    fontVariant: ['tabular-nums'],
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Theme.borderCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Theme.black,
    borderColor: Theme.black,
  },
  checkboxError: {
    borderColor: Theme.destructive,
  },
  consentText: {
    ...typography.secondary,
    flex: 1,
    color: Theme.textAlternateGray,
  },
  successWrap: {
    alignItems: 'center',
    paddingTop: 32,
  },
  successTitle: {
    textAlign: 'center',
  },
  successSubtitle: {
    textAlign: 'center',
  },
  stepWrap: {
    flex: 1,
  },
  successDeadlineCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    alignSelf: 'stretch',
    backgroundColor: Theme.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderCard,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
  },
  successDeadlineValue: { ...typography.cardTitle, color: Theme.black },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderCard,
    backgroundColor: Theme.white,
  },
  primaryButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: Theme.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    backgroundColor: Theme.textAlternateGray,
  },
  primaryButtonText: { ...typography.button, color: Theme.white },
  pressed: {
    opacity: 0.6,
  },
});
