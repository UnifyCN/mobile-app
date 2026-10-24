import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ShownOnceArgs {
  userId: string;
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** False once the account that owns this card is gone. */
  isCurrent: () => boolean;
  emit: () => void;
}

const KEY_PREFIX = 'arrival_countdown_shown';

// Claimed this session. Closes the gap while a storage write is in flight and
// keeps working when storage fails.
const claimedThisSession = new Set<string>();
// Calls for one key run one after another, so concurrent mounts or focus
// events read the marker only after the earlier call has settled.
const queues = new Map<string, Promise<void>>();

const markerKey = (userId: string, day: string) =>
  `${KEY_PREFIX}:${userId}:${day}`;

const run = async ({ userId, day, isCurrent, emit }: ShownOnceArgs) => {
  const key = markerKey(userId, day);
  if (claimedThisSession.has(key)) return;

  let alreadyShown = false;
  try {
    alreadyShown = (await AsyncStorage.getItem(key)) !== null;
  } catch (error) {
    console.warn('[arrivalCountdownShown] marker read failed:', error);
  }
  if (alreadyShown) {
    claimedThisSession.add(key);
    return;
  }

  // Account switched while we read storage: leave the day unclaimed so the
  // right account can still send its event.
  if (!isCurrent()) return;

  // Claim and emit with no await between them.
  claimedThisSession.add(key);
  try {
    emit();
  } catch (error) {
    console.warn('[arrivalCountdownShown] emit failed:', error);
  }
  try {
    await AsyncStorage.setItem(key, '1');
  } catch (error) {
    console.warn('[arrivalCountdownShown] marker write failed:', error);
  }
};

/** Emit at most once per user per local day, across mounts and restarts. */
export const trackArrivalCountdownShownOnce = (
  args: ShownOnceArgs
): Promise<void> => {
  const key = markerKey(args.userId, args.day);
  const next = (queues.get(key) ?? Promise.resolve()).then(() => run(args));
  queues.set(key, next);
  return next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
};
