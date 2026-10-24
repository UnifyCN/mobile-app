import { typography } from '@/constants/Typography';
import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFollowUser } from '@/hooks/users/useFollowUser';
import { useFollowStatus } from '@/hooks/users/useFollowStatus';
import { Theme } from '@/constants/Theme';
import { useAnalytics, type FollowSource } from '@/utils/analytics';

interface FollowButtonProps {
  targetUserId: string;
  compact?: boolean;
  source?: FollowSource;
}

export const FollowButton = ({
  targetUserId,
  compact = false,
  source = 'profile',
}: FollowButtonProps) => {
  const { t } = useTranslation();
  const { data: isFollowing } = useFollowStatus(targetUserId);
  const followUserMutation = useFollowUser();
  const { trackUserFollowed, trackUserUnfollowed } = useAnalytics();

  // Local state to track follow status for immediate UI updates
  const [localIsFollowing, setLocalIsFollowing] = useState<boolean | null>(
    null
  );

  // Update local state when server data changes
  useEffect(() => {
    if (isFollowing !== undefined) {
      setLocalIsFollowing(isFollowing);
    }
  }, [isFollowing]);

  const handleFollowToggle = () => {
    const willFollow = !localIsFollowing;
    // Immediately update local state for instant UI feedback
    setLocalIsFollowing(willFollow);

    followUserMutation.mutate(
      {
        targetUserId,
        isFollowing: willFollow,
      },
      {
        onSuccess: () => {
          if (willFollow) {
            trackUserFollowed({ target_user_id: targetUserId, source });
          } else {
            trackUserUnfollowed({ target_user_id: targetUserId, source });
          }
        },
      }
    );
  };

  return (
    <TouchableOpacity
      style={[
        compact ? styles.buttonCompact : styles.button,
        localIsFollowing ? styles.followingButton : styles.followButton,
      ]}
      onPress={handleFollowToggle}
      disabled={followUserMutation.isPending}
    >
      <Text style={compact ? styles.buttonTextCompact : styles.buttonText}>
        {localIsFollowing
          ? compact
            ? t('profile.following')
            : t('profile.unfollow')
          : t('profile.follow')}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  buttonCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  followButton: {
    backgroundColor: Theme.primaryGatherRed,
  },
  followingButton: {
    backgroundColor: Theme.primaryGatherRed,
  },
  buttonText: { ...typography.button, color: Theme.white },
  buttonTextCompact: { ...typography.button, color: Theme.white },
});
