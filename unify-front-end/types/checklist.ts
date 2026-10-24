import type { SanityLanguage } from '@/services/sanity/i18n';
import {
  isVisibleForProvince,
  resolveUserProvince,
} from '@/supabase/functions/_shared/province';

export type Priority =
  | 'Do now'
  | 'Do soon'
  | 'Explore and connect'
  | 'Explore & connect'
  | 'Optional / later';

/**
 * Everything that distinguishes one cached checklist from another. The React
 * Query key and the disk/memory key both take this one object.
 */
export interface ChecklistCacheContext {
  userId: string;
  stage: number;
  personaSlug: string;
  stageChanged: boolean;
  language: SanityLanguage;
  /** Onboarding-profile province; unmatched or missing keys as `none`. */
  province: string | null | undefined;
}

export type CustomPriority =
  | 'Do now'
  | 'Do soon'
  | 'Explore and connect'
  | 'Optional / later';

export type TaskSource = 'sanity' | 'custom';

export type StageNumber = 0 | 1 | 2 | 3 | 4;
export type Stage = '0' | '1' | '2' | '3' | '4';

/** Tab slug for checklist "Learn how" link (must match app tab routes) */
export type ChecklistLinkTabSlug =
  | 'home'
  | 'community'
  | 'companion'
  | 'checklist'
  | 'learn';

/** Sanity checklist item (content from Sanity). Personas array: user sees item if user.persona in personas. */
export interface SanityChecklistItem {
  _id: string;
  _type: 'checklist';
  title: string;
  description?: string | null;
  longer_description?: string | null;
  class: 'do_now' | 'do_soon' | 'explore_and_connect' | 'optional_later';
  class_order: number;
  personas: string[];
  stage: string;
  /** Link to a tab (home | community | companion | checklist | learn); when set, module/submodule are unused. Schema field: link_tab. */
  link_tab?: ChecklistLinkTabSlug | string | null;
  module?: { _id: string; title: string; province?: string | null } | null;
  submodule?: {
    _id: string;
    title: string;
    moduleId?: string;
    /** Province tag of the submodule's parent module. */
    moduleProvince?: string | null;
  } | null;
}

const SANITY_CLASS_TO_PRIORITY: Record<SanityChecklistItem['class'], Priority> =
  {
    do_now: 'Do now',
    do_soon: 'Do soon',
    explore_and_connect: 'Explore and connect',
    optional_later: 'Optional / later',
  };

function normalizeLinkTab(
  link_tab: SanityChecklistItem['link_tab']
): ChecklistLinkTabSlug | undefined {
  if (link_tab == null || typeof link_tab !== 'string') return undefined;
  const slug = link_tab.trim().toLowerCase();
  return slug.length > 0 ? (slug as ChecklistLinkTabSlug) : undefined;
}

/**
 * The task as shown to a user in `userProvince`. A national task stays, but its
 * "Learn how" target is dropped when the linked module is tagged with another
 * province; the Learn tab it falls back to is open to everyone. The Sanity
 * reference itself is untouched.
 */
export function sanityChecklistItemToTaskDetails(
  item: SanityChecklistItem,
  userProvince?: string | null
): ChecklistTaskDetails {
  const linkedModuleProvince = item.module
    ? item.module.province
    : item.submodule?.moduleProvince;
  const moduleOrSub = isVisibleForProvince(
    linkedModuleProvince,
    resolveUserProvince(userProvince)
  )
    ? (item.module ?? item.submodule)
    : null;
  const linkTab = normalizeLinkTab(item.link_tab);
  return {
    task_name: item.title,
    task_description: item.description ?? '',
    longer_description: item.longer_description?.trim() || undefined,
    priority: SANITY_CLASS_TO_PRIORITY[item.class],
    task_module: moduleOrSub?.title,
    linkTab,
    linkModuleId: linkTab
      ? undefined
      : moduleOrSub
        ? (item.module?._id ?? item.submodule?.moduleId)
        : undefined,
    linkSubmoduleId: linkTab || !moduleOrSub ? undefined : item.submodule?._id,
    linkModuleTitle: moduleOrSub?.title,
  };
}

/** Display shape for checklist task (from Sanity or legacy Supabase) */
export interface ChecklistTaskDetails {
  task_name: string;
  task_description: string;
  /** Optional longer description for modal; fallback to task_description when absent */
  longer_description?: string;
  priority: Priority;
  task_module?: string;
  /** For "Learn how": link to a tab (Home, Community, Companion, Checklist, Learn). When set, module/submodule are not used */
  linkTab?: ChecklistLinkTabSlug;
  /** For "Learn how" deep link: module id or submodule id (when linkTab is not set) */
  linkModuleId?: string;
  linkSubmoduleId?: string;
  linkModuleTitle?: string;
}

/** Legacy Supabase personalized task (kept for backward compat) */
export interface PersonalizedChecklistTask {
  id: number;
  persona: string;
  stage: Stage;
  priority: Priority;
  task_name: string;
  task_description: string;
  task_module: string;
}

export interface UserTask {
  user_task_id: number;
  user_id: string;
  task_id: number | null;
  custom_task_id?: number | null;
  sanity_checklist_id: string | null;
  completed: boolean;
  completed_at: string | null;
  dismissed_at: string | null;
  source?: TaskSource;
  task?: ChecklistTaskDetails;
}

export interface UserTaskWithDetails extends UserTask {
  task: ChecklistTaskDetails;
}

export interface CustomChecklistTask {
  id: number;
  user_id: string;
  priority: CustomPriority;
  title: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
