// #370 S370-1: the store itself approves a conflicting detail Undo's reviewed change only
// for the current detail the service named, whatever the view shows or a caller asks.
import type { TaskActionClient, UndoResult } from '@/services/companionActions/client';
import type { CurrentDetailValue, DetailRemoveOperation } from '@/services/companionActions/contract';
import { TaskActionStore } from '@/services/companionActions/taskActionStore';

const DETAIL = 'e1000000-0000-4000-8000-000000000001';
const op: DetailRemoveOperation = { type: 'detail.remove', detail_id: DETAIL, expected_revision: 2 };
const shown: CurrentDetailValue = {
  detailId: DETAIL,
  text: 'I can attend appointments on Saturdays',
  revision: 2,
  removed: false,
};

function storeWith(currentDetail: CurrentDetailValue | null) {
  const conflict: UndoResult = {
    kind: 'undo_conflict',
    current: [],
    currentDetail,
    proposal: { proposalId: 'p1', proposalRevision: 1, operations: [op] },
  };
  const apply = jest.fn(async () => ({ kind: 'conflict' }) as never);
  const client = { undo: jest.fn(async () => conflict), apply } as unknown as TaskActionClient;
  let n = 0;
  const store = new TaskActionStore({ client, newOperationId: () => `op-${++n}`, onChanged: () => {} });
  return { store, apply };
}

describe('approveCompensation of a detail change (S370-1)', () => {
  it.each([
    ['absent', null],
    ['another detail', { ...shown, detailId: 'e1000000-0000-4000-8000-000000000999' }],
    ['another revision', { ...shown, revision: 3 }],
    ['a removed detail', { ...shown, removed: true }],
  ] as const)('current_detail %s: nothing is sent, even with removal confirmed', async (_name, current) => {
    const { store, apply } = storeWith(current);
    await store.undo('detail:r1', 'receipt-1', { removalConfirmed: true });
    expect(store.get('detail:r1').phase).toBe('undo_review');
    await store.approveCompensation('detail:r1', { removalConfirmed: true });
    expect(apply).not.toHaveBeenCalled();
  });

  it('the verified current detail is approved once, bound to the proposal', async () => {
    const { store, apply } = storeWith(shown);
    await store.undo('detail:r1', 'receipt-1', { removalConfirmed: true });
    await store.approveCompensation('detail:r1', { removalConfirmed: true });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('op-2', op, {
      kind: 'approved_proposal',
      proposal_id: 'p1',
      proposal_revision: 1,
      removal_confirmed: true,
    });
  });
});
