import { formatLocalDate } from '@/helpers/arrivalDate';
import { LOCAL_DATE_HEADER } from '@/supabase/functions/_shared/requestToday';

/** Header that tells an edge function this device's calendar day. */
export const localDateHeaders = (
  now: Date = new Date()
): Record<string, string> => ({ [LOCAL_DATE_HEADER]: formatLocalDate(now) });
