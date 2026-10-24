import { supabase } from '@/lib/supabase';
import { UserOnboardingProfile } from '@/types/onboardingProfile';
import { normalizeProvince } from '@/constants/LocationData';
import {
  normalizeStoredArrivalDate,
  resolveStoredStage,
} from '@/supabase/functions/_shared/arrivalStage';

export const getOnboardingProfile = async (
  userId?: string
): Promise<UserOnboardingProfile | null> => {
  try {
    let targetUserId = userId;

    // If no userId provided, get current user's ID
    if (!targetUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      targetUserId = user.id;
    }

    // Get onboarding profile
    const { data, error } = await supabase
      .from('user_onboarding_profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (error) {
      // If no profile exists, return null (not an error)
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch onboarding profile: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      persona: data.persona,
      persona_other: data.persona_other,
      referral_source: data.referral_source,
      referral_source_other: data.referral_source_other,
      arrival_date: normalizeStoredArrivalDate(data.arrival_date),
      city: data.city,
      province: normalizeProvince(data.province),
      stage: resolveStoredStage(data.stage),
      goals: data.goals || [],
      goals_other: data.goals_other,
      learning_interests: data.learning_interests || [],
      learning_interests_other: data.learning_interests_other,
      hobbies: data.hobbies || [],
      preferred_language: data.preferred_language || 'en',
      wants_reminders: data.wants_reminders ?? false,
      onboarding_completed: data.onboarding_completed ?? false,
      onboarding_completed_at: data.onboarding_completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    console.error('Error fetching onboarding profile:', error);
    throw error;
  }
};
