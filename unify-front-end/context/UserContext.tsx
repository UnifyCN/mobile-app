import React, { createContext, use, useEffect, useState } from 'react';
import { isAuthApiError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useUserInfo, withComputedStage } from '@/hooks/users/useUserInfo';
import type { UserInfo } from '@/services/users/getUserInfo';
import { useQueryClient } from '@tanstack/react-query';
import { StageNumber } from '@/types/checklist';
import { Persona } from '@/types/onboardingProfile';

interface CurrentUser {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  permissions: string;
  profilePictureUrl?: string;
  isPremium: boolean;
  arrivalDate: string | null;
  city: string | null;
  province: string | null;
  /** Computed from arrivalDate on every read. Null means unknown. */
  stage: StageNumber | null;
  persona: Persona | null;
  personaOther: string | null;
}

interface UserContextType {
  currentUser: CurrentUser | null;
  isLoading: boolean;
  /** Reload the signed-in user's profile. Resolves when the reload finishes. */
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { data: userInfo, isLoading } = useUserInfo(userId || undefined);

  // Try to get cached userInfo immediately when userId changes
  const cachedUserInfo = userId
    ? queryClient.getQueryData<UserInfo>(['userInfo', userId])
    : undefined;

  // Get user ID and email from auth
  useEffect(() => {
    let active = true;
    let authVersion = 0;
    const getAuthUser = async () => {
      const version = authVersion;
      try {
        const { data } = await supabase.auth.getUser();
        if (!active || version !== authVersion) return;
        if (data?.user) {
          setUserId(data.user.id);
          setUserEmail(data.user.email || null);
        } else {
          setUserId(null);
          setUserEmail(null);
        }
      } catch (err) {
        if (!active || version !== authVersion) return;
        // Stale session in SecureStore (e.g. refresh token rotated, expired,
        // or invalidated server-side). Clear it locally so subsequent calls
        // return a clean null user and stop throwing on every app launch.
        if (isAuthApiError(err) && err.code === 'refresh_token_not_found') {
          await supabase.auth.signOut({ scope: 'local' });
          setUserId(null);
          setUserEmail(null);
          return;
        }
        throw err;
      }
    };

    getAuthUser().catch(err => {
      console.error('[UserContext] Failed to load auth user:', err);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authVersion++;
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      } else {
        setUserId(null);
        setUserEmail(null);
      }
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // Refetch the signed-in user's profile (for example after the arrival date
  // changes). The context updates when the query data changes.
  const refreshUser = async (): Promise<void> => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: ['userInfo', userId] });
  };

  // Use cached data if available, otherwise use fetched data. Cached data
  // does not pass through the query's select, so recompute the stage here.
  const rawUserInfo = cachedUserInfo ?? userInfo;
  const effectiveUserInfo = rawUserInfo ? withComputedStage(rawUserInfo) : undefined;

  const currentUser: CurrentUser | null =
    userId && userEmail && effectiveUserInfo
      ? {
          id: userId,
          email: userEmail,
          username: effectiveUserInfo.username,
          firstName: effectiveUserInfo.firstName ?? null,
          permissions: effectiveUserInfo.permissions,
          profilePictureUrl: effectiveUserInfo.profilePictureUrl,
          isPremium: effectiveUserInfo.isPremium,
          arrivalDate: effectiveUserInfo.arrivalDate,
          city: effectiveUserInfo.city,
          province: effectiveUserInfo.province,
          stage: effectiveUserInfo.stage,
          persona: effectiveUserInfo.persona,
          personaOther: effectiveUserInfo.personaOther,
        }
      : null;

  return (
    <UserContext
      value={{
        currentUser,
        isLoading: isLoading || !userId,
        refreshUser,
      }}
    >
      {children}
    </UserContext>
  );
}

export function useCurrentUser() {
  const context = use(UserContext);
  if (context === undefined) {
    throw new Error('useCurrentUser must be used within a UserProvider');
  }
  return context;
}
