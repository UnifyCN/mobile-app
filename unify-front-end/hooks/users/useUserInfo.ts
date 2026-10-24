import { useQuery } from '@tanstack/react-query';
import { getUserInfo, UserInfo } from '@/services/users/getUserInfo';
import {
  getArrivalStage,
  normalizeStoredArrivalDate,
} from '@/helpers/arrivalDate';

/**
 * Cached user info can be hours old. Recompute the stage from the arrival
 * date on every read instead of trusting the stored value. A cached entry may
 * still hold a raw database timestamp, so the date is normalized here too.
 */
export const withComputedStage = (info: UserInfo): UserInfo => {
  const arrivalDate = normalizeStoredArrivalDate(info.arrivalDate);
  const stage = getArrivalStage(arrivalDate);
  return stage === info.stage && arrivalDate === info.arrivalDate
    ? info
    : { ...info, arrivalDate, stage };
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
