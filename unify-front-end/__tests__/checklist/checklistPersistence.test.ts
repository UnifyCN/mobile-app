import { supabase } from '@/lib/supabase';
import { setChecklistItemCompletion } from '@/services/checklist/setChecklistItemCompletion';
import { setChecklistItemDismissed } from '@/services/checklist/setChecklistItemDismissed';

jest.mock('@/lib/supabase', () => {
  const secondEq = jest.fn();
  const firstEq = jest.fn(() => ({ eq: secondEq }));
  const update = jest.fn(() => ({ eq: firstEq }));
  const upsert = jest.fn();
  const from = jest.fn(() => ({ update, upsert }));
  return {
    supabase: {
      from,
      __mocks: { firstEq, secondEq, update, upsert, from },
    },
  };
});

const mocks = (
  supabase as unknown as {
    __mocks: Record<string, jest.Mock>;
  }
).__mocks;

describe('checklist user-state persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.secondEq.mockResolvedValue({ error: null });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('unchecks a task without deleting its dismissal state', async () => {
    await setChecklistItemCompletion('user-1', 'sanity-1', false);

    expect(mocks.update).toHaveBeenCalledWith({
      completed: false,
      completed_at: null,
    });
    expect(mocks.firstEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.secondEq).toHaveBeenCalledWith(
      'sanity_checklist_id',
      'sanity-1'
    );
  });

  it('stores a removal on the same per-user task row', async () => {
    await setChecklistItemDismissed('user-1', 'sanity-1', true);

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        sanity_checklist_id: 'sanity-1',
        dismissed_at: expect.any(String),
      }),
      { onConflict: 'user_id,sanity_checklist_id' }
    );
  });
});
