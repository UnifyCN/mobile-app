import { supabase } from '@/lib/supabase';
import {
  OnboardingProfileInput,
  UserOnboardingProfile,
} from '@/types/onboardingProfile';
import { getArrivalStage } from '@/helpers/arrivalDate';
import {
  normalizeStoredArrivalDate,
  resolveStoredStage,
} from '@/supabase/functions/_shared/arrivalStage';
import { normalizeProvince } from '@/constants/LocationData';
import { redeemReferral, type RedeemResult } from '@/services/referrals/redeemReferral';

export interface SaveOnboardingResult {
  profile: UserOnboardingProfile;
  /**
   * Result of the redeem-referral call, only present when the caller passed an
   * invite code. NEVER throws or blocks the save — a failed redeem still returns
   * a valid `profile` so onboarding can complete.
   */
  redeem?: RedeemResult;
}

export interface SaveOnboardingExtras {
  inviteCode?: { code: string; source: 'clipboard' | 'manual' } | null;
}

export const saveOnboardingProfile = async (
  userId: string,
  data: OnboardingProfileInput,
  extras: SaveOnboardingExtras = {}
): Promise<SaveOnboardingResult> => {
  try {
    // Prepare the data for Supabase (convert to snake_case)
    const supabaseData: any = {
      id: userId,
      persona: data.persona ?? null,
      persona_other: data.persona_other ?? null,
      referral_source: data.referral_source ?? null,
      referral_source_other: data.referral_source_other ?? null,
      arrival_date: data.arrival_date ?? null,
      city: data.city ?? null,
      province: normalizeProvince(data.province),
      goals: data.goals || [],
      goals_other: data.goals_other ?? null,
      learning_interests: data.learning_interests || [],
      learning_interests_other: data.learning_interests_other ?? null,
      hobbies: data.hobbies || [],
      wants_reminders: data.wants_reminders ?? false,
      onboarding_completed: data.onboarding_completed ?? false,
    };

    // Only include preferred_language if the caller passed it. Omitting it
    // keeps Postgres' column default ('en') on first INSERT, and avoids
    // clobbering an existing value on subsequent updates from callers that
    // don't manage language (e.g. notification toggle).
    if (data.preferred_language !== undefined) {
      supabaseData.preferred_language = data.preferred_language;
    }

    // The stage is a cache of the arrival date written above, so write both
    // together. The caller may send a timestamp (the quiz sends the first of
    // the month at UTC midnight), so the stage comes from the normalized
    // calendar date. A missing or invalid date writes null (unknown).
    supabaseData.stage = getArrivalStage(
      normalizeStoredArrivalDate(data.arrival_date)
    );

    // Upsert the profile
    const { data: result, error } = await supabase
      .from('user_onboarding_profiles')
      .upsert(supabaseData, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save onboarding profile: ${error.message}`);
    }

    const profile: UserOnboardingProfile = {
      id: result.id,
      persona: result.persona,
      persona_other: result.persona_other,
      referral_source: result.referral_source,
      referral_source_other: result.referral_source_other,
      arrival_date: normalizeStoredArrivalDate(result.arrival_date),
      city: result.city,
      province: normalizeProvince(result.province),
      stage: resolveStoredStage(result.stage),
      goals: result.goals || [],
      goals_other: result.goals_other,
      learning_interests: result.learning_interests || [],
      learning_interests_other: result.learning_interests_other,
      hobbies: result.hobbies || [],
      preferred_language: result.preferred_language || 'en',
      wants_reminders: result.wants_reminders ?? false,
      onboarding_completed: result.onboarding_completed ?? false,
      onboarding_completed_at: result.onboarding_completed_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };

    // Fire the redeem-referral edge function if the caller provided an invite code AND
    // onboarding is being completed (we don't want stray redeems on partial saves).
    // Failure NEVER blocks onboarding completion — we surface the result so the
    // caller can decide to navigate, but the profile save is the source of truth.
    let redeem: RedeemResult | undefined;
    if (extras.inviteCode?.code && data.onboarding_completed) {
      try {
        redeem = await redeemReferral(
          extras.inviteCode.code,
          extras.inviteCode.source
        );
      } catch (err) {
        console.error('saveOnboardingProfile: redeem failed (non-fatal)', err);
        redeem = { success: false, reason: 'server_error' };
      }
    }

    return { profile, redeem };
  } catch (error) {
    console.error('Error saving onboarding profile:', error);
    throw error;
  }
};
