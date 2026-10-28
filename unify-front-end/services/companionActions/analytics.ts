import { TASK_STATES, type TaskState } from './contract';
import type { TaskActionResultEvent } from './taskActionStore';

/** Where the task controls were opened. */
export type TaskActionSurface = 'checklist' | 'companion';

/** Properties of `companion_action_result` (mobile-app#361). Same as web. */
export interface TaskActionResultProperties {
  operation_type: (typeof OPERATION_TYPES)[number];
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
  'approve_edit',
  'command_edit',
] as const;
const OPERATION_TYPES = [
  'task.set_state',
  'task.create_custom',
  'task.edit_details',
] as const;
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
    // Categorical only: never the task title, the message or a reference. An edit
    // (#365) names its registered type; anything off the list is not sent.
    operation_type:
      event.action === 'approve_create' || event.action === 'command_create'
        ? 'task.create_custom'
        : (OPERATION_TYPES as readonly string[]).includes(
              event.operationType ?? ''
            ) && event.operationType !== 'task.create_custom'
          ? (event.operationType as TaskActionResultProperties['operation_type'])
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
