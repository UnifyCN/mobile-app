import {
  buildHorizonRows,
  daysUntil,
  horizonForDays,
  horizonForPriority,
  leadingHorizon,
  reminderTriggerDates,
  toISODate,
} from '@/utils/checklistHorizons';
import type { UserTaskWithDetails } from '@/types/checklist';
import type { Deadline } from '@/types/deadlines';

const TODAY = new Date(2026, 8, 3, 15, 30); // Sep 3, 2026 afternoon

function task(
  id: string,
  priority: UserTaskWithDetails['task']['priority'],
  completed = false
): UserTaskWithDetails {
  return {
    user_task_id: 0,
    user_id: 'u1',
    task_id: null,
    sanity_checklist_id: id,
    completed,
    completed_at: null,
    source: 'sanity',
    task: { task_name: id, task_description: '', priority },
  };
}

function deadline(
  id: number,
  due_date: string,
  extra: Partial<Deadline> = {}
): Deadline {
  return {
    id,
    user_id: 'u1',
    kind: 'other',
    title: `d${id}`,
    due_date,
    linked_task_key: null,
    completed: false,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...extra,
  };
}

describe('daysUntil', () => {
  it('counts whole calendar days regardless of time of day', () => {
    expect(daysUntil('2026-09-03', TODAY)).toBe(0);
    expect(daysUntil('2026-09-08', TODAY)).toBe(5);
    expect(daysUntil('2026-08-30', TODAY)).toBe(-4);
    expect(daysUntil('2026-11-12', TODAY)).toBe(70);
  });

  it('is stable across a DST change', () => {
    expect(daysUntil('2026-11-02', new Date(2026, 9, 30, 23, 59))).toBe(3);
  });
});

describe('horizons', () => {
  it('maps day counts to week / month / later', () => {
    expect(horizonForDays(-4)).toBe('week');
    expect(horizonForDays(7)).toBe('week');
    expect(horizonForDays(8)).toBe('month');
    expect(horizonForDays(30)).toBe('month');
    expect(horizonForDays(31)).toBe('later');
  });

  it('maps undated buckets by the agreed rule', () => {
    expect(horizonForPriority('Do now')).toBe('week');
    expect(horizonForPriority('Do soon')).toBe('month');
    expect(horizonForPriority('Explore and connect')).toBe('later');
    expect(horizonForPriority('Explore & connect')).toBe('later');
    expect(horizonForPriority('Optional / later')).toBe('later');
  });
});

describe('buildHorizonRows', () => {
  it('always renders This week, with an empty row when nothing is due', () => {
    const rows = buildHorizonRows([task('a', 'Optional / later')], [], TODAY);
    expect(rows.map(r => r.type)).toEqual(['header', 'empty', 'header', 'item']);
    expect(rows[0]).toMatchObject({ horizon: 'week', totalCount: 0 });
    expect(rows[2]).toMatchObject({ horizon: 'later', totalCount: 1 });
  });

  it('orders overdue first, then dated ascending, then undated by bucket, completed last', () => {
    const tasks = [
      task('opt', 'Optional / later'),
      task('now-done', 'Do now', true),
      task('now', 'Do now'),
      task('linked', 'Do now'),
    ];
    const deadlines = [
      deadline(1, '2026-09-08'),
      deadline(2, '2026-08-30'),
      deadline(3, '2026-09-05', { linked_task_key: 'sanity:linked' }),
    ];
    const rows = buildHorizonRows(tasks, deadlines, TODAY);
    const week = rows
      .filter(r => r.type === 'item' && r.horizon === 'week')
      .map(r => (r as any).item.key);
    expect(week).toEqual([
      'deadline:2', // -4 days
      'task:sanity:linked', // +2 days, via linked date
      'deadline:1', // +5 days
      'task:sanity:now', // undated Do now
      'task:sanity:now-done', // completed last
    ]);
  });

  it('a user-set date moves a task out of its bucket horizon', () => {
    const rows = buildHorizonRows(
      [task('t', 'Optional / later')],
      [deadline(9, '2026-09-06', { linked_task_key: 'sanity:t' })],
      TODAY
    );
    const item = rows.find(r => r.type === 'item') as any;
    expect(item.horizon).toBe('week');
    expect(item.item.daysLeft).toBe(3);
    expect(item.item.deadline.id).toBe(9);
  });

  it('counts completion per horizon header', () => {
    const rows = buildHorizonRows(
      [task('a', 'Do now', true), task('b', 'Do now')],
      [deadline(1, '2026-09-04', { completed: true })],
      TODAY
    );
    expect(rows[0]).toMatchObject({ horizon: 'week', completedCount: 2, totalCount: 3 });
  });
});

describe('leadingHorizon', () => {
  it('returns the first horizon with an open item', () => {
    const rows = buildHorizonRows(
      [task('a', 'Do now', true), task('b', 'Explore and connect')],
      [],
      TODAY
    );
    expect(leadingHorizon(rows)).toBe('later');
  });
  it('falls back to week when everything is done', () => {
    expect(leadingHorizon(buildHorizonRows([], [], TODAY))).toBe('week');
  });
});

describe('reminderTriggerDates', () => {
  it('schedules 09:00 local on each offset day that is still in the future', () => {
    const out = reminderTriggerDates('2026-11-12', TODAY);
    expect(out.map(o => o.offsetDays)).toEqual([30, 7]); // 90-day trigger (Aug 14) is past
    expect(out[0].date.getHours()).toBe(9);
    expect(toISODate(out[0].date)).toBe('2026-10-13');
    expect(toISODate(out[1].date)).toBe('2026-11-05');
  });

  it('returns nothing for a date that is already within 7 days or past', () => {
    expect(reminderTriggerDates('2026-09-08', TODAY)).toEqual([]);
    expect(reminderTriggerDates('2026-08-30', TODAY)).toEqual([]);
  });

  it('keeps all three when the date is far enough out', () => {
    expect(reminderTriggerDates('2027-04-30', TODAY).map(o => o.offsetDays)).toEqual([90, 30, 7]);
  });
});
