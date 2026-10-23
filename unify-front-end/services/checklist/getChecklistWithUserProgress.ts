import {
  CustomChecklistTask,
  Priority,
  SanityChecklistItem,
  UserTaskWithDetails,
  sanityChecklistItemToTaskDetails,
} from '@/types/checklist';
import {
  CHECKLIST_PRIORITY_ORDER,
  normalizeChecklistPriority,
} from '@/utils/checklistOrder';
import { getChecklistByPersonaAndStage } from '@/services/sanity/checklist';
import { getUserTasks } from './getUserTasks';
import { getCustomChecklistTasks } from './customChecklistTasks';
import type { SanityLanguage } from '@/services/sanity/i18n';

function mergeChecklistWithUserTasks(
  items: SanityChecklistItem[],
  rows: UserTaskWithDetails[]
): UserTaskWithDetails[] {
  const bySanityId = new Map<string, UserTaskWithDetails>();
  rows.forEach(r => {
    if (r.sanity_checklist_id) bySanityId.set(r.sanity_checklist_id, r);
  });

  return items.map(item => {
    const row = bySanityId.get(item._id);
    return {
      user_task_id: row?.user_task_id ?? 0,
      user_id: row?.user_id ?? '',
      task_id: row?.task_id ?? null,
      custom_task_id: null,
      sanity_checklist_id: item._id,
      completed: row?.completed ?? false,
      completed_at: row?.completed_at ?? null,
      dismissed_at: row?.dismissed_at ?? null,
      source: 'sanity',
      task: sanityChecklistItemToTaskDetails(item),
    };
  });
}

function mapCustomTasksToChecklistRows(
  rows: CustomChecklistTask[]
): UserTaskWithDetails[] {
  return rows.map(row => ({
    user_task_id: 0,
    user_id: row.user_id,
    task_id: null,
    custom_task_id: row.id,
    sanity_checklist_id: null,
    completed: row.completed,
    completed_at: row.completed_at,
    dismissed_at: null,
    source: 'custom',
    task: {
      task_name: row.title,
      task_description: row.description,
      priority: row.priority,
    },
  }));
}

/**
 * 1. Fetch checklist content from Sanity (persona in personas + stage slug).
 * 2. Fetch user_tasks, which stores completion and per-user dismissal state.
 * 3. Merge the current Sanity items with their saved user state.
 * Rows are created only when the user completes or removes a suggested task.
 */
export async function getChecklistWithUserProgress(
  userId: string,
  persona: string | null,
  stageSlug: string,
  options: { stageChanged?: boolean; language?: SanityLanguage }
): Promise<UserTaskWithDetails[]> {
  const items = persona
    ? await getChecklistByPersonaAndStage(persona, stageSlug, {
        skipCache: true,
        language: options.language,
      })
    : [];

  const rows = items.length > 0 ? await getUserTasks(userId) : [];
  const sanityTasks =
    items.length > 0 ? mergeChecklistWithUserTasks(items, rows) : [];
  const customRows = await getCustomChecklistTasks(userId);
  const customTasks = mapCustomTasksToChecklistRows(customRows);

  // Interleave custom tasks into correct priority positions
  const allTasks = [...sanityTasks, ...customTasks];
  const priorityIndex = new Map(CHECKLIST_PRIORITY_ORDER.map((p, i) => [p, i]));
  allTasks.sort((a, b) => {
    const aIdx =
      priorityIndex.get(normalizeChecklistPriority(a.task.priority)) ?? 99;
    const bIdx =
      priorityIndex.get(normalizeChecklistPriority(b.task.priority)) ?? 99;
    return aIdx - bIdx;
  });

  return allTasks;
}
