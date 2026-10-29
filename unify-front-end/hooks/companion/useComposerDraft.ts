import { useCallback, useSyncExternalStore } from 'react';
import { useAccountSnapshot } from '@/hooks/auth/useSessionAccountId';
import type { CompanionInputOrigin } from '@/helpers/companion/companionAnalytics';
import {
  accountSnapshot,
  subscribeAccount,
  type AccountSnapshot,
} from '@/services/account/accountSession';

interface Draft {
  text: string;
  origin: CompanionInputOrigin | null;
}

const empty: Draft = { text: '', origin: null };
let owner: AccountSnapshot = accountSnapshot();
let draft = empty;
const listeners = new Set<() => void>();
let stopAccount: (() => void) | undefined;

const sameOwner = (a: AccountSnapshot, b: AccountSnapshot) =>
  a.accountId === b.accountId && a.epoch === b.epoch;

function syncOwner() {
  const current = accountSnapshot();
  // A restarted session must establish ownership before it can show a saved
  // draft. Keep the record until that read resolves, so the same account can
  // return without losing its text.
  if (current.accountId === undefined || sameOwner(owner, current)) return;
  const newTextBeforeSessionRead =
    owner.accountId === undefined && owner.epoch === current.epoch;
  if (!newTextBeforeSessionRead) draft = empty;
  owner = current;
}

function readDraft(): Draft {
  return sameOwner(owner, accountSnapshot()) ? draft : empty;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribeDraft(listener: () => void) {
  listeners.add(listener);
  if (!stopAccount) {
    stopAccount = subscribeAccount(() => {
      syncOwner();
      notify();
    });
    syncOwner();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopAccount?.();
      stopAccount = undefined;
    }
  };
}

/** One in-memory draft for the active account session, across navigation. */
export function useComposerDraft() {
  const current = useAccountSnapshot();
  const value = useSyncExternalStore(subscribeDraft, readDraft, readDraft);
  const setDraft = useCallback(
    (
      text: string,
      origin?: CompanionInputOrigin | null,
      ifUnchanged?: Draft
    ) => {
      // An old screen or pending callback cannot replace another session's text.
      if (!sameOwner(current, accountSnapshot())) return;
      // A failed send can restore the question only if no edit followed send.
      if (ifUnchanged && draft !== ifUnchanged) return;
      syncOwner();
      const previous = readDraft();
      owner = current;
      draft = { text, origin: origin === undefined ? previous.origin : origin };
      notify();
      return draft;
    },
    [current]
  );
  return { ...value, setDraft };
}
