import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'es',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
  },
}));

jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: jest.fn() },
}));

import { sanityClient } from '@/sanity-custom';
import { useChecklistTasks } from '@/hooks/checklist/useChecklistTasks';
import {
  buildChecklistCacheStorageKey,
  loadChecklistFromDisk,
  saveChecklistToDisk,
} from '@/utils/checklistTaskCache';

const mockFetch = sanityClient.fetch as jest.Mock;
const cachedTasks = [
  {
    user_task_id: 0,
    user_id: 'user-1',
    task_id: null,
    custom_task_id: null,
    sanity_checklist_id: 'checklist-base',
    completed: false,
    completed_at: null,
    source: 'sanity',
    task: {
      task_name: 'Tarea guardada',
      task_description: 'Disponible sin conexión',
      priority: 'Do now',
    },
  },
] as any;

describe('checklist offline revalidation', () => {
  beforeEach(() => mockFetch.mockReset());

  it('loads the checklist for the Other/Newcomer persona', async () => {
    mockFetch.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () =>
        useChecklistTasks({
          currentStage: 4,
          stageChanged: false,
          persona: 'other',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ persona: 'other', stage: 'years_3_plus' })
    );

    unmount();
    client.clear();
  });

  it('keeps same-language hydrated tasks when Sanity revalidation fails', async () => {
    const key = buildChecklistCacheStorageKey(
      'user-1',
      1,
      'skilled_worker',
      false,
      'es'
    );
    await saveChecklistToDisk(key, cachedTasks);
    mockFetch.mockRejectedValue(new Error('offline'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () =>
        useChecklistTasks({
          currentStage: 1,
          stageChanged: false,
          persona: 'skilled_worker',
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.tasks[0]?.task.task_name).toBe('Tarea guardada')
    );
    await waitFor(() => expect(result.current.error).toContain('offline'));
    expect(result.current.tasks).toEqual(cachedTasks);
    await expect(loadChecklistFromDisk(key)).resolves.toEqual(cachedTasks);

    unmount();
    client.clear();
    consoleSpy.mockRestore();
  });
});
