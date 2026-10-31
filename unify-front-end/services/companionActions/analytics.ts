import { TASK_STATES, type OperationType, type TaskState } from './contract';
import type { TaskActionResultEvent } from './taskActionStore';
import type { PlanResultEvent } from './planStore';

/** Where the task controls were opened. */
export type TaskActionSurface = 'checklist' | 'companion';

/** Properties of `companion_action_result` (mobile-app#361). Same as web. */
export interface TaskActionResultProperties {
  /** plan.save: a settlement plan approval, retry or Undo (#364). */
  operation_type: OperationType | 'plan.save';
  action: TaskActionResultEvent['action'] | PlanResultEvent['action'];
  outcome: TaskActionResultEvent['outcome'] | PlanResultEvent['outcome'];
  entry_surface: TaskActionSurface;
  to_state?: TaskState;
  /** #364: how many tasks the plan change added or removed (a count, never a title). */
  change_count?: number;
}

const ACTIONS = [
  'set_state',
  'undo',
  'approve_compensation',
  'lookup',
  'approve_create',
  'command_create',
  'step_change',
  'approve_steps',
  'approve_edit',
  'command_edit',
  'detail_change',
  'approve_detail',
  'command_detail',
  'approve_removal',
  'reminder_change',
] as const;
/** #367: removal operation types, allowlisted. Never a task title or reference. */
const REMOVAL_TYPES: readonly OperationType[] = ['task.remove', 'task.restore'];
/** #366: step operation types, allowlisted. Never a step title or id. */
/** #365: an edit names its registered type. */
const EDIT_TYPES: readonly OperationType[] = ['task.edit_details'];
const STEP_TYPES: readonly OperationType[] = [
  'reminder.schedule',
  'reminder.cancel',
  'step.create',
  'step.update',
  'step.set_done',
  'step.remove',
  'step.restore',
  'step.remove_created',
  // #370: saved-detail operation types. Never the detail text or id.
  'detail.create',
  'detail.update',
  'detail.remove',
  'detail.restore',
  'profile.update',
];
const OUTCOMES = [
  'applied',
  'replayed',
  'conflict',
  'undo_conflict',
  'already_undone',
  'refused',
  'unknown',
  'pending',
  'not_applied',
  'lookup_failed',
  'unavailable',
  'needs_review',
  'undo_blocked',
] as const;

/**
 * Builds the event from allowlisted categorical values only. Anything else on
 * the input (a title, a reason, an id) is not copied, and a value off a list
 * is dropped rather than sent.
 */
export function buildTaskActionResultProperties(
  event: TaskActionResultEvent,
  surface: TaskActionSurface
): TaskActionResultProperties | null {
  if (!(ACTIONS as readonly string[]).includes(event.action)) return null;
  if (!(OUTCOMES as readonly string[]).includes(event.outcome)) return null;
  const props: TaskActionResultProperties = {
    // Categorical only: never the task title, the detail text, the message or a reference.
    operation_type:
      event.operationType &&
      (STEP_TYPES.includes(event.operationType) ||
        EDIT_TYPES.includes(event.operationType) ||
        REMOVAL_TYPES.includes(event.operationType))
        ? event.operationType
        : event.action === 'approve_create' || event.action === 'command_create'
          ? 'task.create_custom'
          : event.action === 'approve_detail' ||
              event.action === 'command_detail'
            ? 'detail.create'
            : 'task.set_state',
    action: event.action,
    outcome: event.outcome,
    entry_surface: surface === 'companion' ? 'companion' : 'checklist',
  };
  if (
    event.toState &&
    (TASK_STATES as readonly string[]).includes(event.toState)
  ) {
    props.to_state = event.toState;
  }
  return props;
}

const PLAN_ACTIONS = [
  'approve_plan',
  'retry_plan',
  'undo_plan',
  'approve_plan_compensation',
  'lookup',
] as const;
const PLAN_OUTCOMES = [
  'applied',
  'partial',
  'replayed',
  'needs_review',
  'undo_conflict',
  'already_undone',
  'refused',
  'unknown',
  'pending',
  'not_applied',
  'lookup_failed',
  'unavailable',
] as const;

/** `companion_action_result` for a plan (#364): categorical values and a small count only. */
export function buildPlanResultProperties(
  event: PlanResultEvent,
  surface: TaskActionSurface
): TaskActionResultProperties | null {
  if (!(PLAN_ACTIONS as readonly string[]).includes(event.action)) return null;
  if (!(PLAN_OUTCOMES as readonly string[]).includes(event.outcome))
    return null;
  const props: TaskActionResultProperties = {
    operation_type: 'plan.save',
    action: event.action,
    outcome: event.outcome,
    entry_surface: surface === 'companion' ? 'companion' : 'checklist',
  };
  if (
    Number.isInteger(event.changeCount) &&
    event.changeCount! >= 0 &&
    event.changeCount! <= 12
  )
    props.change_count = event.changeCount;
  return props;
}
