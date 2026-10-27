/**
 * One invocation's time and request budget, shared by every source it serves.
 *
 * It starts at handler entry. At WORK_DEADLINE_MS every fetch and provider
 * call is aborted and no new work starts; release, logging and status reads
 * may still run. At RESPONSE_BACKSTOP_MS the handler answers and no store,
 * provider, cleanup or log call may start at all. A database call that was
 * already sent can still commit after its wait is aborted: the SQL checks
 * every commit, and the caller reports the outcome as unknown.
 */

/** The clock and timers an invocation's budget runs on. */
export interface Timers {
  /** Monotonic milliseconds. */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realTimers: Timers = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id as number),
};

/** No fetch or provider call is in flight after this, and no work starts. */
export const WORK_DEADLINE_MS = 95_000;
/** The handler answers by this time (pg_net gives up at 120 s). */
export const RESPONSE_BACKSTOP_MS = 110_000;
/** The longest wait for one database call. */
export const RPC_CEILING_MS = 15_000;
/** Provider requests per invocation, across sources, failures included. */
export const MAX_SENDS_PER_INVOCATION = 25;
/** Work time a fresh source needs before its claim, stamp and fetch. */
export const FRESH_START_MS = 20_000;
/** Work time a continuation needs before its claim. */
export const CONTINUATION_START_MS = 10_000;
/** Share time a batch needs before its reservation. */
export const BATCH_START_MS = 2_000;
/** The longest wait for one provider answer, body included. */
export const PROVIDER_TIMEOUT_MS = 30_000;

/** The backstop passed: no call of any kind may start. */
export class BackstopError extends Error {
  constructor() {
    super('The response deadline passed');
    this.name = 'BackstopError';
  }
}

export interface ScopedSignal {
  signal: AbortSignal;
  dispose(): void;
}

export class Budget {
  private readonly start: number;
  private readonly work = new AbortController();
  private readonly response = new AbortController();
  private readonly timerIds: unknown[] = [];
  private isClosed = false;
  /** Resolves when the response backstop passes. */
  readonly backstop: Promise<void>;
  /** Provider requests started in this invocation. */
  sends = 0;

  constructor(private readonly timers: Timers) {
    this.start = timers.now();
    let fire = () => {};
    this.backstop = new Promise<void>(resolve => (fire = resolve));
    this.timerIds.push(
      timers.setTimeout(() => this.work.abort(), WORK_DEADLINE_MS),
      timers.setTimeout(() => {
        this.close();
        fire();
      }, RESPONSE_BACKSTOP_MS)
    );
  }

  elapsed(): number {
    return this.timers.now() - this.start;
  }

  /** Work time left before the work deadline. */
  workLeft(): number {
    return this.work.signal.aborted
      ? 0
      : Math.max(0, WORK_DEADLINE_MS - this.elapsed());
  }

  get closed(): boolean {
    return this.isClosed || this.elapsed() >= RESPONSE_BACKSTOP_MS;
  }

  /** The backstop: everything in flight is aborted and nothing may start. */
  close(): void {
    this.isClosed = true;
    this.work.abort();
    this.response.abort();
  }

  dispose(): void {
    for (const id of this.timerIds) this.timers.clearTimeout(id);
    this.timerIds.length = 0;
  }

  /** Throws when no call of any kind may start. */
  assertOpen(): void {
    if (this.closed) throw new BackstopError();
  }

  /** Aborts at `endsAt` (elapsed ms), at the work deadline, or at the backstop. */
  workSignal(endsAt: number): ScopedSignal {
    return this.scoped(
      Math.min(endsAt, WORK_DEADLINE_MS) - this.elapsed(),
      this.work.signal
    );
  }

  /** One database wait: at most RPC_CEILING_MS and never past the backstop. */
  rpcSignal(): ScopedSignal {
    return this.scoped(
      Math.min(RPC_CEILING_MS, RESPONSE_BACKSTOP_MS - this.elapsed()),
      this.response.signal
    );
  }

  private scoped(ms: number, parent: AbortSignal): ScopedSignal {
    const own = new AbortController();
    const id =
      ms <= 0 ? undefined : this.timers.setTimeout(() => own.abort(), ms);
    if (ms <= 0) own.abort();
    return {
      signal: AbortSignal.any([own.signal, parent]),
      dispose: () => {
        if (id !== undefined) this.timers.clearTimeout(id);
      },
    };
  }
}
