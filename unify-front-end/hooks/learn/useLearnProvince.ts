import { useCurrentUser } from '@/context/UserContext';
import {
  resolveUserProvince,
  type Province,
} from '@/supabase/functions/_shared/province';

/**
 * The province that decides which Learn modules show: the profile province as
 * one of the 13 names, or null for no province (national modules only).
 * `isLoading` is true until the profile has loaded, when null does not yet mean
 * "no province".
 */
export function useLearnProvince(): {
  province: Province | null;
  isLoading: boolean;
} {
  const { currentUser, isLoading } = useCurrentUser();
  return {
    province: resolveUserProvince(currentUser?.province),
    isLoading: isLoading && !currentUser,
  };
}
