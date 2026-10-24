import { useCallback, useEffect, useRef, useState } from 'react';
import { getOnboardingProfile } from '@/services/onboarding/getOnboardingProfile';
import { syncStageCache } from '@/services/onboarding/syncStageCache';
import type { ConfirmedArrival } from '@/services/onboarding/updateArrivalDate';
import { getArrivalStage } from '@/helpers/arrivalDate';
import { resolveStoredStage } from '@/supabase/functions/_shared/arrivalStage';
import { supabase } from '@/lib/supabase';
import type { StageNumber } from '@/types/checklist';

interface UserStageState {
  userId: string | null;
  arrivalDate: string | null;
  persona: string | null;
  /** Stored stage cache as last read or confirmed. Never used without recomputing. */
  previousStage: StageNumber | null;
  /** True once a profile read, or a confirmed write, has filled this state. */
  loaded: boolean;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_STATE: UserStageState = {
  userId: null,
  arrivalDate: null,
  persona: null,
  previousStage: null,
  loaded: false,
  isLoading: true,
  error: null,
};

/**
 * The signed-in user's profile fields and arrival stage. The stage is a pure
 * function of the arrival date and `today`, so a screen that passes its
 * refreshing local day sees the stage change at midnight with no profile read.
 */
export const useUserStage = (today?: Date) => {
  const [state, setState] = useState<UserStageState>(EMPTY_STATE);
  const activeUserIdRef = useRef<string | null>(null);
  // The account whose profile fields are in state. Null until a load lands.
  const loadedUserIdRef = useRef<string | null>(null);
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
          loadedUserIdRef.current = null;
          setState({ ...EMPTY_STATE, userId: user.id });
        }

        const profile = await getOnboardingProfile(user.id);
        if (isStale()) return;

        const arrivalDate = profile?.arrival_date ?? null;
        // The stored stage is a cache. Never use it without recomputing.
        const computedStage = getArrivalStage(arrivalDate);

        loadedUserIdRef.current = user.id;
        setState({
          userId: user.id,
          arrivalDate,
          persona: profile?.persona ?? null,
          previousStage: resolveStoredStage(profile?.stage),
          loaded: true,
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
        // Keep what the screen already knows. A failed read must not erase a
        // confirmed arrival date.
        setState(prev => ({
          ...prev,
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
      loadedUserIdRef.current = null;
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

  /**
   * Take a confirmed arrival-date write into state before any re-read. It
   * drops reads that started earlier, so an older answer cannot bring back the
   * previous date. Ignored for another account or before the first load.
   */
  const applyConfirmedArrival = useCallback(
    (confirmed: ConfirmedArrival): void => {
      if (
        activeUserIdRef.current !== confirmed.id ||
        loadedUserIdRef.current !== confirmed.id
      ) {
        return;
      }
      latestLoadRef.current++;
      setState(prev =>
        prev.userId !== confirmed.id
          ? prev
          : {
              ...prev,
              arrivalDate: confirmed.arrival_date,
              previousStage: confirmed.stage,
              isLoading: false,
              error: null,
            }
      );
    },
    []
  );

  const currentStage = getArrivalStage(state.arrivalDate, today ?? new Date());
  const { loaded, ...fields } = state;

  return {
    ...fields,
    /** Computed from arrivalDate and today on every read. Null means unknown. */
    currentStage,
    stageChanged: loaded && state.previousStage !== currentStage,
    refreshStage,
    applyConfirmedArrival,
  };
};
