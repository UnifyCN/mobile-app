/** Shared reminder contract. A due event proves scheduler execution, not observation. */
export interface ReminderScheduleOperation {
  type: 'reminder.schedule';
  task_ref: string;
  expected_revision: number;
  remind_at: string;
  time_zone: string;
  wall_time: string;
  reminder_id?: string;
  expected_reminder_revision?: number;
}
export interface ReminderCancelOperation {
  type: 'reminder.cancel';
  task_ref: string;
  expected_revision: number;
  reminder_id: string;
  expected_reminder_revision: number;
}
export type ReminderOperation =
  | ReminderScheduleOperation
  | ReminderCancelOperation;
export interface TaskReminder {
  reminderId: string;
  taskRef: string;
  title: string | null;
  remindAt: string;
  timeZone: string;
  wallTime: string | null;
  revision: number;
  status: 'pending' | 'cancelled' | 'sent';
  due: boolean;
  dueAt: string | null;
  cancelledReason: string | null;
  history: { at: string; status: string; reason: string | null }[];
}
export interface ReminderRead {
  items: TaskReminder[];
  scheduler: 'ready' | 'degraded' | 'unavailable';
}
export interface ReminderProposal {
  source?: { messageId: number | null; conversationId: string };
  proposalId: string;
  proposalRevision: number;
  kind: 'reminder';
  status: 'draft' | 'applied' | 'cancelled';
  operation: ReminderOperation;
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('reminder contract');
  return v as Record<string, unknown>;
};
const string = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('reminder string');
  return v;
};
const integer = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    throw new Error('reminder revision');
  return v;
};
const nullable = (v: unknown): string | null => (v == null ? null : string(v));
export function parseReminderOperation(raw: unknown): ReminderOperation {
  const o = object(raw);
  const base = {
    task_ref: string(o.task_ref),
    expected_revision: integer(o.expected_revision),
  };
  const prior =
    o.reminder_id === undefined
      ? {}
      : {
          reminder_id: string(o.reminder_id),
          expected_reminder_revision: integer(o.expected_reminder_revision),
        };
  if (o.type === 'reminder.cancel')
    return {
      type: o.type,
      ...base,
      reminder_id: string(o.reminder_id),
      expected_reminder_revision: integer(o.expected_reminder_revision),
    };
  if (o.type !== 'reminder.schedule') throw new Error('reminder type');
  return {
    type: o.type,
    ...base,
    ...prior,
    remind_at: string(o.remind_at),
    time_zone: string(o.time_zone),
    wall_time: string(o.wall_time),
  };
}
export function parseReminderProposal(raw: unknown): ReminderProposal {
  const o = object(raw);
  if (
    o.kind !== 'reminder' ||
    !['draft', 'applied', 'cancelled'].includes(String(o.status)) ||
    !Array.isArray(o.operations) ||
    o.operations.length !== 1
  )
    throw new Error('reminder proposal');
  return {
    ...(o.source
      ? {
          source: {
            messageId:
              object(o.source).message_id == null
                ? null
                : integer(object(o.source).message_id),
            conversationId: string(object(o.source).conversation_id),
          },
        }
      : {}),
    proposalId: string(o.proposal_id),
    proposalRevision: integer(o.proposal_revision),
    kind: 'reminder',
    status: o.status as ReminderProposal['status'],
    operation: parseReminderOperation(o.operations[0]),
  };
}
export function parseReminders(raw: unknown): ReminderRead | undefined {
  if (raw === undefined) return undefined;
  const o = object(raw);
  if (
    !Array.isArray(o.items) ||
    !['ready', 'degraded', 'unavailable'].includes(String(o.scheduler))
  )
    throw new Error('reminder read');
  return {
    scheduler: o.scheduler as ReminderRead['scheduler'],
    items: o.items.map(value => {
      const r = object(value);
      if (
        !['pending', 'cancelled', 'sent'].includes(String(r.status)) ||
        typeof r.due !== 'boolean' ||
        !Array.isArray(r.history)
      )
        throw new Error('reminder item');
      return {
        reminderId: string(r.reminder_id),
        taskRef: string(r.task_ref),
        title: nullable(r.title),
        remindAt: string(r.remind_at),
        timeZone: string(r.time_zone),
        wallTime: nullable(r.wall_time),
        revision: integer(r.revision),
        status: r.status as TaskReminder['status'],
        due: r.due,
        dueAt: nullable(r.due_at),
        cancelledReason: nullable(r.cancelled_reason),
        history: r.history.map(value => {
          const h = object(value);
          return {
            at: string(h.at),
            status: string(h.status),
            reason: nullable(h.reason),
          };
        }),
      };
    }),
  };
}
/** Require an explicit offset. A fold is selected only by the offset the user entered. */
export function reminderTime(
  instant: string,
  zone: string
): { instant: string; wall: string } | null {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      instant.trim()
    );
  if (!match || !zone.includes('/')) return null;
  const wall = match[1] + ':' + (match[2] ?? '00');
  const canonical = wall + match[3];
  const date = new Date(canonical);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
    if (
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` !== wall
    )
      return null;
  } catch {
    return null;
  }
  return { instant: canonical, wall };
}
/** Always format in the saved zone, including its UTC offset. Device-zone changes do not move it. */
export function reminderLabel(
  reminder: { remindAt: string; timeZone: string },
  locale: string
): string {
  return (
    new Intl.DateTimeFormat(locale, {
      timeZone: reminder.timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'longOffset',
    }).format(new Date(reminder.remindAt)) +
    ' · ' +
    reminder.timeZone
  );
}

export function parseSuggestedReminder(
  raw: unknown
): ReminderScheduleOperation | null {
  try {
    const o = object(raw);
    if (o.version !== 1 || o.type !== 'reminder.schedule') return null;
    const time = reminderTime(string(o.remind_at), string(o.time_zone));
    if (!time) return null;
    return {
      type: 'reminder.schedule',
      task_ref: string(o.task_ref),
      expected_revision: 0,
      remind_at: time.instant,
      time_zone: string(o.time_zone),
      wall_time: time.wall,
    };
  } catch {
    return null;
  }
}
