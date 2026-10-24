import { useQuery } from '@tanstack/react-query';
import { getDailyTip } from '@/services/tips/getDailyTip';
import { useCurrentUser } from '@/context/UserContext';
import { formatLocalDate } from '@/helpers/arrivalDate';

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

export const useDailyTip = () => {
  const { currentUser } = useCurrentUser();
  const now = new Date();

  return useQuery({
    // The tip row is keyed by UTC day on the server; the stage wording follows
    // the local day, so both days are part of the key.
    queryKey: [
      'dailyTip',
      currentUser?.id,
      getTodayUTC(),
      formatLocalDate(now),
    ],
    queryFn: () => getDailyTip(now),
    enabled: !!currentUser,
    staleTime: 1000 * 60 * 30, // 30 min — tip doesn't change intraday
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });
};
