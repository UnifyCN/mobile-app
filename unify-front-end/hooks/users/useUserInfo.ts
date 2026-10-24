import { useQuery } from '@tanstack/react-query';
import { getUserInfo, UserInfo } from '@/services/users/getUserInfo';
import { getArrivalStage } from '@/helpers/arrivalDate';

/**
 * Cached user info can be hours old. Recompute the stage from the arrival
 * date on every read instead of trusting the stored value.
 */
export const withComputedStage = (info: UserInfo): UserInfo => {
  const stage = getArrivalStage(info.arrivalDate);
  return stage === info.stage ? info : { ...info, stage };
};

export const useUserInfo = (userId?: string) => {
  return useQuery<UserInfo, Error, UserInfo>({
    queryKey: ['userInfo', userId],
    queryFn: () => getUserInfo(userId),
    select: withComputedStage,
    enabled: !!userId, // Only fetch when userId is provided
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};
