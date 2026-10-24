import React, { useEffect, useMemo, useRef } from 'react';
import { ArrivalCountdownCard } from '@/components/checklist/ArrivalCountdownCard';
import { ArrivalDateSheet } from '@/components/checklist/ArrivalDateSheet';
import { formatLocalDate, getArrivalCountdown } from '@/helpers/arrivalDate';
import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import { useRefreshingToday } from '@/hooks/checklist/useRefreshingToday';
import { useAnalytics } from '@/utils/analytics';
import { trackArrivalCountdownShownOnce } from '@/utils/arrivalCountdownShown';

interface Props {
  userId: string | null;
  arrivalDate: string | null;
  /** Reloads the current account's profile and stage. */
  refreshStage: () => Promise<unknown>;
  refreshUser: () => unknown;
  refetchChecklist: () => unknown;
}

/**
 * The countdown card and its date sheet. Shows for every persona; users
 * without an arrival date get neither the card nor a way to open the sheet.
 */
export function ArrivalCountdownSection({
  userId,
  arrivalDate,
  refreshStage,
  refreshUser,
  refetchChecklist,
}: Props) {
  const today = useRefreshingToday();
  const { trackArrivalCountdownShown } = useAnalytics();
  const editor = useArrivalDateEditor({
    userId,
    arrivalDate,
    refreshStage,
    refreshUser,
    refetchChecklist,
  });

  const countdown = useMemo(
    () => getArrivalCountdown(arrivalDate, today),
    [arrivalDate, today]
  );
  const day = formatLocalDate(today);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    if (!userId || countdown.state === 'hidden') return;
    void trackArrivalCountdownShownOnce({
      userId,
      day,
      isCurrent: () => userIdRef.current === userId,
      emit: () => trackArrivalCountdownShown(countdown),
    });
  }, [userId, day, countdown, trackArrivalCountdownShown]);

  if (countdown.state === 'hidden' || !arrivalDate) return null;

  return (
    <>
      <ArrivalCountdownCard countdown={countdown} onPress={editor.open} />
      <ArrivalDateSheet
        visible={editor.isOpen}
        arrivalDate={arrivalDate}
        isSaving={editor.isSaving}
        onSave={editor.save}
        onClose={editor.close}
      />
    </>
  );
}
