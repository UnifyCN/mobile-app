// A clock and timers that move only when a test moves them. Test support
// only, not imported by production code. Time passes inside a fake call by
// `advance`, which fires every timer that falls due, in order, synchronously.
import type { Timers } from './budget.ts';

export class ManualClock implements Timers {
  private time = 0;
  private nextId = 1;
  private pending = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.pending.set(id, { at: this.time + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.pending.delete(id as number);
  }

  /** Moves time forward by `ms`, firing due timers in time order. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let first: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.pending) {
        if (entry[1].at <= target && (!first || entry[1].at < first[1].at)) {
          first = entry;
        }
      }
      if (!first) break;
      this.pending.delete(first[0]);
      this.time = first[1].at;
      first[1].fn();
    }
    this.time = target;
  }
}
