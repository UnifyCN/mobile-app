import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';
import { cleanupAsync } from '@testing-library/react-native';

const disposals = new Set<() => void>();

export function createTestQueryClient(config?: QueryClientConfig): QueryClient {
  const client = new QueryClient(config);
  const cache = client.getQueryCache();
  const mutationCache = client.getMutationCache();
  const resources = new Set<{ destroy(): void }>([
    ...cache.getAll(),
    ...mutationCache.getAll(),
  ]);
  const stopQueries = cache.subscribe(event => {
    if (event.type === 'added') resources.add(event.query);
  });
  const stopMutations = mutationCache.subscribe(event => {
    if (event.type === 'added') resources.add(event.mutation);
  });
  disposals.add(() => {
    client.clear();
    stopQueries();
    stopMutations();
    // Removed queries and completed mutations can still have collection timers.
    // client.clear() cannot reach removed queries or stop mutation timers.
    resources.forEach(resource => resource.destroy());
    resources.clear();
  });
  return client;
}

export function disposeTestQueryClients(): void {
  disposals.forEach(dispose => dispose());
  disposals.clear();
}

afterEach(async () => {
  await cleanupAsync();
  disposeTestQueryClients();
});
