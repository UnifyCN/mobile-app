import { typography } from '@/constants/Typography';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { useState, memo, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/utils/analytics';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import FeedWithHook from '@/components/FeedWithHook';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { useUserInfo } from '@/hooks/users/useUserInfo';
import BackHeader from '@/components/BackHeader';
import { FollowButton } from '@/components/profile/FollowButton';
import { useUserPosts } from '@/hooks/posts/useUserPosts';
import { useCommentedOnFeed } from '@/hooks/feeds/useCommentedOnFeed';
import { Theme } from '@/constants/Theme';
import UnifyReplyIcon from '@/components/icons/UnifyReply.svg';
import { useCurrentUser } from '@/context/UserContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUserReportStatus } from '@/hooks/users/useUserReportStatus';
import { useUserBlockStatus } from '@/hooks/users/useUserBlockStatus';
import { useMutateBlockUser } from '@/hooks/users/useMutateBlockUser';
import { useToast } from '@/context/ToastContext';

interface TabHeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabHeader = memo(({ activeTab, setActiveTab }: TabHeaderProps) => {
  const { t } = useTranslation();
  const tabs = [
    { key: 'Posts', label: t('profile.posts') },
    { key: 'Comments', label: t('profile.comments') },
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.key}
          onPress={() => setActiveTab(tab.key)}
          style={[styles.tab, activeTab === tab.key && styles.activeTab]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === tab.key && styles.activeTabText,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});

interface ProfileProps {
  userId: string;
  initialTab?: string;
}

export default function Profile({ userId, initialTab }: ProfileProps) {
  const { t } = useTranslation();
  const { currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser();
  const currentUserId = currentUser?.id;
  const { data: userInfo } = useUserInfo(userId);
  const isCurrentUser = currentUserId === userId;
  const router = useRouter();
  const usePostsFeedHook = useCallback(useUserPosts.bind(null, userId), [
    userId,
  ]);
  const useCommentsFeedHook = useCallback(
    useCommentedOnFeed.bind(null, userId),
    [userId]
  );
  const { data: isReportedUser } = useUserReportStatus(userId);
  const { data: isBlockedUser } = useUserBlockStatus(userId);
  const { blockMutation, unblockMutation } = useMutateBlockUser();
  const [activeTab, setActiveTab] = useState(initialTab || 'Posts');
  const { showToast } = useToast();
  const { trackProfileViewed } = useAnalytics();
  const trackedProfileRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait for current user to resolve before firing — otherwise is_self can
    // briefly be false (during load) and then true once currentUser arrives,
    // producing duplicate/mislabeled profile_viewed events.
    if (!userId || isLoadingCurrentUser) return;
    if (trackedProfileRef.current === userId) return;
    trackProfileViewed({
      profile_user_id: userId,
      is_self: userId === currentUserId,
    });
    trackedProfileRef.current = userId;
  }, [userId, currentUserId, isLoadingCurrentUser, trackProfileViewed]);

  // Create data array with header, tabs, and feed content to be used to do sticky header
  const data = useMemo(
    () => [
      { key: 'header', type: 'header' },
      { key: 'tabs', type: 'tabs' },
      { key: 'feed', type: 'feed' },
    ],
    []
  );

  const blockStatusResolved = isBlockedUser !== undefined;

  const handleBlockToggle = useCallback(() => {
    if (!blockStatusResolved) return;
    if (isBlockedUser) {
      unblockMutation.mutate(userId, {
        onSuccess: () => showToast?.(t('profile.userUnblocked')),
        onError: () => showToast?.(t('profile.userUnblockFailed')),
      });
    } else {
      Alert.alert(t('profile.blockUser'), t('profile.blockUserConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.block'),
          style: 'destructive',
          onPress: () => {
            blockMutation.mutate(userId, {
              onSuccess: () => showToast?.(t('profile.userBlocked')),
              onError: () => showToast?.(t('profile.userBlockFailed')),
            });
          },
        },
      ]);
    }
  }, [
    blockStatusResolved,
    isBlockedUser,
    userId,
    blockMutation,
    unblockMutation,
    showToast,
    t,
  ]);

  const reportButton = useMemo(() => {
    if (isCurrentUser) return null;

    return (
      <TouchableOpacity
        style={styles.reportButton}
        onPress={() => {
          if (isReportedUser) {
            showToast?.(t('profile.alreadyReported'));
            return;
          }
          router.push({
            pathname: '/ReportScreen',
            params: { userId, type: 'user' },
          });
        }}
      >
        <MaterialCommunityIcons
          name={isReportedUser ? 'flag' : 'flag-outline'}
          size={26}
          color={Theme.black}
        />
      </TouchableOpacity>
    );
  }, [isCurrentUser, isReportedUser, router, showToast, userId, t]);

  const blockButton = useMemo(() => {
    if (isCurrentUser) return null;

    return (
      <TouchableOpacity
        style={styles.blockButton}
        onPress={handleBlockToggle}
        disabled={
          !blockStatusResolved ||
          blockMutation.isPending ||
          unblockMutation.isPending
        }
        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        accessibilityLabel={
          isBlockedUser ? t('profile.unblockUser') : t('profile.blockUser')
        }
        accessibilityRole='button'
        accessibilityHint={
          isBlockedUser
            ? t('profile.unblockUserHint')
            : t('profile.blockUserHint')
        }
        accessibilityState={{
          disabled:
            !blockStatusResolved ||
            blockMutation.isPending ||
            unblockMutation.isPending,
        }}
        testID='block-user-button'
      >
        <MaterialCommunityIcons
          name={isBlockedUser ? 'cancel' : 'block-helper'}
          size={22}
          color={isBlockedUser ? Theme.destructive : Theme.black}
        />
      </TouchableOpacity>
    );
  }, [
    isCurrentUser,
    isBlockedUser,
    blockStatusResolved,
    handleBlockToggle,
    blockMutation.isPending,
    unblockMutation.isPending,
    t,
  ]);

  const renderTabContent = useMemo(() => {
    if (activeTab === 'Comments') {
      return (
        <FeedWithHook
          key={`comments-${userId}`}
          useFeedHook={useCommentsFeedHook}
          ListEmptyComponent={
            <EmptyFeedMessage
              icon={<UnifyReplyIcon width={27} height={25} />}
              message={t('profile.emptyTabTitle')}
              submessage={
                isCurrentUser ? (
                  <Text style={styles.emptyMessageSubtext}>
                    {t('profile.emptyCommentsSelf')}
                  </Text>
                ) : (
                  <Text style={styles.emptyMessageSubtext}>
                    {t('profile.emptyCommentsOther')}
                  </Text>
                )
              }
            />
          }
        />
      );
    }

    return (
      <FeedWithHook
        key={`posts-${userId}`}
        useFeedHook={usePostsFeedHook}
        ListEmptyComponent={
          <EmptyFeedMessage
            icon={<UnifyReplyIcon width={27} height={25} />}
            message={t('profile.emptyTabTitle')}
            submessage={
              isCurrentUser ? (
                <Text style={styles.emptyMessageSubtext}>
                  {t('profile.emptyPostsSelf')}
                </Text>
              ) : (
                <Text style={styles.emptyMessageSubtext}>
                  {t('profile.emptyPostsOther')}
                </Text>
              )
            }
          />
        }
      />
    );
  }, [
    activeTab,
    isCurrentUser,
    useCommentsFeedHook,
    usePostsFeedHook,
    userId,
    t,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: { key: string; type: string } }) => {
      switch (item.type) {
        case 'header':
          return (
            <ProfileHeader
              key={userId}
              isCurrentUser={isCurrentUser}
              userInfo={userInfo}
            />
          );
        case 'tabs':
          return (
            <TabHeader activeTab={activeTab} setActiveTab={setActiveTab} />
          );
        case 'feed':
          return <View style={styles.feedContainer}>{renderTabContent}</View>;
        default:
          return null;
      }
    },
    [activeTab, isCurrentUser, renderTabContent, userId, userInfo]
  );

  return (
    <View style={styles.container}>
      <BackHeader
        title=''
        rightButton={
          !isCurrentUser && userInfo ? (
            <View style={styles.headerActionRow}>
              <FollowButton targetUserId={userInfo.id} compact />
              {blockButton}
              {reportButton}
            </View>
          ) : undefined
        }
      />
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={item => item.key}
        stickyHeaderIndices={[1]}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  feedContainer: {
    flex: 1,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  reportButton: {
    minWidth: 34,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingTop: 2,
  },
  tab: {
    backgroundColor: 'transparent',
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 28,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Theme.primaryGatherRed,
  },
  tabText: {
    fontSize: 17,
    fontWeight: '600',
    color: Theme.textInactiveTab,
  },
  activeTabText: {
    color: Theme.black,
  },
  emptyMessageSubtext: {
    ...typography.secondary,
    color: Theme.textInput,
    textAlign: 'center',
  },
});
