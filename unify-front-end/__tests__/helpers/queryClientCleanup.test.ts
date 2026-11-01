import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import {
  createTestQueryClient,
  disposeTestQueryClients,
} from '@/testSupport/queryClient';

afterEach(() => jest.useRealTimers());

it('stops collection timers for a query removed while its observer was mounted', () => {
  jest.useFakeTimers();
  const outsideTimer = setTimeout(() => {}, 1000);
  const client = createTestQueryClient();
  const observer = new QueryObserver(client, {
    queryKey: ['account', 'A'],
    enabled: false,
    gcTime: 604_800_000,
  });
  const unsubscribe = observer.subscribe(() => {});
  client.removeQueries({ queryKey: ['account', 'A'] });
  observer.setOptions({
    queryKey: ['account', 'B'],
    enabled: false,
    gcTime: 300_000,
  });
  unsubscribe();
  client.clear();

  // The removed query schedules collection when its last observer detaches.
  expect(jest.getTimerCount()).toBeGreaterThan(1);
  disposeTestQueryClients();

  // Dispose only fixture resources. The unrelated application timer stays.
  expect(jest.getTimerCount()).toBe(1);
  clearTimeout(outsideTimer);
});

it('stops collection timers for completed mutations after cache removal', async () => {
  jest.useFakeTimers();
  const outsideTimer = setTimeout(() => {}, 1000);
  const client = createTestQueryClient();
  const observer = new MutationObserver(client, {
    mutationFn: async (value: string) => value,
    gcTime: 300_000,
  });
  const unsubscribe = observer.subscribe(() => {});
  await expect(observer.mutate('first message')).resolves.toBe('first message');
  client.getMutationCache().clear();
  await expect(observer.mutate('second message')).resolves.toBe('second message');
  unsubscribe();
  client.clear();

  expect(jest.getTimerCount()).toBeGreaterThan(1);
  disposeTestQueryClients();

  expect(jest.getTimerCount()).toBe(1);
  clearTimeout(outsideTimer);
});
