import { typography } from '@/constants/Typography';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/Theme';
import OnboardingProgress from './OnboardingProgress';
import WelcomeStep from './WelcomeStep';
import SingleSelectQuestion from './SingleSelectQuestion';
import FloatingTagSelect from './FloatingTagSelect';
import OutcomesStep from './OutcomesStep';
import ThankYouStep from './ThankYouStep';
import LocationStep from './LocationStep';
import { useSaveOnboardingProfile } from '@/hooks/onboarding/useSaveOnboardingProfile';
import { supabase } from '@/lib/supabase';
import MonthPicker from './MonthPicker';
import {
  Persona,
  ReferralSource,
  Goal,
  LearningInterest,
  Hobby,
} from '@/types/onboardingProfile';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';
import { registerForPushNotifications } from '@/services/push/pushNotifications';
import { requestStoreReview } from '@/utils/storeReview';
import { useInviteCode } from '@/context/InviteCodeContext';
import { InviteCodeField } from '@/components/referrals/InviteCodeField';
import { isInviteCode } from '@/utils/inviteLink';
import { updateFirstName } from '@/services/users/updateFirstName';

interface OnboardingQuizProps {
  onComplete: () => void;
  isRedo?: boolean;
  prefilledName?: string | null;
}

const TOTAL_STEPS = 11;

const STEP_NAMES: Record<number, string> = {
  1: 'welcome',
  2: 'persona',
  3: 'referral_source',
  4: 'arrival_date',
  5: 'location',
  6: 'goals',
  7: 'learning_interests',
  8: 'hobbies',
  9: 'reminders',
  10: 'outcomes',
  11: 'thank_you',
};

export default function OnboardingQuiz({
  onComplete,
  isRedo = false,
  prefilledName = null,
}: OnboardingQuizProps) {
  const { t } = useTranslation();
  const saveMutation = useSaveOnboardingProfile();
  const {
    trackOnboardingStepCompleted,
    trackOnboardingCompleted,
    trackPushPermissionPrompted,
    trackPushPermissionGranted,
    trackPushPermissionDenied,
    capture,
  } = useAnalytics();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inviteCtx = useInviteCode();

  const [currentStep, setCurrentStep] = useState(1);
  const [firstName, setFirstName] = useState<string>(prefilledName ?? '');

  // Form state
  const [persona, setPersona] = useState<Persona | null>(null);
  const [personaOther, setPersonaOther] = useState<string | null>(null);
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(
    null
  );
  const [referralSourceOther, setReferralSourceOther] = useState<string | null>(
    null
  );
  const [arrivalDate, setArrivalDate] = useState<Date | null>(null);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsOther, setGoalsOther] = useState<string | null>(null);
  const [learningInterests, setLearningInterests] = useState<
    LearningInterest[]
  >([]);
  const [learningInterestsOther, setLearningInterestsOther] = useState<
    string | null
  >(null);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [wantsReminders, setWantsReminders] = useState<boolean | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);

  // Invite code state — pre-fills from clipboard context if present, also editable.
  const [inviteCodeInput, setInviteCodeInput] = useState<string>('');
  const [inviteCodeAutoFilled, setInviteCodeAutoFilled] = useState(false);

  // When clipboard context detects a code, surface it in step 3.
  useEffect(() => {
    if (inviteCtx.code && inviteCtx.source === 'clipboard') {
      setInviteCodeInput(inviteCtx.code);
      setInviteCodeAutoFilled(true);
      // Suggest the source so the user doesn't have to pick.
      setReferralSource(prev => prev ?? 'friends_family');
    }
  }, [inviteCtx.code, inviteCtx.source]);

  // Validation errors
  const [errors, setErrors] = useState<Record<number, string>>({});

  const buildArrivalDate = () => {
    if (!arrivalDate) return null;
    return new Date(
      Date.UTC(arrivalDate.getFullYear(), arrivalDate.getMonth(), 1)
    ).toISOString();
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<number, string> = {};

    switch (step) {
      case 1: // First name
        if (!firstName.trim()) {
          newErrors[1] = t('quiz.errors.firstNameRequired');
          setErrors(newErrors);
          return false;
        }
        break;
      case 2: // Persona
        if (!persona) {
          newErrors[2] = t('quiz.errors.selectOption');
          setErrors(newErrors);
          return false;
        }
        if (persona === 'other' && !personaOther?.trim()) {
          newErrors[2] = t('quiz.errors.specifySituation');
          setErrors(newErrors);
          return false;
        }
        break;
      case 3: // Referral Source
        if (!referralSource) {
          newErrors[3] = t('quiz.errors.selectOption');
          setErrors(newErrors);
          return false;
        }
        if (referralSource === 'other' && !referralSourceOther?.trim()) {
          newErrors[3] = t('quiz.errors.specifyReferral');
          setErrors(newErrors);
          return false;
        }
        break;
      case 4: // Arrival date
        if (!arrivalDate) {
          newErrors[4] = t('quiz.errors.selectMonthYear');
          setErrors(newErrors);
          return false;
        }
        break;
      case 5: // Location
        if (!city) {
          newErrors[5] = t('quiz.errors.selectCity');
          setErrors(newErrors);
          return false;
        }
        if (!province) {
          newErrors[5] = t('quiz.errors.selectProvince');
          setErrors(newErrors);
          return false;
        }
        break;
      case 6: // Goals
        if (goals.length === 0) {
          newErrors[6] = t('quiz.errors.selectAtLeastOne');
          setErrors(newErrors);
          return false;
        }
        if (goals.includes('something_else') && !goalsOther?.trim()) {
          newErrors[6] = t('quiz.errors.specifyGoal');
          setErrors(newErrors);
          return false;
        }
        break;
      case 7: // Learning Interests
        if (learningInterests.length === 0) {
          newErrors[7] = t('quiz.errors.selectAtLeastOne');
          setErrors(newErrors);
          return false;
        }
        if (
          learningInterests.includes('other') &&
          !learningInterestsOther?.trim()
        ) {
          newErrors[7] = t('quiz.errors.specifyInterest');
          setErrors(newErrors);
          return false;
        }
        break;
      case 8: // Hobbies (optional, no validation)
        break;
      case 9: // Reminders
        if (wantsReminders === null) {
          newErrors[9] = t('quiz.errors.selectOption');
          setErrors(newErrors);
          return false;
        }
        break;
    }

    setErrors({});
    return true;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      return;
    }

    trackOnboardingStepCompleted(
      currentStep,
      STEP_NAMES[currentStep] || `step_${currentStep}`
    );

    // Always request push permission at step 9 (reminders) — social notifications always send.
    // The reminders toggle only controls learn reminders (server-side).
    // This is where nearly every user first sees the system dialog, so the
    // outcome must be tracked here — usePushNotifications only sees the
    // already-decided status afterwards and never reports a grant.
    if (currentStep === 9) {
      registerForPushNotifications()
        .then(result => {
          if (result.permission === 'unsupported' || !result.prompted) return;
          trackPushPermissionPrompted({ prompted_in: 'onboarding' });
          if (result.permission === 'granted') {
            trackPushPermissionGranted({ prompted_in: 'onboarding' });
          } else if (result.permission === 'denied') {
            trackPushPermissionDenied({ prompted_in: 'onboarding' });
          }
        })
        .catch(err => {
          console.error('Push registration from onboarding failed:', err);
        });
    }

    // Request iOS App Store review after Outcomes step (peak positive sentiment)
    if (currentStep === 10 && !isRedo) {
      requestStoreReview();
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      // Clear error for previous step
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[currentStep];
        return newErrors;
      });
    }
  };

  const handleSubmit = async () => {
    // Get user ID directly from Supabase auth (more reliable than UserContext)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('No authenticated user found:', authError);
      Alert.alert(t('common.error'), t('quiz.errors.signInRequired'));
      return;
    }

    if (!validateStep(currentStep)) {
      return;
    }

    const arrivalDate = buildArrivalDate();

    try {
      // Only attempt to redeem when the user actually selected friends_family AND
      // the typed/auto-filled code passes the canonical validator (alphabet
      // matches the SQL generator: A-Z minus I/O, digits 2-9). Use the shared
      // isInviteCode helper rather than an inline regex to keep client + edge
      // fn + DB in lockstep.
      const trimmedCode = inviteCodeInput.trim().toUpperCase();
      const inviteExtras =
        referralSource === 'friends_family' && isInviteCode(trimmedCode)
          ? {
              inviteCode: {
                code: trimmedCode,
                source: inviteCodeAutoFilled
                  ? ('clipboard' as const)
                  : ('manual' as const),
              },
            }
          : undefined;

      // Persist first_name on public.users (separate from user_onboarding_profiles).
      // Non-blocking failure: the user can re-enter their name from Account Settings.
      // Must run BEFORE the profile save: the save opens the AuthWrapper gate, and
      // useOtaUpdates in AppContent can then reload the bundle and cut off any await.
      try {
        const firstNameResult = await updateFirstName(firstName);
        if (!firstNameResult.success) {
          console.warn(
            '[onboarding] updateFirstName failed:',
            firstNameResult.code,
            firstNameResult.message
          );
        }
      } catch (err) {
        console.warn('[onboarding] updateFirstName threw:', err);
      }

      const result = await saveMutation.mutateAsync({
        userId: user.id,
        data: {
          persona,
          persona_other: personaOther,
          referral_source: referralSource,
          referral_source_other: referralSourceOther,
          arrival_date: arrivalDate,
          city,
          province,
          goals,
          goals_other: goalsOther,
          learning_interests: learningInterests,
          learning_interests_other: learningInterestsOther,
          hobbies,
          wants_reminders: wantsReminders ?? false,
          onboarding_completed: true,
        },
        extras: inviteExtras,
      });

      trackOnboardingCompleted(persona);

      // Always clear the in-memory clipboard code regardless of redeem outcome
      // so it can't leak into a future flow (e.g. redo-onboarding) and trigger
      // an unintended re-redeem attempt.
      inviteCtx.clear();

      // If redeem succeeded, route the user to the welcome moment instead of home.
      if (result.redeem?.success) {
        // Send only non-PII attributes — the inviter↔invitee join lives server-side
        // (via the referrals row) and shouldn't be re-emitted from the invitee's device.
        capture(AnalyticsEvents.INVITE_REDEEMED, {
          source: inviteExtras?.inviteCode.source ?? 'manual',
        });
        // Auto-follow happened server-side as part of redeem; emit a client-side
        // signal so the referral funnel can include it without a server roundtrip.
        // Defensive: don't let a missing inviter id throw and abort the redeem flow.
        const inviterId = result.redeem.inviter?.id;
        if (inviterId) {
          capture(AnalyticsEvents.REFERRAL_AUTO_FOLLOW_COMPLETED, {
            referrer_user_id: inviterId,
          });
        }
        router.replace('/welcome-from-inviter' as any);
        return; // do NOT call onComplete; welcome screen handles its own dismiss
      }

      // Redeem failed (or no code at all) — log and proceed to normal completion.
      if (result.redeem && !result.redeem.success) {
        capture(AnalyticsEvents.INVITE_REDEEM_FAILED, {
          reason: result.redeem.reason,
        });
      }

      onComplete();
    } catch (error) {
      console.error('Error saving onboarding profile:', error);
      Alert.alert(t('common.error'), t('quiz.errors.saveFailed'), [
        { text: t('common.ok') },
      ]);
    }
  };

  const toggleGoal = (goal: Goal) => {
    setGoals(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
    if (goal === 'something_else' && goals.includes('something_else')) {
      setGoalsOther(null);
    }
  };

  const toggleLearningInterest = (interest: LearningInterest) => {
    setLearningInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
    if (interest === 'other' && learningInterests.includes('other')) {
      setLearningInterestsOther(null);
    }
  };

  const toggleHobby = (hobby: Hobby) => {
    setHobbies(prev =>
      prev.includes(hobby) ? prev.filter(h => h !== hobby) : [...prev, hobby]
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <WelcomeStep
            onNext={handleNext}
            isRedo={isRedo}
            firstName={firstName}
            onChangeFirstName={setFirstName}
            error={errors[1]}
          />
        );
      case 2:
        return (
          <SingleSelectQuestion
            question={t('quiz.q.persona')}
            options={[
              {
                value: 'international_student',
                label: t('quiz.options.persona.internationalStudent'),
              },
              {
                value: 'skilled_worker',
                label: t('quiz.options.persona.skilledWorker'),
              },
              {
                value: 'refugee',
                label: t('quiz.options.persona.refugee'),
              },
              {
                value: 'other',
                label: t('quiz.options.persona.other'),
                hasOther: true,
              },
            ]}
            selectedValue={persona}
            otherValue={personaOther}
            onSelect={value => setPersona(value as Persona)}
            onOtherChange={setPersonaOther}
            required
            error={errors[2]}
          />
        );
      case 3:
        return (
          <View>
            <SingleSelectQuestion
              question={t('quiz.q.referralSource')}
              options={[
                {
                  value: 'facebook_instagram',
                  label: t('quiz.options.referral.facebookInstagram'),
                },
                {
                  value: 'google_search',
                  label: t('quiz.options.referral.googleSearch'),
                },
                {
                  value: 'app_store',
                  label: t('quiz.options.referral.appStore'),
                },
                {
                  value: 'friends_family',
                  label: t('quiz.options.referral.friendsFamily'),
                },
                {
                  value: 'news_article',
                  label: t('quiz.options.referral.newsArticle'),
                },
                { value: 'tiktok', label: t('quiz.options.referral.tiktok') },
                {
                  value: 'other',
                  label: t('quiz.options.referral.other'),
                  hasOther: true,
                },
              ]}
              selectedValue={referralSource}
              otherValue={referralSourceOther}
              onSelect={value => setReferralSource(value as ReferralSource)}
              onOtherChange={setReferralSourceOther}
              required
              error={errors[3]}
            />
            {referralSource === 'friends_family' ? (
              <>
                <InviteCodeField
                  value={inviteCodeInput}
                  onChange={next => {
                    setInviteCodeInput(next);
                    // Once the user types, it's no longer "auto-filled."
                    if (inviteCodeAutoFilled) setInviteCodeAutoFilled(false);
                  }}
                  autoFilled={inviteCodeAutoFilled}
                />
                {/* Spacer so the OTP boxes can scroll well above the keyboard. */}
                <View style={styles.inviteCodeBottomSpacer} />
              </>
            ) : null}
          </View>
        );
      case 4:
        return (
          <View style={styles.container}>
            <Text style={styles.question}>{t('quiz.q.arrivalDate')}</Text>

            {errors[4] && <Text style={styles.errorText}>{errors[4]}</Text>}

            <MonthPicker
              value={arrivalDate}
              onChange={date => setArrivalDate(date)}
              minimumDate={new Date(new Date().getFullYear() - 20, 0)}
              maximumDate={new Date(new Date().getFullYear() + 10, 11)}
            />
          </View>
        );
      case 5:
        return (
          <LocationStep
            selectedCity={city}
            selectedProvince={province}
            onCityChange={setCity}
            onProvinceChange={setProvince}
            error={errors[5]}
          />
        );
      case 6:
        return (
          <FloatingTagSelect
            question={t('quiz.q.goals')}
            options={[
              {
                value: 'learn_something',
                label: t('quiz.options.goals.learnSomething'),
                icon: 'book-open',
              },
              {
                value: 'build_community',
                label: t('quiz.options.goals.buildCommunity'),
                icon: 'users',
              },
              {
                value: 'quick_answers',
                label: t('quiz.options.goals.quickAnswers'),
                icon: 'zap',
              },
              {
                value: 'something_else',
                label: t('quiz.options.goals.somethingElse'),
                icon: 'more-horizontal',
                hasOther: true,
              },
            ]}
            selectedValues={goals}
            otherValue={goalsOther}
            onToggle={value => toggleGoal(value as Goal)}
            onOtherChange={setGoalsOther}
            required
            error={errors[6]}
          />
        );
      case 7:
        return (
          <FloatingTagSelect
            question={t('quiz.q.interests')}
            options={[
              {
                value: 'documents',
                label: t('quiz.options.interests.documents'),
                icon: 'file-text',
              },
              {
                value: 'employment',
                label: t('quiz.options.interests.employment'),
                icon: 'briefcase',
              },
              {
                value: 'finance',
                label: t('quiz.options.interests.finance'),
                icon: 'credit-card',
              },
              {
                value: 'housing',
                label: t('quiz.options.interests.housing'),
                icon: 'home',
              },
              {
                value: 'pr_immigration',
                label: t('quiz.options.interests.prImmigration'),
                icon: 'globe',
              },
              {
                value: 'healthcare',
                label: t('quiz.options.interests.healthcare'),
                icon: 'heart',
              },
              {
                value: 'family_kids',
                label: t('quiz.options.interests.familyKids'),
                icon: 'users',
              },
              {
                value: 'transit',
                label: t('quiz.options.interests.transit'),
                icon: 'map-pin',
              },
              {
                value: 'other',
                label: t('quiz.options.interests.other'),
                hasOther: true,
                icon: 'more-horizontal',
              },
            ]}
            selectedValues={learningInterests}
            otherValue={learningInterestsOther}
            onToggle={value =>
              toggleLearningInterest(value as LearningInterest)
            }
            onOtherChange={setLearningInterestsOther}
            required
            error={errors[7]}
          />
        );
      case 8:
        return (
          <FloatingTagSelect
            question={t('quiz.q.hobbies')}
            options={[
              {
                value: 'career_growth',
                label: t('quiz.options.hobbies.careerGrowth'),
                icon: 'trending-up',
              },
              {
                value: 'exploring_canada',
                label: t('quiz.options.hobbies.exploringCanada'),
                icon: 'map',
              },
              {
                value: 'wellness',
                label: t('quiz.options.hobbies.wellness'),
                icon: 'heart',
              },
              {
                value: 'technology',
                label: t('quiz.options.hobbies.technology'),
                icon: 'cpu',
              },
              {
                value: 'music',
                label: t('quiz.options.hobbies.music'),
                icon: 'music',
              },
              {
                value: 'fitness',
                label: t('quiz.options.hobbies.fitness'),
                icon: 'activity',
              },
              {
                value: 'personal_finance',
                label: t('quiz.options.hobbies.personalFinance'),
                icon: 'dollar-sign',
              },
              {
                value: 'family_parenting',
                label: t('quiz.options.hobbies.familyParenting'),
                icon: 'users',
              },
              {
                value: 'education',
                label: t('quiz.options.hobbies.education'),
                icon: 'book-open',
              },
              {
                value: 'food_cooking',
                label: t('quiz.options.hobbies.foodCooking'),
                icon: 'coffee',
              },
              {
                value: 'movies',
                label: t('quiz.options.hobbies.movies'),
                icon: 'film',
              },
            ]}
            selectedValues={hobbies}
            otherValue={null}
            onToggle={value => toggleHobby(value as Hobby)}
            onOtherChange={() => {}}
            required={false}
          />
        );
      case 9:
        return (
          <View style={styles.container}>
            <Text style={styles.question}>{t('quiz.q.reminders')}</Text>
            <Text style={styles.subtitle}>{t('quiz.reminders.subtitle')}</Text>
            {errors[9] && <Text style={styles.errorText}>{errors[9]}</Text>}
            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={[
                  styles.option,
                  wantsReminders === true && styles.optionSelected,
                ]}
                onPress={() => setWantsReminders(true)}
              >
                <View style={styles.radioContainer}>
                  <View
                    style={[
                      styles.radio,
                      wantsReminders === true && styles.radioSelected,
                    ]}
                  >
                    {wantsReminders === true && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      wantsReminders === true && styles.optionTextSelected,
                    ]}
                  >
                    {t('quiz.reminders.yes')}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.option,
                  wantsReminders === false && styles.optionSelected,
                ]}
                onPress={() => setWantsReminders(false)}
              >
                <View style={styles.radioContainer}>
                  <View
                    style={[
                      styles.radio,
                      wantsReminders === false && styles.radioSelected,
                    ]}
                  >
                    {wantsReminders === false && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      wantsReminders === false && styles.optionTextSelected,
                    ]}
                  >
                    {t('quiz.reminders.no')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 10:
        return <OutcomesStep />;
      case 11:
        return <ThankYouStep isRedo={isRedo} firstName={firstName} />;
      default:
        return null;
    }
  };

  const isLoading = saveMutation.isPending;

  return (
    <View style={styles.root}>
      <OnboardingProgress
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        skipSafeArea={isRedo}
      />
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        bottomOffset={120}
        extraKeyboardSpace={120}
      >
        {renderStep()}
      </KeyboardAwareScrollView>

      <View
        style={[styles.navContainer, { paddingBottom: 20 + insets.bottom }]}
      >
        {currentStep > 1 && currentStep < 11 && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={handleBack}
            disabled={isLoading}
          >
            <Feather name='chevron-left' size={24} color={Theme.black} />
            <Text style={styles.navButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        )}
        {currentStep < 10 && (
          <TouchableOpacity
            style={[styles.nextButton, isLoading && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Theme.white} />
            ) : (
              <>
                <Text style={styles.nextButtonText}>{t('common.next')}</Text>
                <Feather name='chevron-right' size={24} color={Theme.white} />
              </>
            )}
          </TouchableOpacity>
        )}
        {currentStep === 10 && (
          <TouchableOpacity
            style={[
              styles.nextButton,
              styles.finalStepButton,
              isLoading && styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Theme.white} />
            ) : (
              <>
                <Text style={[styles.nextButtonText, styles.finalStepText]}>
                  {t('quiz.cta.continue')}
                </Text>
                <Feather name='chevron-right' size={24} color={Theme.white} />
              </>
            )}
          </TouchableOpacity>
        )}
        {currentStep === 11 && (
          <TouchableOpacity
            style={[styles.nextButton, isLoading && styles.nextButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Theme.white} />
            ) : (
              <>
                <Text style={styles.nextButtonText}>
                  {isRedo
                    ? t('quiz.cta.saveChanges')
                    : t('quiz.cta.exploreUnify')}
                </Text>
                <Feather name='chevron-right' size={24} color={Theme.white} />
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
    backgroundColor: Theme.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 88,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  question: { ...typography.title, color: Theme.black, marginBottom: 12 },
  subtitle: { ...typography.body, color: Theme.textInput, marginBottom: 24 },
  optionsContainer: {
    gap: 12,
  },
  option: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
  },
  optionSelected: {
    borderColor: Theme.primaryGatherRed,
    backgroundColor: '#FFF5F3',
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.borderInfoText,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: Theme.primaryGatherRed,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.primaryGatherRed,
  },
  optionText: { ...typography.body, color: Theme.black, flex: 1 },
  optionTextSelected: {
    fontWeight: '600',
  },
  errorText: { ...typography.secondary, color: '#f00', marginBottom: 16 },
  navContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.surfaceGray,
    backgroundColor: Theme.white,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  navButtonText: { ...typography.button, color: Theme.black },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.primaryGatherRed,
    paddingHorizontal: 28,
    height: 52,
    borderRadius: 26,
    marginLeft: 'auto',
  },
  finalStepButton: {
    paddingHorizontal: 32,
  },
  nextButtonDisabled: {
    backgroundColor: Theme.disabledGatherRed,
  },
  nextButtonText: { ...typography.button, color: Theme.white },
  finalStepText: {
    fontWeight: '700',
  },
  inviteCodeBottomSpacer: {
    height: 240,
  },
  dateInputContainer: {
    marginTop: 16,
  },
  dateInput: {
    ...typography.body,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
    color: Theme.black,
  },
});
