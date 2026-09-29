import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// A stalled network must not hold the in-flight guard forever, or every later
// foreground would skip the check.
const STEP_TIMEOUT_MS = 30_000;

const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('OTA update step timed out')),
      STEP_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Applies a published OTA update as soon as the app launches or returns to the
 * foreground. By default expo-updates only downloads on cold start and applies
 * on the NEXT cold start, and iOS can keep the app suspended for days, so
 * users kept running stale bundles long after a fix shipped.
 */
export function useOtaUpdates() {
  const inFlight = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let cancelled = false;

    const applyUpdate = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const check = await withTimeout(Updates.checkForUpdateAsync());
        if (!check.isAvailable || cancelled) return;
        const result = await withTimeout(Updates.fetchUpdateAsync());
        if (!cancelled && (result.isNew || result.isRollBackToEmbedded)) {
          await Updates.reloadAsync();
        }
      } catch {
        // Offline or the update server is unreachable; retry next foreground.
      } finally {
        inFlight.current = false;
      }
    };

    applyUpdate();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') applyUpdate();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}
