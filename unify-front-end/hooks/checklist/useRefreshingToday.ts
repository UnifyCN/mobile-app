import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { formatLocalDate } from '@/helpers/arrivalDate';

/**
 * Today's date, re-read when the Checklist tab gains focus and when the app
 * returns to the foreground, so a day-based card rolls over at midnight.
 * Keeps the same Date object while the local day is unchanged.
 */
export const useRefreshingToday = (): Date => {
  const [today, setToday] = useState(() => new Date());

  const refresh = useCallback(() => {
    const now = new Date();
    setToday(prev =>
      formatLocalDate(prev) === formatLocalDate(now) ? prev : now
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return today;
};
