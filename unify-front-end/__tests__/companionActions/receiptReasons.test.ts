// #365 review S365-002: the waiting reasons a state change receipt saved, through the
// client contract. Pure parse and wording; the rendered card is in taskEdit.test.tsx.
import { parseReceipt } from '@/services/companionActions/contract';
import { receiptChanges } from '@/components/companion/tasks/editText';

const base = {
  operation_id: '7e1f1f6c-0000-4000-8000-000000000001',
  created_at: '2026-10-27T18:00:00.000Z',
  kind: 'change',
  operation_type: 'task.set_state',
  undo_of: null,
  task_ref: 'custom:1',
  before_state: 'waiting',
  after_state: 'waiting',
  before_revision: 2,
  after_revision: 3,
  undone_by: null,
  current: false,
  undoable: false,
};

it('names a replaced waiting reason, and none for an unchanged reason or a receipt saved without reasons', () => {
  // Wrong if: a legacy receipt gains a reason line or fails to parse, an unchanged reason
  // is listed as a change, or the saved values are not the ones shown.
  const changed = parseReceipt({
    ...base,
    before_waiting_reason: 'Appointment on Friday',
    after_waiting_reason: 'Appointment on Monday',
  });
  expect(changed.waitingReasons).toEqual({
    before: 'Appointment on Friday',
    after: 'Appointment on Monday',
  });
  expect(receiptChanges(changed)).toEqual([
    { field: 'waitingReason', before: 'Appointment on Friday', after: 'Appointment on Monday' },
  ]);
  const cleared = parseReceipt({
    ...base,
    after_state: 'in_progress',
    before_waiting_reason: 'Appointment on Monday',
    after_waiting_reason: null,
  });
  expect(receiptChanges(cleared)).toEqual([
    { field: 'waitingReason', before: 'Appointment on Monday', after: null },
  ]);
  const same = parseReceipt({
    ...base,
    before_state: 'not_started',
    after_state: 'in_progress',
    before_waiting_reason: null,
    after_waiting_reason: null,
  });
  expect(receiptChanges(same)).toEqual([]);
  const legacy = parseReceipt(base);
  expect(legacy.waitingReasons).toBeNull();
  expect(receiptChanges(legacy)).toEqual([]);
});
