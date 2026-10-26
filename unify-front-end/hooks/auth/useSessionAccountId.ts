import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * The signed-in account id, from the stored session and every later auth change
 * (sign-in, sign-out, another account). Undefined until the session is read.
 * Screens that hold private work key it by this id, so a new account never
 * renders the previous account's data (mobile-app#361).
 */
export function useSessionAccountId(): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setUserId(data.session?.user.id ?? null);
      })
      .catch(error => {
        console.warn('[useSessionAccountId] Failed to read the session:', error);
        if (!cancelled) setUserId(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
  return userId;
}
