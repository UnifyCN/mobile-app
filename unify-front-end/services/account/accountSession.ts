import { supabase } from '@/lib/supabase';

/**
 * The one owner of "which account is signed in" for private client work
 * (mobile-app#361). Every consumer reads the same snapshot, so they change
 * account together, and work that started for one account can check that it
 * still belongs to the signed-in one before it writes a result.
 *
 * `epoch` changes only when the known account changes (another account, sign-out
 * or sign-in). A token refresh of the same account keeps it.
 */
export interface AccountSnapshot {
  /** Undefined until the session is known. */
  accountId: string | null | undefined;
  epoch: number;
}

type Listener = () => void;

let snapshot: AccountSnapshot = { accountId: undefined, epoch: 0 };
// The last known account survives a restart, so reading the same account again
// is not an account change.
let lastKnown: string | null | undefined;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;

function publish(accountId: string | null) {
  if (accountId === snapshot.accountId) return;
  const changed = lastKnown !== undefined && lastKnown !== accountId;
  lastKnown = accountId;
  snapshot = { accountId, epoch: changed ? snapshot.epoch + 1 : snapshot.epoch };
  for (const l of listeners) l();
}

function start() {
  let active = true;
  // An auth event is newer than the stored session read that started before it:
  // a late session reply must not switch back to an earlier account.
  let eventSeen = false;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    eventSeen = true;
    if (active) publish(session?.user.id ?? null);
  });
  supabase.auth
    .getSession()
    .then(({ data }) => {
      if (active && !eventSeen) publish(data.session?.user.id ?? null);
    })
    .catch(error => {
      console.warn('[accountSession] Failed to read the session:', error);
      if (active && !eventSeen) publish(null);
    });
  stop = () => {
    active = false;
    subscription.unsubscribe();
  };
}

export function subscribeAccount(listener: Listener) {
  listeners.add(listener);
  if (!stop) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      // Nobody is listening, so a later change could be missed: forget the
      // account and read it again on the next subscription.
      stop();
      stop = null;
      snapshot = { accountId: undefined, epoch: snapshot.epoch };
    }
  };
}

export const accountSnapshot = (): AccountSnapshot => snapshot;

/** Marks work as started for the current account. */
export const ownAccountWork = (): AccountSnapshot => snapshot;

/** True while the account that started `owner`'s work is still signed in. */
export const stillOwned = (owner: AccountSnapshot): boolean =>
  owner.epoch === snapshot.epoch;

/** Thrown to stop work whose account is no longer signed in. Never shown. */
export class AccountChangedError extends Error {
  constructor() {
    super('The signed-in account changed');
    this.name = 'AccountChangedError';
  }
}
