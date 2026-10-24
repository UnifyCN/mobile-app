// supabase/functions/_shared/requestToday.ts
//
// "Today" for the arrival-stage rule. The stage is defined on the user's
// device-local calendar day, so a client that knows its day sends it in the
// x-local-date header (YYYY-MM-DD). Older clients send nothing and keep the
// server clock. A supplied value that is not a real calendar date is an error.

import { parseCalendarDate } from './arrivalStage.ts';

export const LOCAL_DATE_HEADER = 'x-local-date';

export type RequestToday =
  | { ok: true; today: Date }
  | { ok: false; message: string };

/** Noon on the given calendar day in the server's zone, safe from DST edges. */
export function resolveRequestToday(
  headerValue: string | null | undefined,
  serverNow: Date = new Date()
): RequestToday {
  if (headerValue === null || headerValue === undefined) {
    return { ok: true, today: serverNow };
  }
  const parts = parseCalendarDate(headerValue);
  if (!parts) {
    return { ok: false, message: `Invalid ${LOCAL_DATE_HEADER} header` };
  }
  return {
    ok: true,
    today: new Date(parts.year, parts.month - 1, parts.day, 12),
  };
}

export function readRequestToday(
  req: Request,
  serverNow: Date = new Date()
): RequestToday {
  return resolveRequestToday(req.headers.get(LOCAL_DATE_HEADER), serverNow);
}
