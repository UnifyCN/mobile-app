import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { getDaysUntilArrival } from '@/helpers/arrivalDate';
import { beginArrivalWrite } from '@/services/onboarding/arrivalCache';
import {
  updateArrivalDate,
  type ConfirmedArrival,
} from '@/services/onboarding/updateArrivalDate';
import { useAnalytics } from '@/utils/analytics';

interface UseArrivalDateEditorArgs {
  userId: string | null;
  arrivalDate: string | null;
  /** Reloads the current account's profile and stage. */
  refreshStage: () => Promise<unknown>;
  /** Refreshes the current-user cache. */
  refreshUser: () => unknown;
  refetchChecklist: () => unknown;
  /** Puts the confirmed date and stage into the screen state before any re-read. */
  applyConfirmedArrival: (confirmed: ConfirmedArrival) => void;
}

/** Runs a follow-up step and keeps any failure away from the save result. */
const settle = async (label: string, step: () => unknown) => {
  try {
    await step();
  } catch (error) {
    console.warn(`[arrival date] ${label} failed after save:`, error);
  }
};

export const useArrivalDateEditor = ({
  userId,
  arrivalDate,
  refreshStage,
  refreshUser,
  refetchChecklist,
  applyConfirmedArrival,
}: UseArrivalDateEditorArgs) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { trackArrivalDateChanged } = useAnalytics();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const userIdRef = useRef(userId);
  const arrivalDateRef = useRef(arrivalDate);
  const savingRef = useRef(false);
  // Counts every period in which a save may belong to this screen. An account
  // change or an unmount starts a new period, so a save from an earlier one
  // cannot touch the sheet or send telemetry as the wrong account.
  const periodRef = useRef(0);
  userIdRef.current = userId;
  arrivalDateRef.current = arrivalDate;

  // A different account never inherits an open sheet or a running save.
  useEffect(() => {
    periodRef.current++;
    savingRef.current = false;
    setIsOpen(false);
    setIsSaving(false);
  }, [userId]);

  useEffect(
    () => () => {
      periodRef.current++;
    },
    []
  );

  const open = useCallback(() => {
    if (!userIdRef.current || !arrivalDateRef.current) return;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const save = useCallback(
    async (newDate: string) => {
      const saveUserId = userIdRef.current;
      if (!saveUserId || savingRef.current) return;
      if (newDate === arrivalDateRef.current) return;

      const savePeriod = periodRef.current;
      const isCurrent = () =>
        periodRef.current === savePeriod && userIdRef.current === saveUserId;

      savingRef.current = true;
      setIsSaving(true);

      // Orders this write against every other one for the account, including
      // writes from editors that have unmounted.
      const write = beginArrivalWrite(queryClient, saveUserId);
      let confirmed: ConfirmedArrival;
      try {
        confirmed = await updateArrivalDate(saveUserId, newDate);
      } catch (error) {
        write.fail();
        if (!isCurrent()) return;
        console.error('Error saving arrival date:', error);
        savingRef.current = false;
        setIsSaving(false);
        Alert.alert(t('common.error'), t('checklist.arrivalDate.saveError'));
        return;
      }

      // The write landed. Everything below must never look like a failed save.
      // Query caches belong to the account, not to this screen, so they take
      // the confirmed date even if the screen has gone, unless a newer write
      // for the account has replaced it.
      try {
        await write.confirm(confirmed);
      } catch (error) {
        console.warn('[arrival date] cache update failed after save:', error);
      }
      if (!isCurrent()) return;

      try {
        applyConfirmedArrival(confirmed);
      } catch (error) {
        console.warn('[arrival date] state update failed after save:', error);
      }
      savingRef.current = false;
      setIsSaving(false);
      setIsOpen(false);

      try {
        const days = getDaysUntilArrival(newDate);
        if (days !== null) trackArrivalDateChanged(days);
      } catch (error) {
        console.warn('[arrival date] analytics failed after save:', error);
      }

      await Promise.all([
        settle('stage refresh', refreshStage),
        settle('user refresh', refreshUser),
      ]);
      if (!isCurrent()) return;
      await settle('checklist refresh', refetchChecklist);
    },
    [
      applyConfirmedArrival,
      queryClient,
      refetchChecklist,
      refreshStage,
      refreshUser,
      t,
      trackArrivalDateChanged,
    ]
  );

  return { isOpen, isSaving, open, close, save };
};
