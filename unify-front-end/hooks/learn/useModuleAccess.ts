import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getModuleProvince } from '@/services/sanity/modules';
import { useLearnProvince } from '@/hooks/learn/useLearnProvince';
import { isVisibleForProvince } from '@/supabase/functions/_shared/province';
import type { SanityModule } from '@/types/sanity';

type ModuleProvince = Awaited<ReturnType<typeof getModuleProvince>>;

/**
 * Whether the signed-in user may open a Learn module.
 *
 * `unknown` while the profile or the module's tag is still loading, `denied`
 * for a module tagged with another province, `allowed` otherwise. A route with
 * no module, or a module that does not exist, is `allowed`: the screen keeps
 * its own not-found behavior.
 */
export function useModuleAccess(
  moduleId: string | undefined
): 'unknown' | 'allowed' | 'denied' {
  const queryClient = useQueryClient();
  const { province, isLoading: provinceLoading } = useLearnProvince();

  const { data } = useQuery<ModuleProvince>({
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

  if (!moduleId) return 'allowed';
  if (provinceLoading || !data) return 'unknown';
  if (!data.found) return 'allowed';
  return isVisibleForProvince(data.province, province) ? 'allowed' : 'denied';
}
