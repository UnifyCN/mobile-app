/**
 * The profile save opens the AuthWrapper gate, and the newly mounted AppContent
 * can reload the bundle for an OTA update a few seconds later. Every await in
 * the submit must therefore finish BEFORE the save, and onboarding_completed
 * must be captured right after it, or the reload drops the event.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockMutateAsync = jest.fn();
const mockUpdateFirstName = jest.fn();
const mockTrackOnboardingCompleted = jest.fn();

jest.mock('@/hooks/onboarding/useSaveOnboardingProfile', () => ({
  useSaveOnboardingProfile: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));
jest.mock('@/services/users/updateFirstName', () => ({
  updateFirstName: (...args: unknown[]) => mockUpdateFirstName(...args),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
    },
  },
}));
jest.mock('@/utils/analytics', () => ({
  AnalyticsEvents: {},
  useAnalytics: () => ({
    trackOnboardingStepCompleted: jest.fn(),
    trackOnboardingCompleted: mockTrackOnboardingCompleted,
    trackPushPermissionPrompted: jest.fn(),
    trackPushPermissionGranted: jest.fn(),
    trackPushPermissionDenied: jest.fn(),
    capture: jest.fn(),
  }),
}));
jest.mock('@/services/push/pushNotifications', () => ({
  registerForPushNotifications: () =>
    Promise.resolve({ permission: 'unsupported', prompted: false }),
}));
jest.mock('@/utils/storeReview', () => ({ requestStoreReview: jest.fn() }));
jest.mock('@/context/InviteCodeContext', () => ({
  useInviteCode: () => ({ code: null, source: null, clear: jest.fn() }),
}));
jest.mock('@/components/referrals/InviteCodeField', () => ({
  InviteCodeField: () => null,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return { KeyboardAwareScrollView: View };
});
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

// Step stubs answer their own question on mount, so each Next press validates.
jest.mock('@/components/onboarding/OnboardingProgress', () => () => null);
jest.mock('@/components/onboarding/WelcomeStep', () => () => null);
jest.mock('@/components/onboarding/OutcomesStep', () => () => null);
jest.mock('@/components/onboarding/ThankYouStep', () => () => null);
jest.mock('@/components/onboarding/SingleSelectQuestion', () => (props: any) => {
  require('react').useEffect(() => props.onSelect(props.options[0].value), [props.question]);
  return null;
});
jest.mock('@/components/onboarding/MonthPicker', () => (props: any) => {
  require('react').useEffect(() => props.onChange(new Date(2026, 0, 1)), []);
  return null;
});
jest.mock('@/components/onboarding/LocationStep', () => (props: any) => {
  require('react').useEffect(() => {
    props.onCityChange('Toronto');
    props.onProvinceChange('ON');
  }, []);
  return null;
});
jest.mock('@/components/onboarding/FloatingTagSelect', () => (props: any) => {
  require('react').useEffect(() => props.onToggle(props.options[0].value), [props.question]);
  return null;
});

import OnboardingQuiz from '@/components/onboarding/OnboardingQuiz';

async function submitQuiz() {
  render(<OnboardingQuiz onComplete={jest.fn()} prefilledName='Ana' />);
  for (let step = 1; step <= 8; step++) {
    fireEvent.press(screen.getByText('common.next'));
  }
  fireEvent.press(screen.getByText('quiz.reminders.yes'));
  fireEvent.press(screen.getByText('common.next'));
  fireEvent.press(screen.getByText('quiz.cta.continue'));
  await act(async () => {
    fireEvent.press(screen.getByText('quiz.cta.exploreUnify'));
  });
}

describe('OnboardingQuiz submit order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ profile: {}, redeem: null });
    mockUpdateFirstName.mockResolvedValue({ success: true });
  });

  it('captures onboarding_completed when a reload stops network calls after the save', async () => {
    let saved = false;
    mockMutateAsync.mockImplementation(async () => {
      saved = true;
      return { profile: {}, redeem: null };
    });
    // After the save, the OTA reload means no network call ever settles.
    mockUpdateFirstName.mockImplementation(() =>
      saved ? new Promise(() => {}) : Promise.resolve({ success: true })
    );

    await submitQuiz();

    expect(mockUpdateFirstName).toHaveBeenCalledWith('Ana');
    expect(mockTrackOnboardingCompleted).toHaveBeenCalledWith(
      'international_student'
    );
  });

  it('still saves the profile when the first name write fails', async () => {
    mockUpdateFirstName.mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await submitQuiz();

    expect(mockMutateAsync).toHaveBeenCalled();
    expect(mockTrackOnboardingCompleted).toHaveBeenCalled();
  });
});
