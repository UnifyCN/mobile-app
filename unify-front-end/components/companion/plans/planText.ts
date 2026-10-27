import type { TFunction } from 'i18next';
import type { PlanReceipt, PlanResult } from '@/services/companionActions/planContract';

type T = TFunction | ((key: string, options?: Record<string, unknown>) => string);

/** Titles exactly as the receipt recorded them when it was saved (history, not the current rows). */
export const recordedTitles = (results: PlanResult[], t: T) =>
  results.map(r => r.title ?? r.label ?? (t as (k: string) => string)('plans.untitledTask')).join(', ');

/** One line naming what a plan receipt actually saved. */
export function planReceiptSummary(t: T, receipt: PlanReceipt): string {
  const tr = t as (key: string, options?: Record<string, unknown>) => string;
  const by = (outcome: PlanResult['outcome']) => receipt.results.filter(r => r.outcome === outcome);
  if (receipt.kind === 'plan_undo') {
    const removed = by('removed').length;
    return removed > 0 ? tr('plans.undoneRemoved', { count: removed }) : tr('plans.undoneNone');
  }
  if (receipt.kind === 'plan_retry') {
    const created = by('created');
    return created.length ? tr('plans.receiptRetried', { titles: recordedTitles(created, t) }) : '';
  }
  const created = by('created').length;
  const reused = by('reused').length;
  return created > 0
    ? tr('plans.receiptSaved', {
        added: tr('plans.addedCount', { count: created }),
        reused: tr('plans.reusedCount', { count: reused }),
      })
    : tr('plans.receiptExistingOnly', { count: reused });
}
