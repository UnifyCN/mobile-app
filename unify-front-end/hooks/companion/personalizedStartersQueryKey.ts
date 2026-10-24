/** Root of every personalized-starters query, whatever the local day. */
export const PERSONALIZED_STARTERS_QUERY_KEY = [
  'personalizedStarters',
  'v2',
] as const;

/** Every personalized-starters query of one account, whatever the local day. */
export const personalizedStartersAccountKey = (userId: string) =>
  [...PERSONALIZED_STARTERS_QUERY_KEY, userId] as const;
