import { supabase } from '@/lib/supabase';
import { Permissions } from '@/types/permissions';
import { StageNumber } from '@/types/checklist';
import { Persona } from '@/types/onboardingProfile';
import { getPublicOnboardingProfile } from '@/services/onboarding/getPublicOnboardingProfile';
import { normalizeProvince } from '@/constants/LocationData';
import { getArrivalStage } from '@/helpers/arrivalDate';
import { syncStageCache } from '@/services/onboarding/syncStageCache';

export interface UserInfo {
  id: string;
  username: string;
  firstName: string | null;
  createdAt: string;
  followingCount: number;
  followerCount: number;
  profilePictureUrl?: string;
  isPremium: boolean;
  permissions: string;
  arrivalDate: string | null;
  city: string | null;
  province: string | null;
  /** Computed from arrivalDate on every read. Null means unknown. */
  stage: StageNumber | null;
  persona: Persona | null;
  personaOther: string | null;
}

export const getUserInfo = async (userId?: string): Promise<UserInfo> => {
  try {
    // Always resolve the requester so we can gate private fields (first_name)
    // to self-views only. Defense-in-depth on top of RLS.
    const {
      data: { user: requester },
    } = await supabase.auth.getUser();

    let targetUserId = userId;
    if (!targetUserId) {
      if (!requester) {
        throw new Error('User not authenticated');
      }
      targetUserId = requester.id;
    }
    const isSelfView = !!requester && requester.id === targetUserId;

    // Two branches so first_name never leaves the DB on cross-user reads —
    // it stays off the wire, not just off the returned object. Supabase's
    // type-level SELECT parser requires static literal strings, so we can't
    // build the column list dynamically and have to fork the call.
    const userPromise = isSelfView
      ? supabase
          .from('users')
          .select(
            'id, username, first_name, created_at, profile_picture_url, is_premium, permissions'
          )
          .eq('id', targetUserId)
          .single()
      : supabase
          .from('users')
          .select(
            'id, username, created_at, profile_picture_url, is_premium, permissions'
          )
          .eq('id', targetUserId)
          .single();

    const [
      userResult,
      onboardingResult,
      followingCountResult,
      followerCountResult,
    ] = await Promise.all([
      userPromise,
      supabase
        .from('user_onboarding_profiles')
        .select('arrival_date, stage, persona, persona_other, city, province')
        .eq('id', targetUserId)
        .maybeSingle(),
      supabase
        .from('user_followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', targetUserId),
      supabase
        .from('user_followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId),
    ]);

    const userData = userResult.data;
    const userError = userResult.error;
    const onboardingData = onboardingResult.data;
    const onboardingError = onboardingResult.error;
    const followingCount = followingCountResult.count;
    const followingError = followingCountResult.error;
    const followerCount = followerCountResult.count;
    const followerError = followerCountResult.error;

    if (userError) {
      throw new Error(`Failed to fetch user info: ${userError.message}`);
    }
    if (!userData) {
      throw new Error('Failed to fetch user info: no user data returned');
    }

    if (onboardingError) {
      throw new Error(
        `Failed to fetch onboarding profile: ${onboardingError.message}`
      );
    }

    const resolvedOnboarding: {
      arrival_date: string | null;
      persona: Persona | null;
      persona_other: string | null;
      city: string | null;
      province: string | null;
      stage: unknown;
    } = {
      arrival_date: onboardingData?.arrival_date ?? null,
      persona: onboardingData?.persona ?? null,
      persona_other: onboardingData?.persona_other ?? null,
      city: onboardingData?.city ?? null,
      province: normalizeProvince(onboardingData?.province),
      stage: onboardingData?.stage ?? null,
    };

    if (!resolvedOnboarding.persona || !resolvedOnboarding.arrival_date) {
      const publicProfile = await getPublicOnboardingProfile(targetUserId);
      if (publicProfile) {
        resolvedOnboarding.persona = publicProfile.persona;
        resolvedOnboarding.persona_other = publicProfile.persona_other;
        resolvedOnboarding.arrival_date = publicProfile.arrival_date;
      }
    }

    const arrivalDate = resolvedOnboarding?.arrival_date ?? null;
    // Never trust the stored stage: it is a cache of this computed value.
    const computedStage = getArrivalStage(arrivalDate);

    if (isSelfView && onboardingData) {
      // Best-effort persistence in a fire-and-forget call: it must not block
      // the profile fetch. Self views only, because a cross-user write is a
      // guaranteed RLS-denied round-trip. Null transitions and users without
      // a persona are written too. syncStageCache never throws.
      void syncStageCache(targetUserId, resolvedOnboarding.stage, computedStage);
    }

    if (followingError) {
      throw new Error(
        `Failed to fetch following count: ${followingError.message}`
      );
    }

    if (followerError) {
      throw new Error(
        `Failed to fetch follower count: ${followerError.message}`
      );
    }

    // first_name is only fetched on the self-view branch above; cross-user
    // reads never put it on the wire. Extract via a typed cast so TS doesn't
    // need to narrow the union shape returned by the two query branches.
    const firstName: string | null = isSelfView
      ? ((userData as unknown as { first_name: string | null }).first_name ??
        null)
      : null;

    return {
      id: userData.id,
      username: userData.username,
      firstName,
      createdAt: userData.created_at,
      followingCount: followingCount || 0,
      followerCount: followerCount || 0,
      profilePictureUrl: userData.profile_picture_url,
      isPremium: userData.is_premium ?? false,
      permissions: userData.permissions ?? Permissions.USER,
      arrivalDate,
      city: resolvedOnboarding?.city ?? null,
      province: normalizeProvince(resolvedOnboarding?.province),
      stage: computedStage,
      persona: resolvedOnboarding?.persona ?? null,
      personaOther: resolvedOnboarding?.persona_other ?? null,
    };
  } catch (error) {
    console.error('Error fetching user info:', error);
    throw error;
  }
};
