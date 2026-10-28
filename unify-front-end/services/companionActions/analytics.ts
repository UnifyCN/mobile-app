import { TASK_STATES, type OperationType, type TaskState } from './contract';
import type { TaskActionResultEvent } from './taskActionStore';

/** Where the task controls were opened. */
export type TaskActionSurface = 'checklist' | 'companion';

/** Properties of `companion_action_result` (mobile-app#361). Same as web. */
export interface TaskActionResultProperties {
  operation_type: OperationType;
  action: TaskActionResultEvent['action'];
  outcome: TaskActionResultEvent['outcome'];
  entry_surface: TaskActionSurface;
  to_state?: TaskState;
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
] as const;
/** #366: step operation types, allowlisted. Never a step title or id. */
/** #365: an edit names its registered type. */
const EDIT_TYPES: readonly OperationType[] = ['task.edit_details'];
const STEP_TYPES: readonly OperationType[] = [
  'step.create',
  'step.update',
  'step.set_done',
  'step.remove',
  'step.restore',
  'step.remove_created',
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
    // Categorical only: never the task title, the message or a reference.
    operation_type:
      event.operationType &&
      (STEP_TYPES.includes(event.operationType) ||
        EDIT_TYPES.includes(event.operationType))
        ? event.operationType
        : event.action === 'approve_create' || event.action === 'command_create'
          ? 'task.create_custom'
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
