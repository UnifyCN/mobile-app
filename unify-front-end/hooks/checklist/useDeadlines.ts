import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDeadlines } from '@/services/checklist/deadlines';
import type { Deadline } from '@/types/deadlines';

export const DEADLINES_QUERY_ROOT = 'deadlines' as const;
export const deadlinesQueryKey = (userId: string) =>
  [DEADLINES_QUERY_ROOT, userId] as const;

export function useDeadlines() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = useQuery({
    queryKey: userId
      ? deadlinesQueryKey(userId)
      : [DEADLINES_QUERY_ROOT, 'disabled'],
    queryFn: () => getDeadlines(userId!),
    enabled: !!userId,
    staleTime: 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  });

  /** Optimistic local update; callers persist separately. */
  const setDeadlines = useCallback(
    (updater: (prev: Deadline[]) => Deadline[]) => {
      if (!userId) return;
      queryClient.setQueryData(
        deadlinesQueryKey(userId),
        (old: Deadline[] | undefined) => updater(old ?? [])
      );
    },
    [queryClient, userId]
  );

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [DEADLINES_QUERY_ROOT] }),
    [queryClient]
  );

  return {
    userId,
    deadlines: query.data ?? [],
    isLoading: !!userId && query.isPending && query.data === undefined,
    setDeadlines,
    refetch,
  };
}
