import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getDaysUntilArrival } from '@/helpers/arrivalDate';
import { updateArrivalDate } from '@/services/onboarding/updateArrivalDate';
import { useAnalytics } from '@/utils/analytics';

interface UseArrivalDateEditorArgs {
  userId: string | null;
  arrivalDate: string | null;
  /** Reloads the current account's profile and stage. */
  refreshStage: () => Promise<unknown>;
  /** Refreshes the current-user cache. */
  refreshUser: () => unknown;
  refetchChecklist: () => unknown;
}

/** Runs a refresh step and keeps any failure away from the save result. */
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
}: UseArrivalDateEditorArgs) => {
  const { t } = useTranslation();
  const { trackArrivalDateChanged } = useAnalytics();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const userIdRef = useRef(userId);
  const arrivalDateRef = useRef(arrivalDate);
  const savingRef = useRef(false);
  userIdRef.current = userId;
  arrivalDateRef.current = arrivalDate;

  // A different account never inherits an open sheet or a running save.
  useEffect(() => {
    savingRef.current = false;
    setIsOpen(false);
    setIsSaving(false);
  }, [userId]);

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

      savingRef.current = true;
      setIsSaving(true);

      try {
        await updateArrivalDate(saveUserId, newDate);
      } catch (error) {
        if (userIdRef.current !== saveUserId) return;
        console.error('Error saving arrival date:', error);
        savingRef.current = false;
        setIsSaving(false);
        Alert.alert(t('common.error'), t('checklist.arrivalDate.saveError'));
        return;
      }

      // The write landed. Everything below must never look like a failed save.
      if (userIdRef.current !== saveUserId) return;
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
      if (userIdRef.current !== saveUserId) return;
      await settle('checklist refresh', refetchChecklist);
    },
    [refetchChecklist, refreshStage, refreshUser, t, trackArrivalDateChanged]
  );

  return { isOpen, isSaving, open, close, save };
};
