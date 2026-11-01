import { useMemo } from 'react';
import { useRefreshingToday } from '@/hooks/checklist/useRefreshingToday';
import { useChecklistProfile } from '@/hooks/checklist/useChecklistProfile';
import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';
import { useUserStage } from '@/hooks/onboarding/useUserStage';
import { getChecklistTaskOrderKey } from '@/utils/checklistOrder';

/**
 * Titles of the signed-in account's live Checklist tasks by task ref (mobile-app#366),
 * from the same query and cache as the Checklist screen. Companion uses it to name the
 * task a suggestion is for; a ref it does not hold has no title.
 */
export function useChecklistTaskTitles(): ReadonlyMap<string, string> {
  return useChecklistTaskTitlesState().titles;
}

/**
 * The same titles, and whether the Checklist read has finished (#367): a removal request
 * names a task by title, and an unread Checklist must not read as "no such task".
 */
export function useChecklistTaskTitlesState(): {
  titles: ReadonlyMap<string, string>;
  ready: boolean;
} {
  const today = useRefreshingToday();
  const { currentStage, stageChanged, isLoading: stageLoading } = useUserStage(today);
  const { persona, province } = useChecklistProfile();
  const { tasks, isLoading, error } = useChecklistTasks({
    currentStage,
    stageChanged,
    persona,
    isStageLoading: stageLoading,
    province,
  });
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      if (!task.dismissed_at) map.set(getChecklistTaskOrderKey(task), task.task.task_name);
    }
    return map;
  }, [tasks]);
  const ready = !isLoading && !error;
  return useMemo(() => ({ titles, ready }), [titles, ready]);
}
