import { supabase } from '@/lib/supabase';
import { Persona } from '@/types/onboardingProfile';
import { normalizeStoredArrivalDate } from '@/supabase/functions/_shared/arrivalStage';

export interface PublicOnboardingProfile {
  persona: Persona | null;
  persona_other: string | null;
  arrival_date: string | null;
}

export const getPublicOnboardingProfile = async (
  userId: string
): Promise<PublicOnboardingProfile | null> => {
  try {
    const { data, error } = await supabase.functions.invoke(
      'public-onboarding-profile',
      {
        body: { userId },
      }
    );

    if (error) {
      throw error;
    }

    const profile = data?.profile;
    if (!profile) return null;
    // The function returns the raw database column (a timestamp).
    return {
      ...profile,
      arrival_date: normalizeStoredArrivalDate(profile.arrival_date),
    };
  } catch (error) {
    console.error('Error fetching public onboarding profile:', error);
    return null;
  }
};
