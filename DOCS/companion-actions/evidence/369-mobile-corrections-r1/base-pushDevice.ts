import {
  assertOwned,
  ownAccountWork,
  stillOwned,
  subscribeAccount,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import type {
  PushApplyRequest,
  PushEnrollment,
  PushLocale,
  PushOperation,
} from './pushContract';
import type { PushClient, PushFailure } from './pushClient';
import {
  parsePushEnrollment,
  pushObject,
  pushLocale,
  pushRevision,
  pushSecret,
  pushToken,
  pushUuid,
} from './pushParsing';

type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type DevicePhase =
  | 'off'
  | 'on'
  | 'busy'
  | 'denied'
  | 'unsupported'
  | 'unavailable'
  | 'unknown'
  | 'not_applied'
  | 'sessionEnded'
  | PushFailure;
export interface DeviceView {
  phase: DevicePhase;
  permission: Permission | 'unknown';
  receiptSaved: boolean;
  receiptId?: string | null;
}
interface Proof {
  installation_id: string;
  installation_secret: string;
}
interface RecordValue extends Proof {
  version: 1;
  accountId: string;
  sessionId: string;
  token: string | null;
  enrollment: PushEnrollment | null;
  pending: PushApplyRequest | null;
  retired: boolean;
  receiptId?: string | null;
}
export interface PushDeviceDependencies {
  read(owner?: AccountSnapshot): Promise<string | null>;
  write(value: string, owner?: AccountSnapshot): Promise<void>;
  permission(ask: boolean): Promise<Permission>;
  token(): Promise<string>;
  proof(): Proof;
  uuid(): string;
  session(): string | null;
  client(owner: AccountSnapshot): PushClient;
}
const empty: DeviceView = {
  phase: 'off',
  permission: 'unknown',
  receiptSaved: false,
};
function stored(raw: string): RecordValue {
  const v = pushObject(JSON.parse(raw));
  if (
    !(
      v.receiptId === undefined ||
      v.receiptId === null ||
      pushUuid(v.receiptId)
    ) ||
    v.version !== 1 ||
    !pushUuid(v.installation_id) ||
    !pushSecret(v.installation_secret) ||
    typeof v.accountId !== 'string' ||
    typeof v.sessionId !== 'string' ||
    !v.sessionId ||
    typeof v.retired !== 'boolean' ||
    !(v.token === null || pushToken(v.token))
  )
    throw new Error('storage');
  const enrollment =
    v.enrollment === null ? null : parsePushEnrollment(v.enrollment);
  if (v.enrollment !== null && !enrollment) throw new Error('storage');
  if (enrollment && enrollment.installation_id !== v.installation_id)
    throw new Error('storage');
  let pending: PushApplyRequest | null = null;
  if (v.pending !== null) {
    const p = pushObject(v.pending),
      op = pushObject(p.operation),
      client = pushObject(p.client);
    const enroll = op.type === 'push.enroll';
    const fields = [
      'type',
      'installation_id',
      'installation_secret',
      'expected_revision',
      ...(enroll ? ['token', 'enabled', 'locale'] : []),
    ];
    if (
      p.action !== 'push_apply' ||
      p.contract_version !== 1 ||
      !pushUuid(p.operation_id) ||
      !['ios', 'android'].includes(String(client.platform)) ||
      typeof client.app_version !== 'string' ||
      Object.keys(client).some(k => !['platform', 'app_version'].includes(k)) ||
      Object.keys(p).some(
        k =>
          ![
            'contract_version',
            'client',
            'action',
            'operation_id',
            'authorization',
            'operation',
          ].includes(k)
      ) ||
      Object.keys(pushObject(p.authorization)).length !== 1 ||
      pushObject(p.authorization).kind !== 'ui_control' ||
      !['push.enroll', 'push.disable', 'push.revoke'].includes(
        String(op.type)
      ) ||
      op.installation_id !== v.installation_id ||
      op.installation_secret !== v.installation_secret ||
      !pushRevision(op.expected_revision) ||
      Object.keys(op).some(k => !fields.includes(k)) ||
      (enroll &&
        (!pushToken(op.token) ||
          typeof op.enabled !== 'boolean' ||
          !pushLocale(op.locale)))
    )
      throw new Error('storage');
    pending = p as unknown as PushApplyRequest;
  }
  return {
    version: 1,
    installation_id: v.installation_id,
    installation_secret: v.installation_secret,
    accountId: v.accountId,
    sessionId: v.sessionId,
    token: v.token as string | null,
    enrollment,
    pending,
    retired: v.retired,
    receiptId: v.receiptId as string | null | undefined,
  };
}
/** One serialized secure record per installation. No task state, model or analytics access. */
export class CompanionPushDevice {
  private view = empty;
  private owner: AccountSnapshot | null = null;
  private listeners = new Set<() => void>();
  private job: Promise<void> | null = null;
  private record: RecordValue | null = null;
  private receiptSaved = false;
  constructor(private deps: PushDeviceDependencies) {}
  snapshot = (): DeviceView =>
    this.owner && stillOwned(this.owner) ? this.view : empty;
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  private emit() {
    for (const cb of this.listeners) cb();
  }
  private show(
    owner: AccountSnapshot,
    phase: DevicePhase,
    permission = this.view.permission
  ) {
    assertOwned(owner);
    this.owner = owner;
    this.view = {
      phase,
      permission,
      receiptSaved: this.receiptSaved,
      receiptId: this.record?.receiptId ?? null,
    };
    this.emit();
  }
  connect = () =>
    subscribeAccount(() => {
      if (this.owner && !stillOwned(this.owner)) {
        const record = this.record,
          owner = this.owner;
        this.view = empty;
        this.owner = null;
        this.record = null;
        this.receiptSaved = false;
        this.emit();
        // Do not use any later account's JWT. Save the old owner's exact cleanup intent only.
        const prior = this.job ?? Promise.resolve();
        const retire = prior
          .then(async () => {
            const raw = await this.deps.read();
            if (!raw) return;
            const value = stored(raw);
            if (
              value.accountId !== owner.accountId ||
              !record ||
              value.sessionId !== record.sessionId ||
              value.retired
            )
              return;
            const client = this.deps.client(owner);
            const pending =
              value.pending ??
              (value.enrollment && !value.enrollment.revoked
                ? this.request(client, value, {
                    type: 'push.revoke',
                    ...this.proofOf(value),
                    expected_revision: value.enrollment.revision,
                  })
                : null);
            await this.deps.write(
              JSON.stringify({ ...value, retired: true, pending })
            );
          })
          .catch(() => {
            /* No server revocation claim. The original secure record remains. */
          });
        this.job = retire;
        void retire.finally(() => {
          if (this.job === retire) this.job = null;
        });
      }
    });
  private proofOf(v: Proof): Proof {
    return {
      installation_id: v.installation_id,
      installation_secret: v.installation_secret,
    };
  }
  private request(
    client: PushClient,
    v: RecordValue,
    op: PushOperation
  ): PushApplyRequest {
    return {
      ...client.envelope,
      action: 'push_apply',
      operation_id: this.deps.uuid(),
      authorization: { kind: 'ui_control' },
      operation: op,
    };
  }
  private async save(owner: AccountSnapshot, value: RecordValue) {
    assertOwned(owner);
    await this.deps.write(JSON.stringify(value), owner);
    assertOwned(owner);
    this.record = value;
  }
  private async load(owner: AccountSnapshot): Promise<RecordValue | null> {
    assertOwned(owner);
    const raw = await this.deps.read(owner);
    assertOwned(owner);
    const value = raw === null ? null : stored(raw);
    if (value && (value.accountId !== owner.accountId || value.retired)) {
      this.show(owner, 'sessionEnded');
      return null;
    }
    this.record = value;
    this.receiptSaved = Boolean(value?.receiptId);
    return value;
  }
  private run(
    action: (owner: AccountSnapshot, client: PushClient) => Promise<void>
  ): Promise<void> {
    // Capture at invocation, before storage, permission, token or another operation can wait.
    const owner = ownAccountWork();
    if (!stillOwned(owner)) return Promise.resolve();
    if (this.job) return this.job;
    const job = (async () => {
      try {
        this.show(owner, 'busy');
        await action(owner, this.deps.client(owner));
      } catch {
        if (stillOwned(owner)) this.show(owner, 'unavailable');
      }
    })();
    this.job = job;
    void job.finally(() => {
      if (this.job === job) this.job = null;
    });
    return job;
  }
  private async current(
    owner: AccountSnapshot,
    client: PushClient,
    value: RecordValue
  ): Promise<RecordValue | null> {
    assertOwned(owner);
    const read = await client.read(this.proofOf(value));
    assertOwned(owner);
    if (read.kind !== 'ok') {
      this.show(owner, read.kind);
      return null;
    }
    const next = { ...value, enrollment: read.value.enrollment };
    await this.save(owner, next);
    return next;
  }
  private async dispatch(
    owner: AccountSnapshot,
    client: PushClient,
    value: RecordValue
  ) {
    assertOwned(owner);
    const request = value.pending!;
    const reply = await client.apply(request);
    assertOwned(owner);
    if (reply.kind !== 'ok') {
      // Any ambiguous or disabled response keeps the durable intent for status lookup.
      const definite = [
        'unauthorized',
        'forbidden',
        'revoked',
        'collision',
        'conflict',
        'invalid',
      ].includes(reply.kind);
      if (definite) await this.save(owner, { ...value, pending: null });
      this.show(owner, reply.kind);
      return;
    }
    this.receiptSaved = true;
    const token =
      request.operation.type === 'push.enroll'
        ? request.operation.token
        : value.token;
    const next = {
      ...value,
      pending: null,
      token,
      receiptId: reply.value.operation_id,
    };
    // A receipt proves historical storage only. Clear it durably, then reconcile live state.
    await this.save(owner, next);
    const current = await this.current(owner, client, next);
    if (current) this.present(owner, current);
  }
  private present(owner: AccountSnapshot, value: RecordValue) {
    this.show(
      owner,
      value.enrollment?.revoked
        ? 'revoked'
        : value.enrollment?.enabled
          ? this.view.permission === 'granted'
            ? 'on'
            : this.view.permission === 'unsupported'
              ? 'unsupported'
              : 'denied'
          : 'off'
    );
  }
  enable = (locale: PushLocale) =>
    this.run(async (owner, client) => {
      const existing = await this.load(owner);
      if (this.view.phase === 'sessionEnded') return;
      if (existing?.pending) {
        this.show(owner, 'unknown');
        return;
      }
      assertOwned(owner);
      const permission = await this.deps.permission(true);
      assertOwned(owner);
      this.show(owner, 'busy', permission);
      if (permission !== 'granted') {
        this.show(
          owner,
          permission === 'unsupported' ? 'unsupported' : 'denied'
        );
        return;
      }
      const token = await this.deps.token();
      assertOwned(owner);
      if (!pushToken(token)) {
        this.show(owner, 'unavailable');
        return;
      }
      const sessionId = this.deps.session();
      assertOwned(owner);
      if (!sessionId) {
        this.show(owner, 'unavailable');
        return;
      }
      let value: RecordValue = existing ?? {
        version: 1,
        ...this.deps.proof(),
        accountId: owner.accountId!,
        sessionId,
        token: null,
        enrollment: null,
        pending: null,
        retired: false,
      };
      if (existing) {
        const current = await this.current(owner, client, existing);
        if (!current) return;
        value = { ...current, sessionId };
        if (
          (existing.enrollment && !current.enrollment) ||
          current.enrollment?.revoked
        ) {
          this.show(
            owner,
            current.enrollment?.revoked ? 'revoked' : 'unavailable'
          );
          return;
        }
      }
      if (
        !pushUuid(value.installation_id) ||
        !pushSecret(value.installation_secret)
      )
        throw new Error('storage');
      const operation: PushOperation = {
        type: 'push.enroll',
        ...this.proofOf(value),
        expected_revision: value.enrollment?.revision ?? 0,
        token,
        enabled: true,
        locale,
      };
      value = { ...value, pending: this.request(client, value, operation) };
      // UUID, independent secret and exact pending request persist in one SecureStore value.
      await this.save(owner, value);
      await this.dispatch(owner, client, value);
    });
  refresh = (locale: PushLocale) =>
    this.run(async (owner, client) => {
      const permission = await this.deps.permission(false);
      assertOwned(owner);
      this.show(owner, 'busy', permission);
      let value = await this.load(owner);
      if (this.view.phase === 'sessionEnded') return;
      if (!value) {
        this.show(
          owner,
          permission === 'unsupported'
            ? 'unsupported'
            : permission === 'denied'
              ? 'denied'
              : 'off'
        );
        return;
      }
      if (value.pending) {
        this.show(owner, 'unknown');
        return;
      }
      const current = await this.current(owner, client, value);
      if (!current) return;
      value = current;
      if (
        value.enrollment?.enabled &&
        !value.enrollment.revoked &&
        permission === 'granted' &&
        value.sessionId === this.deps.session()
      ) {
        const token = await this.deps.token();
        assertOwned(owner);
        if (!pushToken(token)) {
          this.show(owner, 'unavailable');
          return;
        }
        if (token !== value.token || locale !== value.enrollment.locale) {
          const pending = this.request(client, value, {
            type: 'push.enroll',
            ...this.proofOf(value),
            expected_revision: value.enrollment.revision,
            token,
            enabled: true,
            locale,
          });
          value = { ...value, pending };
          await this.save(owner, value);
          await this.dispatch(owner, client, value);
          return;
        }
      }
      // A different session must explicitly enable to renew. It cannot inherit an old retry.
      if (
        value.sessionId !== this.deps.session() &&
        value.enrollment?.enabled
      ) {
        this.show(owner, 'sessionEnded');
        return;
      }
      this.present(owner, value);
    });
  private stopDelivery(type: 'push.disable' | 'push.revoke') {
    return this.run(async (owner, client) => {
      let value = await this.load(owner);
      if (!value) return;
      if (value.pending) {
        this.show(owner, 'unknown');
        return;
      }
      const current = await this.current(owner, client, value);
      if (!current?.enrollment) return;
      value = current;
      const sessionId = this.deps.session();
      if (!sessionId) {
        this.show(owner, 'unavailable');
        return;
      }
      const pending = this.request(client, value, {
        type,
        ...this.proofOf(value),
        expected_revision: current.enrollment!.revision,
      });
      value = { ...value, sessionId, pending };
      await this.save(owner, value);
      await this.dispatch(owner, client, value);
    });
  }
  disable = (_locale: PushLocale) => this.stopDelivery('push.disable');
  revoke = () => this.stopDelivery('push.revoke');
  check = (_locale: PushLocale) =>
    this.run(async (owner, client) => {
      const value = await this.load(owner);
      if (!value?.pending) {
        if (this.view.phase !== 'sessionEnded') this.show(owner, 'off');
        return;
      }
      const result = await client.status(value.pending.operation_id);
      assertOwned(owner);
      if (result.kind !== 'ok') {
        this.show(owner, result.kind === 'unknown' ? 'unknown' : result.kind);
        return;
      }
      if (result.value.status === 'pending') {
        this.show(owner, 'unknown');
        return;
      }
      if (result.value.status === 'not_applied') {
        this.show(
          owner,
          value.sessionId === this.deps.session()
            ? 'not_applied'
            : 'sessionEnded'
        );
        return;
      }
      if (result.value.status !== 'applied') {
        this.show(owner, 'unknown');
        return;
      }
      const saved = result.value.results[0];
      if (
        saved.installation_id !== value.installation_id ||
        saved.type !== value.pending.operation.type ||
        saved.before_revision !== value.pending.operation.expected_revision
      ) {
        this.show(owner, 'unknown');
        return;
      }
      this.receiptSaved = true;
      const token =
        value.pending.operation.type === 'push.enroll'
          ? value.pending.operation.token
          : value.token;
      const next = {
        ...value,
        token,
        pending: null,
        receiptId: result.value.operation_id,
      };
      await this.save(owner, next);
      const current = await this.current(owner, client, next);
      if (current) this.present(owner, current);
    });
  retry = (locale: PushLocale) => {
    if (this.snapshot().phase !== 'not_applied') return Promise.resolve();
    return this.run(async (owner, client) => {
      const value = await this.load(owner);
      if (!value?.pending) return;
      if (value.sessionId !== this.deps.session()) {
        this.show(owner, 'sessionEnded');
        return;
      }
      // Reconfirm status and revision at the actual retry boundary. Nothing retries on pending.
      const result = await client.status(value.pending.operation_id);
      assertOwned(owner);
      if (result.kind !== 'ok' || result.value.status !== 'not_applied') {
        this.show(owner, 'unknown');
        return;
      }
      const current = await this.current(owner, client, value);
      if (!current) return;
      if (
        (current.enrollment?.revision ?? 0) !==
          value.pending.operation.expected_revision ||
        current.enrollment?.revoked
      ) {
        await this.save(owner, { ...current, pending: null });
        this.show(owner, 'conflict');
        return;
      }
      if (value.pending.operation.type === 'push.enroll') {
        const permission = await this.deps.permission(false);
        assertOwned(owner);
        this.show(owner, 'busy', permission);
        if (permission !== 'granted') {
          this.show(owner, 'denied');
          return;
        }
        const token = await this.deps.token();
        assertOwned(owner);
        if (
          token !== value.pending.operation.token ||
          locale !== value.pending.operation.locale
        ) {
          await this.save(owner, { ...current, pending: null });
          this.show(owner, 'conflict');
          return;
        }
      }
      await this.dispatch(owner, client, value);
    });
  };
}
