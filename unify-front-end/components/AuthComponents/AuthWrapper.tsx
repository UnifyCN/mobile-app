import React, { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';
import { SignIn } from './SignIn';
import { SignUp } from './SignUp';
import WelcomeScreen from './WelcomeScreen';
import OTPVerification from './OTPConfirmation';
import OnboardingQuiz from '../onboarding/OnboardingQuiz';
import LegalConsentModal from './LegalConsentModal';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import LoadingScreen from '@/components/LoadingScreen';

type Props = {
  children: React.ReactNode;
  onBackToOnboarding?: () => void;
};

interface UserLegalStatus {
  privacy_policy_accepted_at: string | null;
  community_guidelines_accepted_at: string | null;
}

/**
 * Fetches the legal acceptance status for a user.
 */
async function fetchUserLegalStatus(
  userId: string
): Promise<UserLegalStatus | null> {
  const { data, error } = await supabase
    .from('users')
    .select('privacy_policy_accepted_at, community_guidelines_accepted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user legal status:', error);
    throw error;
  }
  return data;
}

/**
 * Updates the legal acceptance timestamps for a user.
 */
async function updateUserLegalAcceptance(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({
      privacy_policy_accepted_at: now,
      community_guidelines_accepted_at: now,
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating legal acceptance:', error);
    throw new Error(i18n.t('auth.legal.failedSaveAcceptance'));
  }
}

export default function AuthWrapper({ children, onBackToOnboarding }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpPassword, setOtpPassword] = useState('');
  const [legalAcceptedAt, setLegalAcceptedAt] = useState<string | undefined>();
  const queryClient = useQueryClient();

  // Get onboarding profile for authenticated users
  const { data: onboardingProfile, isLoading: isLoadingOnboarding } =
    useOnboardingProfile(session?.user?.id);

  // Get user legal acceptance status (backup gate)
  const { data: legalStatus, isLoading: isLoadingLegalStatus } = useQuery({
    queryKey: ['userLegalStatus', session?.user?.id],
    queryFn: () => fetchUserLegalStatus(session!.user.id),
    enabled: !!session?.user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      })
      .catch(error => {
        // Stay on the loading screen: a failed read is not "signed out".
        // onAuthStateChange below still delivers the session.
        console.warn('[AuthWrapper] Failed to read auth session:', error);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      // Invalidate queries when auth state changes
      if (session?.user?.id) {
        queryClient.invalidateQueries({
          queryKey: ['onboardingProfile', session.user.id],
        });
        queryClient.invalidateQueries({
          queryKey: ['userLegalStatus', session.user.id],
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const handleShowOTP = (
    email: string,
    password: string,
    acceptedAt: string
  ) => {
    setOtpEmail(email);
    setOtpPassword(password);
    setLegalAcceptedAt(acceptedAt);
    setShowOTP(true);
  };

  const handleVerificationSuccess = () => {
    // OTPConfirmation already persisted the acceptance via createUserIfNotExists.
    // Seed the React Query cache directly with the timestamps we just wrote,
    // otherwise the query returns stale null data from its initial fetch and
    // the LegalConsentModal flashes for ~1 frame between OTP success and the
    // background refetch completing.
    if (session?.user?.id && legalAcceptedAt) {
      queryClient.setQueryData<UserLegalStatus>(
        ['userLegalStatus', session.user.id],
        {
          privacy_policy_accepted_at: legalAcceptedAt,
          community_guidelines_accepted_at: legalAcceptedAt,
        }
      );
    }
    setShowOTP(false);
    setShowSignUp(false);
  };

  const handleBackToSignUp = () => {
    setShowOTP(false);
  };

  const handleOnboardingComplete = () => {
    // No-op: cache is already updated by mutation's onSuccess via setQueryData
  };

  const handleLegalConsentAccept = async () => {
    if (!session?.user?.id) {
      throw new Error('No authenticated user');
    }
    await updateUserLegalAcceptance(session.user.id);
    // Invalidate the query to refresh UI
    queryClient.invalidateQueries({
      queryKey: ['userLegalStatus', session.user.id],
    });
  };

  const handleLegalConsentCancel = async () => {
    // Sign out the user and return to auth screen
    await supabase.auth.signOut();
  };

  if (loading || (session && (isLoadingOnboarding || isLoadingLegalStatus))) {
    return <LoadingScreen />;
  }

  if (!session) {
    if (showOTP) {
      return (
        <OTPVerification
          email={otpEmail}
          password={otpPassword}
          legalAcceptedAt={legalAcceptedAt}
          onVerificationSuccess={handleVerificationSuccess}
          onBackToSignUp={handleBackToSignUp}
        />
      );
    }

    if (showWelcome) {
      return (
        <WelcomeScreen
          onCreateAccount={() => {
            setShowWelcome(false);
            setShowSignUp(true);
          }}
          onLogIn={() => {
            setShowWelcome(false);
            setShowSignUp(false);
          }}
          onBack={onBackToOnboarding}
        />
      );
    }

    return showSignUp ? (
      <SignUp
        onSwitchToSignIn={() => setShowSignUp(false)}
        onShowOTP={handleShowOTP}
        onBack={() => setShowWelcome(true)}
      />
    ) : (
      <SignIn
        onSwitchToSignUp={() => setShowSignUp(true)}
        onBack={() => setShowWelcome(true)}
      />
    );
  }

  // Backup gate: Check if user has accepted legal documents
  const hasAcceptedLegal =
    legalStatus?.privacy_policy_accepted_at &&
    legalStatus?.community_guidelines_accepted_at;

  // Show consent modal if authenticated but missing legal acceptance
  if (!hasAcceptedLegal && legalStatus !== undefined) {
    return (
      <LegalConsentModal
        visible={true}
        onAccept={handleLegalConsentAccept}
        onCancel={handleLegalConsentCancel}
      />
    );
  }

  // Check if onboarding is completed
  const isOnboardingCompleted =
    onboardingProfile?.onboarding_completed ?? false;

  // If authenticated but onboarding not completed, show onboarding quiz
  if (!isOnboardingCompleted) {
    return <OnboardingQuiz onComplete={handleOnboardingComplete} />;
  }

  // If authenticated and onboarding completed, show main app
  return <>{children}</>;
}
