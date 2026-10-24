import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveOnboardingProfile,
  type SaveOnboardingExtras,
  type SaveOnboardingResult,
} from '@/services/onboarding/saveOnboardingProfile';
import { OnboardingProfileInput } from '@/types/onboardingProfile';
import { PERSONALIZED_STARTERS_QUERY_KEY } from '@/hooks/companion/personalizedStartersQueryKey';

export const useSaveOnboardingProfile = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SaveOnboardingResult,
    Error,
    {
      userId: string;
      data: OnboardingProfileInput;
      extras?: SaveOnboardingExtras;
    }
  >({
    mutationFn: ({ userId, data, extras }) =>
      saveOnboardingProfile(userId, data, extras),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(
        ['onboardingProfile', variables.userId],
        result.profile
      );
      queryClient.invalidateQueries({ queryKey: PERSONALIZED_STARTERS_QUERY_KEY });
    },
  });
};
