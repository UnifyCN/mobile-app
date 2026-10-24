import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('@/hooks/sanity/useSanityLanguage', () => ({
  useSanityLanguage: () => 'es',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      // Offline with an unexpired stored session: getSession() reads it from
      // storage, but getUser() needs the network and resolves with a null user.
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: new Error('Network request failed'),
      }),
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
import { supabase } from '@/lib/supabase';
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
          province: null,
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
    const key = buildChecklistCacheStorageKey({
      userId: 'user-1',
      stage: 1,
      personaSlug: 'skilled_worker',
      stageChanged: false,
      language: 'es',
      province: null,
    });
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
          province: null,
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.tasks[0]?.task.task_name).toBe('Tarea guardada')
    );
    await waitFor(() => expect(result.current.error).toContain('offline'));
    expect(result.current.tasks).toEqual(cachedTasks);
    await expect(loadChecklistFromDisk(key)).resolves.toEqual(cachedTasks);
    // The user ID comes from the stored session, not a network lookup.
    expect(supabase.auth.getUser).not.toHaveBeenCalled();

    unmount();
    client.clear();
    consoleSpy.mockRestore();
  });

  describe('province targeting', () => {
    const renderChecklist = (province: string | null) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const view = renderHook(
        () =>
          useChecklistTasks({
            currentStage: 1,
            stageChanged: false,
            persona: 'skilled_worker',
            province,
          }),
        { wrapper }
      );
      return { ...view, client };
    };

    it('asks Sanity for the user province', async () => {
      mockFetch.mockResolvedValue([]);
      const { result, unmount, client } = renderChecklist('Ontario');

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ province: 'Ontario' })
      );

      unmount();
      client.clear();
    });

    it('asks for national items only when the user has no province', async () => {
      mockFetch.mockResolvedValue([]);
      const { result, unmount, client } = renderChecklist(null);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ province: '' })
      );

      unmount();
      client.clear();
    });

    it('does not show another province cached tasks while offline', async () => {
      await saveChecklistToDisk(
        buildChecklistCacheStorageKey({
      userId: 'user-1',
      stage: 1,
      personaSlug: 'skilled_worker',
      stageChanged: false,
      language: 'es',
      province: 'British Columbia',
    }),
        cachedTasks
      );
      mockFetch.mockRejectedValue(new Error('offline'));
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { result, unmount, client } = renderChecklist('Ontario');

      await waitFor(() => expect(result.current.error).toContain('offline'));
      expect(result.current.tasks).toEqual([]);

      unmount();
      client.clear();
      consoleSpy.mockRestore();
    });

    it('shows the same province cached tasks while offline', async () => {
      await saveChecklistToDisk(
        buildChecklistCacheStorageKey({
      userId: 'user-1',
      stage: 1,
      personaSlug: 'skilled_worker',
      stageChanged: false,
      language: 'es',
      province: 'Ontario',
    }),
        cachedTasks
      );
      mockFetch.mockRejectedValue(new Error('offline'));
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { result, unmount, client } = renderChecklist('ON');

      await waitFor(() => expect(result.current.error).toContain('offline'));
      expect(result.current.tasks).toEqual(cachedTasks);

      unmount();
      client.clear();
      consoleSpy.mockRestore();
    });
  });
});
