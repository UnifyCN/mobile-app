import {
  applyOrderWithinPriority,
  getChecklistTaskOrderKey,
  normalizeChecklistPriority,
  replacePriorityBucket,
  CHECKLIST_PRIORITY_ORDER,
} from '@/utils/checklistOrder';
import { UserTaskWithDetails } from '@/types/checklist';

function makeSanityTask(
  sanityId: string,
  priority: string,
  name: string
): UserTaskWithDetails {
  return {
    user_task_id: 0,
    user_id: 'u1',
    task_id: null,
    sanity_checklist_id: sanityId,
    completed: false,
    completed_at: null,
    dismissed_at: null,
    source: 'sanity',
    task: {
      task_name: name,
      task_description: '',
      priority: priority as any,
    },
  };
}

function makeCustomTask(
  customId: number,
  priority: string,
  name: string
): UserTaskWithDetails {
  return {
    user_task_id: 0,
    user_id: 'u1',
    task_id: null,
    custom_task_id: customId,
    sanity_checklist_id: null,
    completed: false,
    completed_at: null,
    dismissed_at: null,
    source: 'custom',
    task: {
      task_name: name,
      task_description: '',
      priority: priority as any,
    },
  };
}

describe('checklistOrder', () => {
  describe('getChecklistTaskOrderKey', () => {
    it('returns sanity: prefix for sanity tasks', () => {
      const task = makeSanityTask('abc', 'Do now', 'Test');
      expect(getChecklistTaskOrderKey(task)).toBe('sanity:abc');
    });

    it('returns custom: prefix for custom tasks', () => {
      const task = makeCustomTask(42, 'Do now', 'Test');
      expect(getChecklistTaskOrderKey(task)).toBe('custom:42');
    });
  });

  describe('normalizeChecklistPriority', () => {
    it('normalizes "Explore & connect" to "Explore and connect"', () => {
      expect(normalizeChecklistPriority('Explore & connect')).toBe(
        'Explore and connect'
      );
    });

    it('leaves other priorities unchanged', () => {
      expect(normalizeChecklistPriority('Do now')).toBe('Do now');
    });
  });

  describe('applyOrderWithinPriority', () => {
    it('reorders tasks according to saved order', () => {
      const a = makeSanityTask('a', 'Do now', 'A');
      const b = makeSanityTask('b', 'Do now', 'B');
      const c = makeSanityTask('c', 'Do now', 'C');

      const result = applyOrderWithinPriority(
        [a, b, c],
        ['sanity:c', 'sanity:a', 'sanity:b']
      );

      expect(result.map(t => t.task.task_name)).toEqual(['C', 'A', 'B']);
    });

    it('appends tasks not in saved order at the end', () => {
      const a = makeSanityTask('a', 'Do now', 'A');
      const b = makeSanityTask('b', 'Do now', 'B');
      const c = makeSanityTask('c', 'Do now', 'C');

      const result = applyOrderWithinPriority([a, b, c], ['sanity:b']);

      expect(result.map(t => t.task.task_name)).toEqual(['B', 'A', 'C']);
    });

    it('returns original order when savedOrder is empty', () => {
      const a = makeSanityTask('a', 'Do now', 'A');
      const b = makeSanityTask('b', 'Do now', 'B');

      const result = applyOrderWithinPriority([a, b], []);
      expect(result.map(t => t.task.task_name)).toEqual(['A', 'B']);
    });

    it('returns original order when savedOrder is null', () => {
      const a = makeSanityTask('a', 'Do now', 'A');
      const result = applyOrderWithinPriority([a], null);
      expect(result.map(t => t.task.task_name)).toEqual(['A']);
    });
  });

  describe('replacePriorityBucket', () => {
    it('replaces tasks in the target bucket while keeping others', () => {
      const doNow = makeSanityTask('a', 'Do now', 'A');
      const doSoon = makeSanityTask('b', 'Do soon', 'B');
      const newDoNow = makeSanityTask('c', 'Do now', 'C');

      const result = replacePriorityBucket([doNow, doSoon], 'Do now', [
        newDoNow,
      ]);

      const names = result.map(t => t.task.task_name);
      expect(names).toEqual(['C', 'B']);
    });
  });
});
