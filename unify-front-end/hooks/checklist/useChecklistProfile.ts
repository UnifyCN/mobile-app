import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getOnboardingProfile } from '@/services/onboarding/getOnboardingProfile';

/**
 * The onboarding-profile fields that decide which checklist a user gets.
 *
 * `refresh()` reads the profile again and resolves true when the persona or
 * province changed. A change moves the checklist cache key, so the task query
 * fetches with the new values on its own; the caller refetches only when
 * `refresh()` resolves false, which would otherwise refetch with the old ones.
 */
export function useChecklistProfile() {
  const [persona, setPersona] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const current = useRef<{ persona: string | null; province: string | null }>({
    persona: null,
    province: null,
  });

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const profile = await getOnboardingProfile(user.id);
    const next = {
      persona: profile?.persona || null,
      province: profile?.province ?? null,
    };
    const changed =
      next.persona !== current.current.persona ||
      next.province !== current.current.province;
    current.current = next;
    setPersona(next.persona);
    setProvince(next.province);
    return changed;
  }, []);

  useEffect(() => {
    load()
      .catch(error => console.error('Error fetching persona:', error))
      .finally(() => setIsLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      return await load();
    } catch (error) {
      console.error('Error refreshing checklist profile:', error);
      return false;
    }
  }, [load]);

  return { persona, province, isLoading, refresh };
}
