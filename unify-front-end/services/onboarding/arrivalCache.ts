import type { QueryClient } from '@tanstack/react-query';
import { PERSONALIZED_STARTERS_QUERY_KEY } from '@/hooks/companion/personalizedStartersQueryKey';
import type { ConfirmedArrival } from '@/services/onboarding/updateArrivalDate';
import type { UserInfo } from '@/services/users/getUserInfo';
import type { UserOnboardingProfile } from '@/types/onboardingProfile';

/**
 * Put a confirmed arrival-date write into every cache that holds the date.
 * Caches are per user, so this is correct even when the screen that saved
 * the date has gone. Cached entries that do not exist are left alone.
 * Companion starters depend on the stage, so they are invalidated.
 */
export const applyArrivalToQueryCaches = (
  queryClient: QueryClient,
  confirmed: ConfirmedArrival
): void => {
  queryClient.setQueryData<UserOnboardingProfile | null>(
    ['onboardingProfile', confirmed.id],
    previous =>
      previous
        ? {
            ...previous,
            arrival_date: confirmed.arrival_date,
            stage: confirmed.stage,
          }
        : previous
  );
  queryClient.setQueryData<UserInfo>(['userInfo', confirmed.id], previous =>
    previous
      ? {
          ...previous,
          arrivalDate: confirmed.arrival_date,
          stage: confirmed.stage,
        }
      : previous
  );
  void queryClient.invalidateQueries({
    queryKey: PERSONALIZED_STARTERS_QUERY_KEY,
  });
};
