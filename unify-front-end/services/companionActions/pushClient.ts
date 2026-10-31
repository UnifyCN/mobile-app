import {
  assertOwned,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import type { Transport, TransportReply } from './client';
import type {
  PushApplyRequest,
  PushLocale,
  PushReadRequest,
} from './pushContract';
import {
  parsePushRead,
  parsePushReceipt,
  parsePushStatus,
  parsePushTarget,
  pushObject,
} from './pushParsing';
export type PushFailure =
  | 'unknown'
  | 'unauthorized'
  | 'forbidden'
  | 'revoked'
  | 'collision'
  | 'conflict'
  | 'invalid'
  | 'serviceDisabled';
export type PushResult<T> = { kind: 'ok'; value: T } | { kind: PushFailure };
function failure(r: TransportReply): { kind: PushFailure } {
  const error = pushObject(r.body).error;
  if (r.status === 401) return { kind: 'unauthorized' };
  if (r.status === 403)
    return { kind: error === 'installation_revoked' ? 'revoked' : 'forbidden' };
  if (r.status === 409)
    return { kind: error === 'token_in_use' ? 'collision' : 'conflict' };
  if (r.status === 422 || r.status === 426) return { kind: 'invalid' };
  if (
    r.status === 503 &&
    (error === 'push_disabled' || error === 'feature_unavailable')
  )
    return { kind: 'serviceDisabled' };
  return { kind: 'unknown' };
}
/** Same authenticated boundary as task actions. There is no automatic write retry. */
export function createPushClient(opts: {
  transport: Transport;
  platform: 'ios' | 'android';
  appVersion: string;
  owner?: AccountSnapshot;
}) {
  const envelope = {
    contract_version: 1 as const,
    client: { platform: opts.platform, app_version: opts.appVersion },
  };
  async function send<T>(
    body: Record<string, unknown>,
    parser: (raw: unknown) => T | null
  ): Promise<PushResult<T>> {
    if (opts.owner) assertOwned(opts.owner);
    let reply: TransportReply;
    try {
      reply = await opts.transport(body);
    } catch {
      if (opts.owner) assertOwned(opts.owner);
      return { kind: 'unknown' };
    }
    if (opts.owner) assertOwned(opts.owner);
    if (reply.status !== 200) return failure(reply);
    const value = parser(reply.body);
    return value === null ? { kind: 'unknown' } : { kind: 'ok', value };
  }
  return {
    envelope,
    apply: (request: PushApplyRequest) =>
      send({ ...request }, raw => {
        const parsed = parsePushReceipt(raw);
        return parsed?.operation_id === request.operation_id &&
          parsed.results[0].installation_id ===
            request.operation.installation_id &&
          parsed.results[0].type === request.operation.type &&
          parsed.results[0].before_revision ===
            request.operation.expected_revision
          ? parsed
          : null;
      }),
    read: (
      proof: Pick<PushReadRequest, 'installation_id' | 'installation_secret'>
    ) =>
      send({ ...envelope, action: 'push_read', ...proof }, raw => {
        const parsed = parsePushRead(raw);
        return parsed &&
          (!parsed.enrollment ||
            parsed.enrollment.installation_id === proof.installation_id)
          ? parsed
          : null;
      }),
    status: (id: string) =>
      send({ ...envelope, action: 'status', operation_id: id }, raw => {
        const parsed = parsePushStatus(raw);
        return parsed?.operation_id === id ? parsed : null;
      }),
    resolve: (deliveryId: string, language: PushLocale) =>
      send(
        {
          ...envelope,
          action: 'push_resolve',
          delivery_id: deliveryId,
          language,
        },
        parsePushTarget
      ),
  };
}
export type PushClient = ReturnType<typeof createPushClient>;
