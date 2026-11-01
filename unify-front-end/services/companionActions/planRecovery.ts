import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountSnapshot } from '@/services/account/accountSession';
import type { PlanWrite } from './planStore';

const storage = AsyncStorage;
const currentAccount = () => accountSnapshot().accountId;
const STORAGE_KEY = 'companion-plan-recovery-v1';

// Only references are retained. Task text, reviewed operations and approval
// payloads must be read again from the server after a confirmed not-applied.
interface Reference {
  operationId: string;
  kind: PlanWrite['kind'];
  proposalId?: string;
  proposalRevision?: number;
  receiptOperationId?: string;
  removalConfirmed?: boolean;
}
interface RecordSet {
  accountId: string;
  entries: Record<string, Reference>;
}
export interface PlanRecovery {
  load(): Promise<[string, PlanWrite][]>;
  save(key: string, write: PlanWrite): Promise<void>;
  remove(key: string): Promise<void>;
}

// Keep a late save and an account reset in their original order.
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work);
  tail = next.catch(() => {});
  return next;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
async function read(): Promise<RecordSet | null> {
  const text = await storage.getItem(STORAGE_KEY);
  if (!text) return null;
  const data = JSON.parse(text) as RecordSet;
  if (
    !uuid(data.accountId) ||
    !data.entries ||
    typeof data.entries !== 'object' ||
    Array.isArray(data.entries)
  )
    throw new Error('Invalid plan recovery record');
  for (const [key, value] of Object.entries(data.entries)) {
    if (!value || !uuid(value.operationId))
      throw new Error('Invalid plan recovery identity');
    if (value.kind === 'apply') {
      if (
        !uuid(value.proposalId) ||
        !Number.isSafeInteger(value.proposalRevision) ||
        value.proposalRevision! < 1 ||
        key !== `plan-proposal:${value.proposalId}`
      )
        throw new Error('Invalid plan recovery proposal');
    } else if (
      (value.kind !== 'retry' && value.kind !== 'undo') ||
      !uuid(value.receiptOperationId) ||
      key !== `plan-receipt:${value.receiptOperationId}`
    ) {
      throw new Error('Invalid plan recovery receipt');
    }
  }
  return data;
}

export function clearPlanRecoveryExcept(
  accountId: string | null,
  isCurrent = () => currentAccount() === accountId
) {
  return serial(async () => {
    if (!isCurrent()) return;
    // Sign-out also removes a damaged record. It must not require a valid parse.
    if (accountId === null) {
      await storage.removeItem(STORAGE_KEY);
      return;
    }
    let data: RecordSet | null;
    try {
      data = await read();
    } catch {
      // An unreadable record can describe an unresolved write. Keep it for another read.
      return;
    }
    if (isCurrent() && data?.accountId !== accountId)
      await storage.removeItem(STORAGE_KEY);
  });
}

export function planRecoveryFor(
  accountId: string,
  isOwned: () => boolean
): PlanRecovery {
  return {
    load: () =>
      serial(async () => {
        if (!isOwned()) return [];
        const data = await read();
        if (!isOwned() || data?.accountId !== accountId) return [];
        return Object.entries(data.entries).map(([key, ref]) => [
          key,
          {
            operationId: ref.operationId,
            kind: ref.kind,
            ...(ref.proposalId
              ? {
                  proposal: {
                    id: ref.proposalId,
                    revision: ref.proposalRevision!,
                    rawItems: [],
                  },
                }
              : {}),
            receiptOperationId: ref.receiptOperationId,
            removalConfirmed: ref.removalConfirmed === true,
            restored: true,
          },
        ]);
      }),
    save: (key, write) =>
      serial(async () => {
        if (!isOwned()) throw new Error('Plan recovery owner changed');
        const data = await read();
        const entries = data?.accountId === accountId ? data.entries : {};
        entries[key] = {
          operationId: write.operationId,
          kind: write.kind,
          ...(write.proposal
            ? {
                proposalId: write.proposal.id,
                proposalRevision: write.proposal.revision,
              }
            : {}),
          ...(write.receiptOperationId
            ? { receiptOperationId: write.receiptOperationId }
            : {}),
          ...(write.removalConfirmed ? { removalConfirmed: true } : {}),
        };
        if (!isOwned()) throw new Error('Plan recovery owner changed');
        await storage.setItem(
          STORAGE_KEY,
          JSON.stringify({ accountId, entries })
        );
      }),
    remove: key =>
      serial(async () => {
        if (!isOwned()) return;
        const data = await read();
        if (!isOwned() || data?.accountId !== accountId) return;
        delete data.entries[key];
        if (Object.keys(data.entries).length)
          await storage.setItem(STORAGE_KEY, JSON.stringify(data));
        else await storage.removeItem(STORAGE_KEY);
      }),
  };
}
