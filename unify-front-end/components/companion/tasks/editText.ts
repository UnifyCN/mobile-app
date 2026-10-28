/**
 * The words for one task edit (mobile-app#365): which field changes, from what, to what.
 * Built from the operation and the values the server recorded or read, never from
 * assistant text. Priorities and states use the Checklist's own labels.
 */
import type {
  EditDetailsOperation,
  FieldChange,
  Priority,
  SetStateOperation,
  TaskReceipt,
  TaskSnapshot,
  TaskState,
} from '@/services/companionActions/contract';

type T = (key: string, options?: Record<string, unknown>) => string;

/** The detail fields of a custom task an edit can change, in display order. */
export const DETAIL_FIELDS = ['title', 'description', 'priority'] as const;

const PRIORITY_KEYS: Record<Priority, string> = {
  'Do now': 'checklist.priority.doNow',
  'Do soon': 'checklist.priority.doSoon',
  'Explore and connect': 'checklist.priority.exploreAndConnect',
  'Optional / later': 'checklist.priority.optionalLater',
};

export function priorityLabel(t: T, value: string | null): string {
  return value && value in PRIORITY_KEYS
    ? t(PRIORITY_KEYS[value as Priority])
    : (value ?? '');
}

const stateLabel = (t: T, value: TaskState) => t(`taskActions.state.${value}`);

/** A field's value as shown: quoted text, a label, or "(empty)". */
function shown(t: T, field: string, value: string | null): string {
  if (field === 'priority') return priorityLabel(t, value);
  if (field === 'state') return stateLabel(t, value as TaskState);
  if (!value) return t('taskEdit.empty');
  return `“${value}”`;
}

export interface ChangeLine {
  field: 'title' | 'description' | 'priority' | 'state' | 'waitingReason';
  label: string;
  /** The value now (null when the draft's task values are unknown). */
  from: string | null;
  to: string;
  /** With a revised draft: the value it was suggested against. */
  was: string | null;
  /** The draft would leave this field as it is. */
  same: boolean;
}

/** What an edit operation changes, field by field, against the task values it is from. */
export function changeLines(
  t: T,
  op: SetStateOperation | EditDetailsOperation,
  task: TaskSnapshot | null,
  previous: TaskSnapshot | null = null
): ChangeLine[] {
  const line = (
    field: ChangeLine['field'],
    key: string,
    now: string | null | undefined,
    next: string | null,
    old: string | null | undefined
  ): ChangeLine => ({
    field,
    label: t(`taskEdit.field.${field}`),
    from: task ? shown(t, key, now ?? null) : null,
    to: shown(t, key, next),
    was:
      previous && (old ?? null) !== (now ?? null)
        ? shown(t, key, old ?? null)
        : null,
    same: Boolean(task) && (now ?? null) === next,
  });
  if (op.type === 'task.set_state') {
    const lines = [
      line('state', 'state', task?.state, op.state, previous?.state),
    ];
    const reason = op.state === 'waiting' ? (op.waiting_reason ?? null) : null;
    if (reason !== null || task?.waitingReason) {
      lines.push(
        line(
          'waitingReason',
          'waitingReason',
          task?.waitingReason,
          reason,
          previous?.waitingReason
        )
      );
    }
    return lines;
  }
  const lines: ChangeLine[] = [];
  for (const field of ['title', 'description', 'priority'] as const) {
    if (op[field] === undefined) continue;
    lines.push(
      line(
        field,
        field,
        task?.[field],
        op[field] as string,
        previous?.[field]
      )
    );
  }
  return lines;
}

/** One recorded change of an edit receipt: "Priority: Do soon → Do now". */
export function receiptChangeText(t: T, change: FieldChange): string {
  return t('taskEdit.receiptChange', {
    field: t(`taskEdit.field.${change.field}`),
    from: shown(t, change.field, change.before),
    to: shown(t, change.field, change.after),
  });
}

/** The headline of a receipt the edit slice shows (an edit, its Undo, a command's state change). */
export function editReceiptText(
  t: T,
  receipt: TaskReceipt,
  title: string
): string {
  if (receipt.operationType === 'task.edit_details') {
    return receipt.kind === 'undo'
      ? t('taskEdit.receiptUndo', { title })
      : t('taskEdit.receiptEdited', { title });
  }
  return t('taskEdit.commandState', {
    title,
    from: stateLabel(t, receipt.beforeState),
    to: stateLabel(t, receipt.afterState),
  });
}
