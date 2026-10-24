// hooks/companion/usePersonalizedStarters.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PersonalizedStarter } from '@/supabase/functions/_shared/companionTemplates';
import { formatLocalDate } from '@/helpers/arrivalDate';
import { localDateHeaders } from '@/helpers/localDateHeader';
import { PERSONALIZED_STARTERS_QUERY_KEY } from '@/hooks/companion/personalizedStartersQueryKey';

export type { PersonalizedStarter };

export interface CompanionPersonalization {
  starters: PersonalizedStarter[];
}

const fetchPersonalizedStarters =
  async (localDay: Date): Promise<CompanionPersonalization | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/personalize?surfaces=companion`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...localDateHeaders(localDay),
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const starters = data?.companion?.starters;
    if (!Array.isArray(starters) || starters.length === 0) return null;

    // Validate shape — if the deployed edge function still returns the
    // legacy string[] payload, every entry will fail this check and we'll
    // fall back to no personalized chips rather than rendering broken cards.
    const valid = starters.filter(
      (s): s is PersonalizedStarter =>
        s != null &&
        typeof s === 'object' &&
        typeof (s as PersonalizedStarter).id === 'string' &&
        typeof (s as PersonalizedStarter).category === 'string' &&
        typeof (s as PersonalizedStarter).prompt === 'string' &&
        typeof (s as PersonalizedStarter).iconBackground === 'string' &&
        typeof (s as PersonalizedStarter).iconName === 'string' &&
        typeof (s as PersonalizedStarter).priority === 'number'
    );
    if (valid.length === 0) {
      console.warn(
        '[usePersonalizedStarters] edge function returned legacy/invalid shape; ' +
          'deploy the latest personalize function to enable personalized chips.'
      );
      return null;
    }

    return { starters: valid };
  };

export { PERSONALIZED_STARTERS_QUERY_KEY };

/**
 * The stage starters depend on the device's calendar day, so the day is part
 * of the query key: a list cached yesterday is never reused after midnight.
 */
export const usePersonalizedStarters = () => {
  const now = new Date();
  const localDay = formatLocalDate(now);
  return useQuery<CompanionPersonalization | null, Error>({
    queryKey: [...PERSONALIZED_STARTERS_QUERY_KEY, localDay],
    queryFn: () => fetchPersonalizedStarters(now),
    staleTime: 5 * 60 * 1000,
  });
};
