export const DEADLINE_KINDS = [
  'study_permit',
  'work_permit',
  'pr_card',
  'health_card',
  'sin',
  'tax_filing',
  'insurance',
  'passport',
  'other',
] as const;

export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** A user-owned date. Never holds document numbers, scans, or photos. */
export interface Deadline {
  id: number;
  user_id: string;
  kind: DeadlineKind;
  title: string;
  /** ISO calendar date, YYYY-MM-DD, no time zone. */
  due_date: string;
  /** When set, this date belongs to a checklist task (its order key). */
  linked_task_key: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeadlineInput {
  kind: DeadlineKind;
  title: string;
  due_date: string;
  linked_task_key?: string | null;
}

/** Days before the due date on which a reminder fires. */
export const REMINDER_OFFSETS_DAYS = [90, 30, 7] as const;
