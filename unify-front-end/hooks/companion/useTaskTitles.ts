import { useCallback, useMemo } from 'react';
import { useRefreshingToday } from '@/hooks/checklist/useRefreshingToday';
import { useChecklistProfile } from '@/hooks/checklist/useChecklistProfile';
import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';
import { useUserStage } from '@/hooks/onboarding/useUserStage';
import { getChecklistTaskOrderKey } from '@/utils/checklistOrder';

/**
 * The account's Checklist task titles by task reference (mobile-app#365), as the
 * Checklist shows them (published titles in the app language, custom titles as saved).
 * The same query and cache as the Checklist screen: one task identity. Used to name a
 * task in an edit card or receipt that does not record its title.
 */
export function useTaskTitles(): (taskRef: string) => string | null {
  const today = useRefreshingToday();
  const {
    currentStage,
    stageChanged,
    isLoading: stageLoading,
  } = useUserStage(today);
  const { persona, province } = useChecklistProfile();
  const { tasks } = useChecklistTasks({
    currentStage,
    stageChanged,
    persona,
    isStageLoading: stageLoading,
    province,
  });
  const titles = useMemo(
    () =>
      new Map(
        tasks.map(task => [getChecklistTaskOrderKey(task), task.task.task_name])
      ),
    [tasks]
  );
  return useCallback(
    (taskRef: string) => titles.get(taskRef) ?? null,
    [titles]
  );
}
