import type { UserTaskWithDetails, Priority } from '@/types/checklist';
import type { Deadline } from '@/types/deadlines';
import { REMINDER_OFFSETS_DAYS } from '@/types/deadlines';
import {
  getChecklistTaskOrderKey,
  normalizeChecklistPriority,
  CHECKLIST_PRIORITY_ORDER,
} from '@/utils/checklistOrder';

/**
 * Checklist 2.0 groups the list by time horizon. Buckets ("Do now", ...)
 * become tags. See DESIGN.md "Current decisions".
 */
export type Horizon = 'week' | 'month' | 'later';
export const HORIZON_ORDER: Horizon[] = ['week', 'month', 'later'];

export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;

export type HorizonItem =
  | { kind: 'deadline'; key: string; deadline: Deadline; daysLeft: number }
  | {
      kind: 'task';
      key: string;
      task: UserTaskWithDetails;
      /** Present when the user attached a date to this task. */
      deadline: Deadline | null;
      daysLeft: number | null;
    };

export type HorizonRow =
  | {
      type: 'header';
      key: string;
      horizon: Horizon;
      completedCount: number;
      totalCount: number;
    }
  | { type: 'item'; key: string; horizon: Horizon; item: HorizonItem }
  | { type: 'empty'; key: string; horizon: Horizon };

/** Parse YYYY-MM-DD as a local calendar date at noon (DST-safe). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from `today` to `dueISO`. Negative when overdue. */
export function daysUntil(dueISO: string, today: Date): number {
  const due = parseLocalDate(dueISO);
  const base = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12
  );
  return Math.round((due.getTime() - base.getTime()) / 86_400_000);
}

export function horizonForDays(days: number): Horizon {
  if (days <= WEEK_DAYS) return 'week';
  if (days <= MONTH_DAYS) return 'month';
  return 'later';
}

/** Undated tasks land in a horizon by their bucket. A user-set date wins. */
export function horizonForPriority(priority: Priority): Horizon {
  switch (normalizeChecklistPriority(priority)) {
    case 'Do now':
      return 'week';
    case 'Do soon':
      return 'month';
    default:
      return 'later';
  }
}

const priorityRank = new Map(CHECKLIST_PRIORITY_ORDER.map((p, i) => [p, i]));

function itemSortTuple(item: HorizonItem): [number, number, number, number] {
  const completed = item.kind === 'deadline'
    ? item.deadline.completed
    : item.task.completed;
  const days = item.daysLeft;
  // completed last; dated before undated; earlier dates first; then bucket order
  const rank = item.kind === 'task'
    ? (priorityRank.get(normalizeChecklistPriority(item.task.task.priority)) ?? 99)
    : -1;
  return [completed ? 1 : 0, days === null ? 1 : 0, days ?? 0, rank];
}

function compareItems(a: HorizonItem, b: HorizonItem): number {
  const ta = itemSortTuple(a);
  const tb = itemSortTuple(b);
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i];
  }
  return 0;
}

export function buildHorizonRows(
  tasks: UserTaskWithDetails[],
  deadlines: Deadline[],
  today: Date
): HorizonRow[] {
  const byTaskKey = new Map<string, Deadline>();
  const standalone: Deadline[] = [];
  for (const d of deadlines) {
    if (d.linked_task_key) byTaskKey.set(d.linked_task_key, d);
    else standalone.push(d);
  }

  const groups: Record<Horizon, HorizonItem[]> = { week: [], month: [], later: [] };

  for (const d of standalone) {
    const daysLeft = daysUntil(d.due_date, today);
    groups[horizonForDays(daysLeft)].push({
      kind: 'deadline',
      key: `deadline:${d.id}`,
      deadline: d,
      daysLeft,
    });
  }

  for (const task of tasks) {
    const key = getChecklistTaskOrderKey(task);
    const linked = byTaskKey.get(key) ?? null;
    const daysLeft = linked ? daysUntil(linked.due_date, today) : null;
    const horizon =
      daysLeft !== null
        ? horizonForDays(daysLeft)
        : horizonForPriority(task.task.priority);
    groups[horizon].push({
      kind: 'task',
      key: `task:${key}`,
      task,
      deadline: linked,
      daysLeft,
    });
  }

  const rows: HorizonRow[] = [];
  for (const horizon of HORIZON_ORDER) {
    const items = groups[horizon].sort(compareItems);
    // "This week" always renders so the screen can answer "what is due now".
    if (items.length === 0 && horizon !== 'week') continue;
    rows.push({
      type: 'header',
      key: `header:${horizon}`,
      horizon,
      completedCount: items.filter(i =>
        i.kind === 'deadline' ? i.deadline.completed : i.task.completed
      ).length,
      totalCount: items.length,
    });
    if (items.length === 0) {
      rows.push({ type: 'empty', key: `empty:${horizon}`, horizon });
      continue;
    }
    for (const item of items) {
      rows.push({ type: 'item', key: item.key, horizon, item });
    }
  }
  return rows;
}

/** The first horizon that holds an open item; drives the screen title. */
export function leadingHorizon(rows: HorizonRow[]): Horizon {
  for (const r of rows) {
    if (r.type === 'item') {
      const open = r.item.kind === 'deadline'
        ? !r.item.deadline.completed
        : !r.item.task.completed;
      if (open) return r.horizon;
    }
  }
  return 'week';
}

/**
 * Future reminder trigger times for a due date: 09:00 local on each of the
 * offset days before it. Past triggers are dropped, so a date added 20 days
 * out yields only the 7-day reminder.
 */
export function reminderTriggerDates(
  dueISO: string,
  now: Date,
  offsets: readonly number[] = REMINDER_OFFSETS_DAYS
): { offsetDays: number; date: Date }[] {
  const due = parseLocalDate(dueISO);
  const out: { offsetDays: number; date: Date }[] = [];
  for (const offsetDays of offsets) {
    const date = new Date(
      due.getFullYear(),
      due.getMonth(),
      due.getDate() - offsetDays,
      9,
      0,
      0,
      0
    );
    if (date.getTime() > now.getTime()) out.push({ offsetDays, date });
  }
  return out;
}
