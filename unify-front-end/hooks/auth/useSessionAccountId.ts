import { useSyncExternalStore } from 'react';
import {
  accountSnapshot,
  subscribeAccount,
  type AccountSnapshot,
} from '@/services/account/accountSession';

/**
 * The signed-in account and its epoch, from the shared account session
 * (`services/account/accountSession.ts`). Every screen reads the same value, so
 * they change account together (mobile-app#361).
 */
export function useAccountSnapshot(): AccountSnapshot {
  return useSyncExternalStore(subscribeAccount, accountSnapshot, accountSnapshot);
}

/** The signed-in account id. Undefined until the session is read. */
export function useSessionAccountId(): string | null | undefined {
  return useAccountSnapshot().accountId;
}
