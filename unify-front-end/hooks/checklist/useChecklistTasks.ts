import type { SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionAccountId } from '@/hooks/auth/useSessionAccountId';
import type {
  ChecklistCacheContext,
  UserTaskWithDetails,
} from '@/types/checklist';
import { getChecklistWithUserProgress } from '@/services/checklist/getChecklistWithUserProgress';
import { getChecklistTaskOrders } from '@/services/checklist/checklistTaskOrder';
import { applySavedOrderToTasks } from '@/utils/checklistOrder';
import {
  buildChecklistCacheStorageKey,
  getChecklistMemoryCache,
  loadChecklistFromDisk,
  saveChecklistToDisk,
  setChecklistMemoryCache,
} from '@/utils/checklistTaskCache';
import {
  checklistTasksQueryKey,
  CHECKLIST_TASKS_QUERY_ROOT,
} from '@/hooks/checklist/checklistQueryKeys';
import {
  stageNumberToStageSlug,
  normalizePersonaSlug,
} from '@/helpers/dateHelpers';
import { useSanityLanguage } from '@/hooks/sanity/useSanityLanguage';
import type { SanityLanguage } from '@/services/sanity/i18n';

interface UseChecklistTasksParams {
  /** 0-4, or null for an unknown stage (no usable arrival date). */
  currentStage: number | null;
  stageChanged: boolean;
  persona: string | null;
  /** True while the stage is still loading. Nothing loads until it is false. */
  isStageLoading?: boolean;
  /** Onboarding-profile province; unmatched or missing means national items only. */
  province: string | null;
}

// Unknown stage shows the first-months checklist (Sanity slug arrived_0_3_months).
const UNKNOWN_STAGE_FALLBACK = 1;

async function fetchChecklistTasks(
  userId: string,
  currentStage: number,
  normalizedPersona: string | null,
  stageChanged: boolean,
  language: SanityLanguage,
  province: string | null
): Promise<UserTaskWithDetails[]> {
  const stageSlug = stageNumberToStageSlug(currentStage);
  const merged = await getChecklistWithUserProgress(
    userId,
    normalizedPersona,
    stageSlug,
    { stageChanged, language, province }
  );
  try {
    const orders = await getChecklistTaskOrders(userId);
    return applySavedOrderToTasks(merged, orders);
  } catch (orderErr) {
    console.error('Error loading checklist order:', orderErr);
    return merged;
  }
}

export const useChecklistTasks = ({
  currentStage,
  stageChanged,
  persona,
  isStageLoading = false,
  province,
}: UseChecklistTasksParams) => {
  const stage = currentStage ?? UNKNOWN_STAGE_FALLBACK;
  const queryClient = useQueryClient();
  const language = useSanityLanguage();
  // The account from the stored session, not getUser(): getUser() always makes
  // a network request and resolves with a null user when it fails. The hook
  // follows every auth change, so another account signing in re-keys the list
  // and the previous account's rows are never rendered for it (#361).
  const userId = useSessionAccountId() ?? null;
  const [cacheChecked, setCacheChecked] = useState(false);

  const normalizedPersona = useMemo(
    () => normalizePersonaSlug(persona),
    [persona]
  );

  const cacheContext = useMemo<ChecklistCacheContext | null>(() => {
    if (!userId || isStageLoading) {
      return null;
    }
    return {
      userId,
      stage,
      personaSlug: normalizedPersona ?? 'unpersonalized',
      stageChanged,
      language,
      province,
    };
  }, [
    userId,
    isStageLoading,
    stage,
    normalizedPersona,
    stageChanged,
    language,
    province,
  ]);

  const queryKey = useMemo(
    () => (cacheContext ? checklistTasksQueryKey(cacheContext) : null),
    [cacheContext]
  );

  const storageKey = useMemo(
    () => (cacheContext ? buildChecklistCacheStorageKey(cacheContext) : null),
    [cacheContext]
  );

  // Hydrate React Query from memory (sync) then AsyncStorage before network fetch.
  useEffect(() => {
    if (!queryKey || !storageKey || !userId) {
      setCacheChecked(true);
      return;
    }

    setCacheChecked(false);

    const mem = getChecklistMemoryCache(storageKey);
    if (mem) {
      queryClient.setQueryData(queryKey, mem);
      setCacheChecked(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const disk = await loadChecklistFromDisk(storageKey);
      if (cancelled) {
        return;
      }
      if (disk !== null) {
        queryClient.setQueryData(queryKey, disk);
        setChecklistMemoryCache(storageKey, disk);
      }
      setCacheChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient, queryKey, storageKey, userId]);

  const query = useQuery({
    queryKey: queryKey ?? [CHECKLIST_TASKS_QUERY_ROOT, 'disabled'],
    queryFn: () =>
      fetchChecklistTasks(
        userId!,
        stage,
        normalizedPersona,
        stageChanged,
        language,
        province
      ),
    enabled: cacheChecked && !!queryKey && !!userId,
    // Hydrated cache renders immediately, then revalidates for newly published
    // Sanity translations. Disk/memory entries separately expire after 10 min.
    staleTime: 0,
    refetchOnMount: true,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  });

  useEffect(() => {
    if (!query.data || !storageKey) {
      return;
    }
    setChecklistMemoryCache(storageKey, query.data);
    void saveChecklistToDisk(storageKey, query.data);
  }, [query.data, storageKey]);

  const setTasks = useCallback(
    (updater: SetStateAction<UserTaskWithDetails[]>) => {
      if (!queryKey) {
        return;
      }
      queryClient.setQueryData(
        queryKey,
        (old: UserTaskWithDetails[] | undefined) => {
          const prev = old ?? [];
          return typeof updater === 'function'
            ? (updater as (p: UserTaskWithDetails[]) => UserTaskWithDetails[])(
                prev
              )
            : updater;
        }
      );
      const next = queryClient.getQueryData(queryKey) as
        | UserTaskWithDetails[]
        | undefined;
      if (next && storageKey) {
        setChecklistMemoryCache(storageKey, next);
        void saveChecklistToDisk(storageKey, next);
      }
    },
    [queryClient, queryKey, storageKey]
  );

  const refetch = useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: [CHECKLIST_TASKS_QUERY_ROOT],
    });
  }, [queryClient]);

  const tasks = query.data ?? [];

  const waitingForAuth = Boolean(persona && userId === null);

  const isLoading =
    isStageLoading ||
    waitingForAuth ||
    Boolean(
      queryKey &&
      (!cacheChecked || (query.isPending && query.data === undefined))
    );

  return {
    tasks,
    isLoading,
    error: query.error ? String(query.error) : null,
    refetch,
    setTasks,
  };
};
