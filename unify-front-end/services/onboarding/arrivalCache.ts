import type { QueryClient } from '@tanstack/react-query';
import { personalizedStartersAccountKey } from '@/hooks/companion/personalizedStartersQueryKey';
import type { ConfirmedArrival } from '@/services/onboarding/updateArrivalDate';
import type { UserInfo } from '@/services/users/getUserInfo';
import type { UserOnboardingProfile } from '@/types/onboardingProfile';

/** One account's arrival-date writes that have not finished yet. */
interface AccountWrites {
  /** Number of the most recently started write. */
  latest: number;
  inFlight: number;
  /** True once two writes were in flight together. */
  overlapped: boolean;
}

/** One arrival-date write, from the moment it is sent. */
export interface ArrivalWrite {
  /**
   * Publish what the database confirmed. Never throws for an older write:
   * its snapshot is dropped instead.
   */
  confirm: (confirmed: ConfirmedArrival) => Promise<void>;
  /** The write failed. */
  fail: () => void;
}

// Per query client, so writes are ordered across every screen that shares
// the caches, and separate clients (tests) never share a ledger.
const writesByClient = new WeakMap<QueryClient, Map<string, AccountWrites>>();

const accountKeys = (userId: string) =>
  [
    ['onboardingProfile', userId],
    ['userInfo', userId],
  ] as const;

/**
 * Reads of the account caches that are still running started before the
 * write, so a late old row must not replace the confirmed one.
 */
const cancelAccountReads = (queryClient: QueryClient, userId: string) =>
  Promise.all(
    accountKeys(userId).map(queryKey =>
      queryClient.cancelQueries({ queryKey, exact: true })
    )
  );

/** Drop the account caches' current values and read the row again. */
const revalidateAccount = async (queryClient: QueryClient, userId: string) => {
  await cancelAccountReads(queryClient, userId);
  await Promise.all(
    accountKeys(userId).map(queryKey =>
      queryClient.invalidateQueries({ queryKey, exact: true })
    )
  );
};

/**
 * Put a confirmed write into every cache that holds the date. Cached entries
 * that do not exist are left alone.
 */
const setConfirmedArrival = (
  queryClient: QueryClient,
  confirmed: ConfirmedArrival
) => {
  queryClient.setQueryData<UserOnboardingProfile | null>(
    ['onboardingProfile', confirmed.id],
    previous =>
      previous
        ? {
            ...previous,
            arrival_date: confirmed.arrival_date,
            stage: confirmed.stage,
          }
        : previous
  );
  queryClient.setQueryData<UserInfo>(['userInfo', confirmed.id], previous =>
    previous
      ? {
          ...previous,
          arrivalDate: confirmed.arrival_date,
          stage: confirmed.stage,
        }
      : previous
  );
};

/**
 * Start an arrival-date write for one account. Caches are per account, so
 * the result is published even when the screen that saved has gone, but
 * only in write order:
 * - A write that a newer one has replaced never publishes its snapshot.
 * - Writes that were in flight together can commit in either order, so once
 *   the last of them finishes the account caches read the row again.
 * The account's Companion starters depend on the stage, so they are
 * invalidated for every local day.
 */
export const beginArrivalWrite = (
  queryClient: QueryClient,
  userId: string
): ArrivalWrite => {
  let byUser = writesByClient.get(queryClient);
  if (!byUser) {
    byUser = new Map();
    writesByClient.set(queryClient, byUser);
  }
  let writes = byUser.get(userId);
  if (!writes) {
    writes = { latest: 0, inFlight: 0, overlapped: false };
    byUser.set(userId, writes);
  }
  const account = writes;
  const accounts = byUser;
  if (account.inFlight > 0) account.overlapped = true;
  account.inFlight++;
  const number = ++account.latest;
  const isLatest = () => account.latest === number;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    account.inFlight--;
    if (account.inFlight > 0) return;
    accounts.delete(userId);
    if (!account.overlapped) return;
    revalidateAccount(queryClient, userId).catch(error =>
      console.warn('[arrival date] cache revalidation failed:', error)
    );
  };

  return {
    confirm: async confirmed => {
      try {
        if (isLatest()) {
          await cancelAccountReads(queryClient, userId);
          // A newer write can start while the reads are cancelled.
          if (isLatest()) setConfirmedArrival(queryClient, confirmed);
        }
        void queryClient.invalidateQueries({
          queryKey: personalizedStartersAccountKey(userId),
        });
      } finally {
        finish();
      }
    },
    fail: finish,
  };
};
