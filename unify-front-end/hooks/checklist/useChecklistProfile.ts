import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getOnboardingProfile } from '@/services/onboarding/getOnboardingProfile';

/**
 * The onboarding-profile fields that decide which checklist a user gets.
 *
 * `refresh()` reads the profile again and resolves true when the caller must
 * not refetch tasks: the persona or province changed, or this read was
 * replaced by a newer one (or the screen is gone). A change moves the checklist
 * cache key, so the task query fetches with the new values on its own; a
 * replaced read leaves the decision to the newer one. The caller refetches only
 * when `refresh()` resolves false, which would otherwise refetch with the old
 * values.
 *
 * Reads can overlap (mount and focus, or repeated focus). Only the latest read
 * may update the profile, so an older response never restores an older province.
 */
export function useChecklistProfile() {
  const [persona, setPersona] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const current = useRef<{ persona: string | null; province: string | null }>({
    persona: null,
    province: null,
  });
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const isLatestRequest = () => requestId === requestSequence.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isLatestRequest()) return true;
      if (!user) return false;

      const profile = await getOnboardingProfile(user.id);
      if (!isLatestRequest()) return true;
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
    } finally {
      // The newest read decides when the profile is known, whatever its outcome.
      if (isLatestRequest()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(error => console.error('Error fetching persona:', error));
    return () => {
      // Replaces any read still in flight, so nothing is written after unmount.
      requestSequence.current += 1;
    };
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
