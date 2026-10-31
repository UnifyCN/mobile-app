/**
 * The checklist stage mapping for the hook: every stage maps to its Sanity
 * slug, unknown uses the first-months checklist, and the no-persona result
 * is unchanged.
 */
import { createElement, type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/testSupport/queryClient';
import { renderHook, waitFor } from '@testing-library/react-native';

const mockGetChecklist = jest.fn();

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'en',
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
      // The checklist hook follows auth changes (#361); none happen here.
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));
jest.mock('@/services/checklist/getChecklistWithUserProgress', () => ({
  getChecklistWithUserProgress: (...args: unknown[]) => mockGetChecklist(...args),
}));
jest.mock('@/services/checklist/checklistTaskOrder', () => ({
  getChecklistTaskOrders: jest.fn().mockResolvedValue([]),
}));

import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';

const run = async (params: Parameters<typeof useChecklistTasks>[0]) => {
  const client = createTestQueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(() => useChecklistTasks(params), { wrapper });
  return { ...hook, client };
};

describe('useChecklistTasks stage mapping', () => {
  beforeEach(() => mockGetChecklist.mockReset().mockResolvedValue([]));

  it.each([
    [0, 'not_arrived'],
    [1, 'arrived_0_3_months'],
    [2, 'months_3_12'],
    [3, 'years_1_3'],
    [4, 'years_3_plus'],
    [null, 'arrived_0_3_months'],
  ])('stage %p loads the %s checklist', async (currentStage, slug) => {
    const { result, unmount, client } = await run({
      currentStage,
      stageChanged: false,
      persona: 'skilled_worker',
      province: null,
    });
    await waitFor(() => expect(mockGetChecklist).toHaveBeenCalled());
    expect(mockGetChecklist).toHaveBeenCalledWith(
      'user-1',
      'skilled_worker',
      slug,
      expect.objectContaining({ language: 'en' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    unmount();
    client.clear();
  });

  it('keeps the no-persona call for an unknown stage', async () => {
    const { result, unmount, client } = await run({
      currentStage: null,
      stageChanged: false,
      persona: null,
      province: null,
    });
    await waitFor(() => expect(mockGetChecklist).toHaveBeenCalled());
    expect(mockGetChecklist).toHaveBeenCalledWith(
      'user-1',
      null,
      'arrived_0_3_months',
      expect.anything()
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks).toEqual([]);
    unmount();
    client.clear();
  });

  it('keeps the no-persona call for a known stage', async () => {
    const { unmount, client } = await run({
      currentStage: 0,
      stageChanged: false,
      persona: null,
      province: null,
    });
    await waitFor(() => expect(mockGetChecklist).toHaveBeenCalled());
    expect(mockGetChecklist).toHaveBeenCalledWith(
      'user-1',
      null,
      'not_arrived',
      expect.anything()
    );
    unmount();
    client.clear();
  });

  it('waits for the stage to resolve before loading anything', async () => {
    const { result, unmount, client } = await run({
      currentStage: null,
      stageChanged: false,
      persona: 'skilled_worker',
      province: null,
      isStageLoading: true,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockGetChecklist).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    unmount();
    client.clear();
  });

  it('loads the new stage when the stage resolves from loading to unknown', async () => {
    let loading = true;
    const client = createTestQueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children);
    const { rerender, unmount } = renderHook(
      () =>
        useChecklistTasks({
          currentStage: null,
          stageChanged: false,
          persona: 'skilled_worker',
          province: null,
          isStageLoading: loading,
        }),
      { wrapper }
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mockGetChecklist).not.toHaveBeenCalled();
    loading = false;
    rerender({});
    await waitFor(() => expect(mockGetChecklist).toHaveBeenCalledTimes(1));
    expect(mockGetChecklist).toHaveBeenCalledWith(
      'user-1',
      'skilled_worker',
      'arrived_0_3_months',
      expect.anything()
    );
    unmount();
    client.clear();
  });
});
