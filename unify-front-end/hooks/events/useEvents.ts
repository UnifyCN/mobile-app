import { getAllEvents } from '@/services/events/getAllEvents';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

const EVENTS_STALE_MS = 1000 * 60 * 2;
const EVENTS_RECOVERY_MS = 30 * 1000;

export const useEvents = (upcomingLimit?: number) => {
  const query = useQuery({
    queryKey:
      upcomingLimit === undefined
        ? ['events']
        : ['events', 'upcoming', upcomingLimit],
    queryFn: () =>
      getAllEvents(upcomingLimit === undefined ? undefined : { upcomingLimit }),
    staleTime: query => {
      const firstStart =
        upcomingLimit === undefined
          ? NaN
          : Date.parse(query.state.data?.[0]?.eventDatetime ?? '');
      return Number.isFinite(firstStart)
        ? Math.max(
            0,
            Math.min(EVENTS_STALE_MS, firstStart - query.state.dataUpdatedAt)
          )
        : EVENTS_STALE_MS;
    },
    gcTime: 1000 * 60 * 5, // 5 minutes
  });

  const firstStart =
    upcomingLimit === undefined
      ? NaN
      : Date.parse(query.data?.[0]?.eventDatetime ?? '');
  const { refetch } = query;
  useEffect(() => {
    if (!Number.isFinite(firstStart)) return;
    let cancelled = false;
    let nextStart = firstStart;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(
        () => {
          void replaceStartedEvents();
        },
        Math.min(0x7fffffff, Math.max(1, delay))
      );
    };
    const replaceStartedEvents = async () => {
      if (cancelled) return;
      // Long deadlines can require more than one maximum-size timeout.
      if (Date.now() <= nextStart) {
        schedule(nextStart - Date.now() + 1);
        return;
      }
      try {
        const result = await refetch();
        if (cancelled) return;
        nextStart = Date.parse(result.data?.[0]?.eventDatetime ?? '');
        if (result.isError || nextStart <= Date.now())
          schedule(EVENTS_RECOVERY_MS);
        else if (Number.isFinite(nextStart))
          schedule(nextStart - Date.now() + 1);
      } catch {
        if (!cancelled) schedule(EVENTS_RECOVERY_MS);
      }
    };
    schedule(nextStart - Date.now() + 1);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [firstStart, refetch]);

  return query;
};
