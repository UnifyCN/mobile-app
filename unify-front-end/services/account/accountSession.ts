import { supabase } from '@/lib/supabase';

/**
 * The one owner of "which account is signed in" for private client work
 * (mobile-app#361). Every consumer reads the same snapshot, so they change
 * account together, and work that started for one account can check that it
 * still belongs to the signed-in one before it writes a result.
 *
 * `epoch` changes when the known account or Auth session changes. A token
 * refresh of the same session keeps it.
 */
export interface AccountSnapshot {
  /** Undefined until the session is known. */
  accountId: string | null | undefined;
  epoch: number;
}

type Listener = () => void;

let snapshot: AccountSnapshot = { accountId: undefined, epoch: 0 };
// Retain the last identity across subscription restarts. A new Auth session invalidates old work.
let lastKnown: string | null | undefined;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;
let sessionIdentity: string | null = null;
// This value only prevents local cross-session replay. The server validates authority.
function localSessionIdentity(token?: string): string | null {
  try {
    const value = JSON.parse(
      atob((token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    ).session_id;
    return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}
export const accountSessionIdentity = () =>
  snapshot.accountId === undefined ? null : sessionIdentity;

function publish(accountId: string | null, token?: string) {
  const nextSession = localSessionIdentity(token);
  if (accountId === snapshot.accountId && nextSession === sessionIdentity)
    return;
  const changed =
    (lastKnown !== undefined && lastKnown !== accountId) ||
    (sessionIdentity !== null && nextSession !== sessionIdentity);
  sessionIdentity = nextSession;
  lastKnown = accountId;
  snapshot = {
    accountId,
    epoch: changed ? snapshot.epoch + 1 : snapshot.epoch,
  };
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
    if (active) publish(session?.user.id ?? null, session?.access_token);
  });
  supabase.auth
    .getSession()
    .then(({ data }) => {
      if (active && !eventSeen)
        publish(data.session?.user.id ?? null, data.session?.access_token);
    })
    .catch(() => {
      console.warn('[accountSession] Failed to read the session');
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

/**
 * True while the account that started `owner`'s work is the established
 * signed-in account. Unknown ownership is not permission: work started before
 * the session was read, or checked while a restarted session is still being
 * read, is not owned, even when the same account comes back later.
 */
export const stillOwned = (owner: AccountSnapshot): boolean =>
  typeof owner.accountId === 'string' &&
  owner.accountId === snapshot.accountId &&
  owner.epoch === snapshot.epoch;

/** Thrown to stop work whose account is no longer signed in. Never shown. */
export class AccountChangedError extends Error {
  constructor() {
    super('The signed-in account changed');
    this.name = 'AccountChangedError';
  }
}

/**
 * Stops `owner`'s work before its next request or result unless its account is
 * still the established signed-in one, and, when given, the authenticated user
 * the request would be made as (`userId`) is that account.
 */
export function assertOwned(
  owner: AccountSnapshot,
  userId?: string | null
): void {
  if (!stillOwned(owner)) throw new AccountChangedError();
  if (userId !== undefined && userId !== owner.accountId)
    throw new AccountChangedError();
}

export const isAccountChange = (error: unknown): boolean =>
  error instanceof AccountChangedError;
