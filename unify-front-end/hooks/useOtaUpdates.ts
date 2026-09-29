import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

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

    const applyUpdate = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const result = await Updates.fetchUpdateAsync();
        if (result.isNew || result.isRollBackToEmbedded) {
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
    return () => subscription.remove();
  }, []);
}
