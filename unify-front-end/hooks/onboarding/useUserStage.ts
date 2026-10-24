import { useCallback, useEffect, useRef, useState } from 'react';
import { getOnboardingProfile } from '@/services/onboarding/getOnboardingProfile';
import { syncStageCache } from '@/services/onboarding/syncStageCache';
import { getArrivalStage } from '@/helpers/arrivalDate';
import { resolveStoredStage } from '@/supabase/functions/_shared/arrivalStage';
import { supabase } from '@/lib/supabase';
import type { StageNumber } from '@/types/checklist';

interface UserStageState {
  userId: string | null;
  arrivalDate: string | null;
  persona: string | null;
  /** Computed from arrivalDate on every read. Null means unknown. */
  currentStage: StageNumber | null;
  previousStage: StageNumber | null;
  stageChanged: boolean;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_STATE: UserStageState = {
  userId: null,
  arrivalDate: null,
  persona: null,
  currentStage: null,
  previousStage: null,
  stageChanged: false,
  isLoading: true,
  error: null,
};

export const useUserStage = () => {
  const [state, setState] = useState<UserStageState>(EMPTY_STATE);
  const activeUserIdRef = useRef<string | null>(null);
  const latestLoadRef = useRef(0);
  const latestPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Each load gets a number. A load that is no longer the latest (a newer
  // refresh, an account change, or unmount) drops its result.
  const load = useCallback((): Promise<void> => {
    const loadId = ++latestLoadRef.current;
    const isStale = () => loadId !== latestLoadRef.current;

    const run = async (): Promise<void> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (isStale()) return;

        if (!user) {
          activeUserIdRef.current = null;
          throw new Error('User not authenticated');
        }

        if (activeUserIdRef.current !== user.id) {
          // A different account: drop the old account's data at once.
          activeUserIdRef.current = user.id;
          setState({ ...EMPTY_STATE, userId: user.id });
        }

        const profile = await getOnboardingProfile(user.id);
        if (isStale()) return;

        const arrivalDate = profile?.arrival_date ?? null;
        // The stored stage is a cache. Never use it without recomputing.
        const computedStage = getArrivalStage(arrivalDate);
        const storedStage = resolveStoredStage(profile?.stage);

        setState({
          userId: user.id,
          arrivalDate,
          persona: profile?.persona ?? null,
          currentStage: computedStage,
          previousStage: storedStage,
          stageChanged: storedStage !== computedStage,
          isLoading: false,
          error: null,
        });

        if (profile) {
          // Own profile only. Includes null transitions and users with no
          // persona. A failed cache write never breaks the stage.
          syncStageCache(user.id, profile.stage, computedStage).catch(
            error => console.warn('Stage cache sync failed:', error)
          );
        }
      } catch (err) {
        if (isStale()) return;
        console.error('Error checking user stage:', err);
        setState(prev => ({
          ...prev,
          currentStage: null,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    };

    // A superseded load resolves with the latest one, so a caller that
    // awaits refreshStage() sees the final state.
    const promise: Promise<void> = run().then(() => {
      const latest = latestPromiseRef.current;
      return isStale() && latest !== promise ? latest : undefined;
    });
    latestPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === activeUserIdRef.current) return;
      // Account changed or signed out: clear old state and reload.
      activeUserIdRef.current = nextUserId;
      setState(
        nextUserId
          ? { ...EMPTY_STATE, userId: nextUserId }
          : { ...EMPTY_STATE, isLoading: false }
      );
      if (nextUserId) {
        void load();
      } else {
        latestLoadRef.current++;
      }
    });

    return () => {
      subscription.unsubscribe();
      latestLoadRef.current++;
    };
  }, [load]);

  /** Reload the current account's profile and recompute the stage. */
  const refreshStage = useCallback((): Promise<void> => load(), [load]);

  return { ...state, refreshStage };
};
