import {
  assertOwned,
  ownAccountWork,
  stillOwned,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import type { PushLocale, PushTarget } from './pushContract';
import type { PushResult } from './pushClient';
import { parsePushIntent } from './pushParsing';
type Entry = { deliveryId: string; owner: AccountSnapshot | null };
export type PushSelection = {
  deliveryId: string;
  owner: AccountSnapshot;
  target: PushTarget | { target: 'failed' };
};
interface IntentDependencies {
  resolve(
    owner: AccountSnapshot,
    deliveryId: string,
    locale: PushLocale
  ): Promise<PushResult<PushTarget>>;
  navigate(): void;
  last(): unknown;
  clear(): void;
}
/** Shared by the root and Companion. Payload URLs, titles and task IDs never enter it. */
export class CompanionPushIntents {
  private queue: Entry[] = [];
  private handled = new Set<string>();
  private selection: PushSelection | null = null;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private locale: PushLocale = 'en';
  private routed = new Set<string>();
  constructor(private deps: IntentDependencies) {}
  snapshot = () =>
    this.selection && stillOwned(this.selection.owner) ? this.selection : null;
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  private emit() {
    for (const cb of this.listeners) cb();
  }
  private key(owner: AccountSnapshot, id: string) {
    return `${owner.accountId}:${owner.epoch}:${id}`;
  }
  receive(raw: unknown, captured = ownAccountWork()) {
    const intent = parsePushIntent(raw);
    if (!intent) return;
    if (typeof captured.accountId === 'string' && !stillOwned(captured)) return;
    const owner = stillOwned(captured) ? captured : null;
    if (owner && this.handled.has(this.key(owner, intent.delivery_id))) return;
    if (
      this.queue.some(
        e =>
          e.deliveryId === intent.delivery_id &&
          (!e.owner ||
            (owner &&
              this.key(e.owner, e.deliveryId) ===
                this.key(owner, intent.delivery_id)))
      )
    )
      return;
    this.queue.push({ deliveryId: intent.delivery_id, owner });
  }
  invalidate() {
    this.queue = this.queue.filter(e => !e.owner || stillOwned(e.owner));
    if (this.selection && !stillOwned(this.selection.owner))
      this.selection = null;
    this.emit();
  }
  process(locale: PushLocale): Promise<void> {
    const owner = ownAccountWork();
    if (!stillOwned(owner)) return Promise.resolve();
    this.locale = locale;
    if (this.running)
      return this.running.then(() => {
        if (stillOwned(owner)) return this.process(locale);
      });
    if (
      this.selection &&
      stillOwned(this.selection.owner) &&
      this.selection.target.target !== 'failed'
    )
      return Promise.resolve();
    this.invalidate();
    const entry = this.queue[0];
    if (!entry) return Promise.resolve();
    entry.owner ??= owner;
    if (this.handled.has(this.key(owner, entry.deliveryId))) {
      this.queue.shift();
      return this.process(locale);
    }
    const job = (async () => {
      try {
        assertOwned(owner);
        const result = await this.deps.resolve(owner, entry.deliveryId, locale);
        assertOwned(owner);
        if (!this.queue.includes(entry)) return;
        this.selection = {
          deliveryId: entry.deliveryId,
          owner,
          target: result.kind === 'ok' ? result.value : { target: 'failed' },
        };
        this.emit();
        assertOwned(owner);
        const key = this.key(owner, entry.deliveryId);
        if (!this.routed.has(key)) {
          this.routed.add(key);
          this.deps.navigate();
        }
      } catch {
        /* Ownership loss leaves no task, title or navigation result. */
      }
    })();
    this.running = job;
    void job.finally(() => {
      if (this.running === job) this.running = null;
    });
    return job;
  }
  complete(deliveryId: string) {
    const selected = this.snapshot();
    if (!selected || selected.deliveryId !== deliveryId) return;
    assertOwned(selected.owner);
    // The screen acknowledges only after it opens the owned result sheet.
    if (selected.target.target !== 'failed') {
      this.handled.add(this.key(selected.owner, deliveryId));
      this.queue = this.queue.filter(
        e => e.deliveryId !== deliveryId || e.owner !== selected.owner
      );
      const last = parsePushIntent(this.deps.last());
      assertOwned(selected.owner);
      // Synchronous SDK check+clear cannot erase a newer warm event across an await.
      if (last?.delivery_id === deliveryId) this.deps.clear();
    }
    this.selection = null;
    this.emit();
    if (selected.target.target !== 'failed') void this.process(this.locale);
  }
}
