type ArrivalReconciliationListener = (userId: string) => void;

const listeners = new Set<ArrivalReconciliationListener>();

/** Subscribe to reload requests. No write snapshot is sent to a screen. */
export const subscribeArrivalReconciliation = (
  listener: ArrivalReconciliationListener
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Overlapping writes have settled. Reload only this account's stage. */
export const notifyArrivalReconciliation = (userId: string): void => {
  for (const listener of listeners) listener(userId);
};
