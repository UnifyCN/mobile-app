import { QueryClient } from '@tanstack/react-query';
import type { ChecklistCacheContext } from '@/types/checklist';
import { checklistProvinceKeyPart } from '@/utils/checklistProvince';

/** Prefix for all checklist task list queries (persona + stage + province + user). */
export const CHECKLIST_TASKS_QUERY_ROOT = 'checklist' as const;

export function checklistTasksQueryKey({
  userId,
  stage,
  personaSlug,
  stageChanged,
  language,
  province,
}: ChecklistCacheContext) {
  return [
    CHECKLIST_TASKS_QUERY_ROOT,
    userId,
    stage,
    personaSlug,
    stageChanged,
    language,
    checklistProvinceKeyPart(province),
  ] as const;
}

export function invalidateChecklistTasksQueries(
  queryClient: QueryClient
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: [CHECKLIST_TASKS_QUERY_ROOT],
  });
}
