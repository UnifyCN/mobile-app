import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getModuleProvince } from '@/services/sanity/modules';
import { useLearnProvince } from '@/hooks/learn/useLearnProvince';
import { isVisibleForProvince } from '@/supabase/functions/_shared/province';
import type { SanityModule } from '@/types/sanity';

type ModuleProvince = Awaited<ReturnType<typeof getModuleProvince>>;

type ModuleAccess = 'unknown' | 'allowed' | 'denied';

/**
 * Whether the signed-in user may open a Learn module.
 *
 * `access` is `unknown` while the profile or the module's tag is still
 * loading, `denied` for a module tagged with another province, `allowed`
 * otherwise. A route with no module, or a module that does not exist, is
 * `allowed`: the screen keeps its own not-found behavior.
 *
 * When the tag lookup has failed all its attempts, `access` stays `unknown`
 * (unknown content is never allowed) and `lookupFailed` is true until `retry()`
 * runs the lookup again.
 */
export function useModuleAccess(moduleId: string | undefined): {
  access: ModuleAccess;
  lookupFailed: boolean;
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const { province, isLoading: provinceLoading } = useLearnProvince();

  const { data, isError, isFetching, refetch } = useQuery<ModuleProvince>({
    queryKey: ['sanity', 'moduleProvince', moduleId],
    queryFn: () => getModuleProvince(moduleId!),
    enabled: !!moduleId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // The module list already carries the tag, so a module opened from Learn
    // needs no extra round trip.
    initialData: () => {
      for (const [, list] of queryClient.getQueriesData<SanityModule[]>({
        queryKey: ['sanity', 'modules'],
      })) {
        const module = list?.find(m => m._id === moduleId);
        if (module) return { found: true, province: module.province ?? null };
      }
      return undefined;
    },
  });

  const retry = () => {
    void refetch();
  };
  const lookupFailed = !!moduleId && !data && isError && !isFetching;

  let access: ModuleAccess;
  if (!moduleId) access = 'allowed';
  else if (provinceLoading || !data) access = 'unknown';
  else if (!data.found) access = 'allowed';
  else
    access = isVisibleForProvince(data.province, province)
      ? 'allowed'
      : 'denied';
  return { access, lookupFailed, retry };
}
