import type {
  PushApplyReply,
  PushEnrollment,
  PushLocale,
  PushNotificationIntent,
  PushStatusReply,
  PushTarget,
} from './pushContract';
export const pushObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const pushUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const pushSecret = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const pushToken = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{1,200}\]$/.test(v);
export const pushLocale = (v: unknown): v is PushLocale =>
  ['ar', 'en', 'es', 'fr-CA', 'hi', 'pa', 'vi'].includes(String(v));
export const pushRevision = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
const pushType = (
  v: unknown
): v is PushApplyReply['receipt']['operation_type'] =>
  ['push.enroll', 'push.disable', 'push.revoke'].includes(String(v));
export function parsePushEnrollment(raw: unknown): PushEnrollment | null {
  const v = pushObject(raw);
  if (
    !pushUuid(v.installation_id) ||
    !pushRevision(v.revision) ||
    v.revision < 1 ||
    !pushUuid(v.generation) ||
    typeof v.enabled !== 'boolean' ||
    typeof v.revoked !== 'boolean' ||
    !pushLocale(v.locale) ||
    (v.revoked && v.enabled)
  )
    return null;
  return {
    installation_id: v.installation_id,
    revision: v.revision,
    generation: v.generation,
    enabled: v.enabled,
    revoked: v.revoked,
    locale: v.locale,
  };
}
export function parsePushRead(
  raw: unknown
): { enrollment: PushEnrollment | null } | null {
  const v = pushObject(raw);
  if (v.enrollment === null) return { enrollment: null };
  const enrollment = parsePushEnrollment(v.enrollment);
  return enrollment ? { enrollment } : null;
}
export function parsePushReceipt(raw: unknown): PushApplyReply | null {
  const v = pushObject(raw),
    r = pushObject(v.receipt);
  if (
    v.status !== 'applied' ||
    typeof v.replayed !== 'boolean' ||
    !pushUuid(v.operation_id) ||
    r.operation_id !== v.operation_id ||
    !pushType(r.operation_type) ||
    r.undoable !== false ||
    !(r.current === null || typeof r.current === 'boolean') ||
    !Array.isArray(v.results) ||
    v.results.length !== 1
  )
    return null;
  const result = pushObject(v.results[0]),
    enrollment = parsePushEnrollment(result);
  if (
    !enrollment ||
    result.type !== r.operation_type ||
    !pushRevision(result.before_revision) ||
    !pushRevision(result.after_revision) ||
    result.after_revision !== enrollment.revision ||
    result.before_revision + 1 !== result.after_revision
  )
    return null;
  return {
    status: 'applied',
    replayed: v.replayed,
    operation_id: v.operation_id,
    results: [
      {
        ...enrollment,
        type: r.operation_type,
        before_revision: result.before_revision,
        after_revision: result.after_revision,
      },
    ],
    receipt: {
      operation_id: v.operation_id,
      operation_type: r.operation_type,
      undoable: false,
      current: r.current,
    },
  };
}
export function parsePushStatus(raw: unknown): PushStatusReply | null {
  const v = pushObject(raw);
  if (
    pushUuid(v.operation_id) &&
    (v.status === 'pending' || v.status === 'not_applied')
  )
    return { status: v.status, operation_id: v.operation_id };
  // Status may omit the replay marker. It still contains the full immutable receipt.
  const parsed = parsePushReceipt({
    ...v,
    replayed: typeof v.replayed === 'boolean' ? v.replayed : true,
  });
  if (!parsed) return null;
  const { replayed: _replayed, ...status } = parsed;
  return status;
}
export function parsePushIntent(raw: unknown): PushNotificationIntent | null {
  const v = pushObject(raw);
  return v.type === 'companion_reminder' && pushUuid(v.delivery_id)
    ? { type: 'companion_reminder', delivery_id: v.delivery_id }
    : null;
}
export function parsePushTarget(raw: unknown): PushTarget | null {
  const v = pushObject(raw);
  if (v.target === 'unavailable') return { target: 'unavailable' };
  if (
    v.target !== 'available' ||
    typeof v.task_ref !== 'string' ||
    !/^(custom:[1-9][0-9]{0,17}|sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.test(
      v.task_ref
    )
  )
    return null;
  return { target: 'available', task_ref: v.task_ref };
}
