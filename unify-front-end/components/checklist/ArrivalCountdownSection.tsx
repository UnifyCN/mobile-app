import React, { useEffect, useMemo, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ArrivalCountdownCard } from '@/components/checklist/ArrivalCountdownCard';
import { ArrivalDateSheet } from '@/components/checklist/ArrivalDateSheet';
import { formatLocalDate, getArrivalCountdown } from '@/helpers/arrivalDate';
import { useArrivalDateEditor } from '@/hooks/checklist/useArrivalDateEditor';
import type { ConfirmedArrival } from '@/services/onboarding/updateArrivalDate';
import { useAnalytics } from '@/utils/analytics';
import { trackArrivalCountdownShownOnce } from '@/utils/arrivalCountdownShown';

interface Props {
  userId: string | null;
  arrivalDate: string | null;
  /**
   * The screen's local day. The screen owns it, so the card, the stage and the
   * checklist always use the same day.
   */
  today: Date;
  /** Reloads the current account's profile and stage. */
  refreshStage: () => Promise<unknown>;
  refreshUser: () => unknown;
  refetchChecklist: () => unknown;
  applyConfirmedArrival: (confirmed: ConfirmedArrival) => void;
}

/**
 * The countdown card and its date sheet. Shows for every persona; users
 * without an arrival date get neither the card nor a way to open the sheet.
 */
export function ArrivalCountdownSection({
  userId,
  arrivalDate,
  today,
  refreshStage,
  refreshUser,
  refetchChecklist,
  applyConfirmedArrival,
}: Props) {
  const isFocused = useIsFocused();
  const { trackArrivalCountdownShown } = useAnalytics();
  const editor = useArrivalDateEditor({
    userId,
    arrivalDate,
    refreshStage,
    refreshUser,
    refetchChecklist,
    applyConfirmedArrival,
  });

  const countdown = useMemo(
    () => getArrivalCountdown(arrivalDate, today),
    [arrivalDate, today]
  );
  const day = formatLocalDate(today);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // False once this section is gone. A storage read that finishes later must
  // not send the event as whichever account is signed in by then.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The card counts as shown only while the tab is in front. A retained tab
  // that is hidden when the day rolls over claims nothing until it is focused.
  useEffect(() => {
    if (!isFocused || !userId || countdown.state === 'hidden') return;
    void trackArrivalCountdownShownOnce({
      userId,
      day,
      isCurrent: () => mountedRef.current && userIdRef.current === userId,
      emit: () => trackArrivalCountdownShown(countdown),
    });
  }, [isFocused, userId, day, countdown, trackArrivalCountdownShown]);

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
