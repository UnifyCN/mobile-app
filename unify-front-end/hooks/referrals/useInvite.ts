import { useCallback, useState } from 'react';
import { Share, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/context/UserContext';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import {
  buildShareUrl,
  clipboardPayload,
  formatInviteMessage,
} from '@/utils/inviteLink';

interface UseInviteResult {
  code: string | null;
  loading: boolean;
  error: Error | null;
  invite: () => Promise<void>;
  inviting: boolean;
}

/**
 * useInvite — provides the current user's invite code (lazy-generates on first
 * use via the generate_invite_code RPC), and exposes an `invite()` callback that
 * writes the code to the clipboard and opens the iOS share sheet with a
 * personalized message.
 *
 *   First call:           SELECT users.invite_code → null → call RPC → cache
 *   Subsequent:           cached via React Query (Infinity stale)
 *
 *   invite():             clipboard.set(unify-invite:CODE) → Share.share(message + url)
 *                         → fire 'invite_share_sheet_opened' on 'shared' result only.
 */
export function useInvite(): UseInviteResult {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const { data: profile } = useOnboardingProfile(currentUser?.id);
  const { capture, trackInviteShareCompleted } = useAnalytics();
  const [inviting, setInviting] = useState(false);

  const userId = currentUser?.id ?? null;

  const codeQuery = useQuery<string, Error>({
    queryKey: ['invite-code', userId],
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      if (!userId) throw new Error('not authenticated');
      const { data, error } = await supabase.rpc('generate_invite_code', {
        target_user_id: userId,
      });
      if (error) throw error;
      if (typeof data !== 'string' || data.length === 0) {
        throw new Error('Empty invite code from RPC');
      }
      capture(AnalyticsEvents.INVITE_CODE_GENERATED, { user_id: userId });
      return data;
    },
  });

  const invite = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      console.warn('useInvite: invite() is iOS-only');
      return;
    }
    const code = codeQuery.data;
    if (!code || !currentUser?.username) return;

    setInviting(true);
    try {
      try {
        await Clipboard.setStringAsync(clipboardPayload(code));
      } catch (e) {
        console.warn('useInvite: clipboard set failed (non-fatal)', e);
      }

      const message = formatInviteMessage(t, {
        username: currentUser.username,
        city: profile?.city ?? null,
        code,
      });

      const result = await Share.share({
        message,
        url: buildShareUrl(),
      });

      if (result.action === Share.sharedAction) {
        // Do NOT include the raw code — it's the inviter's identity credential.
        // PostHog already has the user's distinct_id; the inviter↔invitee
        // join lives in the referrals table server-side.
        capture(AnalyticsEvents.INVITE_SHARE_SHEET_OPENED, { shared: true });
        trackInviteShareCompleted({
          result: 'sent',
          activity_type:
            'activityType' in result ? (result.activityType ?? null) : null,
        });
      } else if (result.action === Share.dismissedAction) {
        trackInviteShareCompleted({ result: 'dismissed' });
      }
    } catch (err) {
      console.error('useInvite: Share failed', err);
    } finally {
      setInviting(false);
    }
  }, [
    codeQuery.data,
    currentUser?.username,
    profile?.city,
    capture,
    trackInviteShareCompleted,
    t,
  ]);

  return {
    code: codeQuery.data ?? null,
    loading: codeQuery.isLoading,
    error: codeQuery.error,
    invite,
    inviting,
  };
}
