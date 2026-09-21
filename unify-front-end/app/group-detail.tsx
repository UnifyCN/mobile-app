import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { Group } from '@/types/groups';
import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getGroupByName } from '@/services/groups/getGroupByName';
import { PostItem } from '@/components/home/PostItem';
import { TranslateButton } from '@/components/home/TranslateButton';
import CreatePostButton from '@/components/posts/CreatePostButton';
import { useGroupPosts } from '@/hooks/feeds/useGroupPosts';
import { joinGroup } from '@/services/groups/joinGroup';
import { leaveGroup } from '@/services/groups/leaveGroup';
import { checkUserGroupMembership } from '@/services/groups/checkUserGroupMembership';
import { usePostMetadata } from '@/hooks/usePostMetadata';
import { PostData } from '@/types/feeds/post';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { SkeletonLoaderPostItem } from '@/components/SkeletonLoaderPostItem';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import UnifyReplyIcon from '@/components/icons/UnifyReply.svg';
import { Theme } from '@/constants/Theme';
import { useAnalytics } from '@/utils/analytics';
import BackHeader from '@/components/BackHeader';

import { useGroupMembers } from '@/hooks/groups/useGroupMembers';
import GroupMemberAvatarStack from '@/components/groups/GroupMemberAvatarStack';
import GroupMembersSheet from '@/components/groups/GroupMembersSheet';

// Destructive red color for Leave button
const DESTRUCTIVE_RED = '#DC3545';

const GroupDetailScreen = () => {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const { group, groupName } = useLocalSearchParams();
  const [groupData, setGroupData] = useState<Group | null>(
    group ? (JSON.parse(group as string) as Group) : null
  );
  const [loading, setLoading] = useState(false);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasTrackedView = useRef(false);

  const queryClient = useQueryClient();
  const { trackGroupViewed, trackGroupJoined, trackGroupLeft } = useAnalytics();

  const [membersOpen, setMembersOpen] = useState(false);
  const { data: members = [], refetch: refetchMembers } = useGroupMembers(
    groupData?.id
  );

  // Update groupData when group param changes
  useEffect(() => {
    if (group) {
      try {
        const parsedGroup = JSON.parse(group as string) as Group;
        setGroupData(parsedGroup);
        // Reset state when group changes
        setIsMember(null);
        hasTrackedView.current = false;
      } catch (error) {
        console.error('Failed to parse group data:', error);
      }
    } else {
      // Clear stale data when group param is removed so init effect can fetch by groupName
      setGroupData(null);
      setIsMember(null);
      hasTrackedView.current = false;
    }
  }, [group]);

  // Track group view when groupData is available
  useEffect(() => {
    if (groupData && !hasTrackedView.current) {
      trackGroupViewed(groupData.id.toString(), groupData.name);
      hasTrackedView.current = true;
    }
  }, [groupData, trackGroupViewed]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // If we don't have groupData but have a groupName, try to fetch and set it
        if (!groupData) {
          const name = groupName as string | undefined;
          if (!name) return;

          setLoading(true);
          const found = await getGroupByName(name);
          if (!mounted) return;
          if (found) {
            setGroupData(found);
            // Check membership for the found group
            const member = await checkUserGroupMembership(found.id);
            if (!mounted) return;
            setIsMember(member);
          }
          return;
        }

        // We have groupData: check membership (only if isMember is still null)
        if (isMember === null) {
          setLoading(true);
          const member = await checkUserGroupMembership(groupData.id);
          if (!mounted) return;
          setIsMember(member);
        }
      } catch (err) {
        console.error('Group detail init error', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName, groupData]);

  // posts for this group
  const groupId = groupData?.id;
  const {
    data: postsData,
    fetchNextPage,
    isLoading: postsLoading,
    refetch,
  } = useGroupPosts(groupId);
  const posts =
    (postsData as any)?.pages.flatMap((page: any) => page.posts) ?? [];

  // Get post IDs for metadata fetching
  const postIds = posts.map((post: PostData) => post.id);
  const { data: postMetadata, isLoading: postMetadataLoading } =
    usePostMetadata(postIds);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchMembers()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleJoinToggle = async () => {
    if (!groupData) return;
    if (joining) return;
    setJoining(true);

    // Store original values for rollback
    const originalIsMember = isMember;
    const originalMemberCount = groupData.memberCount;

    try {
      if (isMember) {
        // Optimistically update UI for leaving
        await leaveGroup(groupData.id);
        trackGroupLeft(groupData.id.toString(), groupData.name);
        setIsMember(false);
        queryClient.resetQueries({ queryKey: ['joined-groups', 'self'] });
        queryClient.invalidateQueries({ queryKey: ['available-groups'] });
        setGroupData(prev =>
          prev
            ? {
                ...prev,
                memberCount: Math.max(0, prev.memberCount - 1),
              }
            : prev
        );
      } else {
        // Optimistically update UI for joining
        await joinGroup(groupData.id);
        trackGroupJoined(groupData.id.toString(), groupData.name);
        queryClient.resetQueries({ queryKey: ['joined-groups', 'self'] });
        queryClient.invalidateQueries({ queryKey: ['available-groups'] });
        setIsMember(true);
        setGroupData(prev =>
          prev
            ? {
                ...prev,
                memberCount: prev.memberCount + 1,
              }
            : prev
        );
      }
    } catch (err) {
      console.error('Join toggle failed', err);
      // Rollback optimistic updates on error
      setIsMember(originalIsMember);
      setGroupData(prev =>
        prev
          ? {
              ...prev,
              memberCount: originalMemberCount,
            }
          : prev
      );
    } finally {
      queryClient.resetQueries({ queryKey: ['feed', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['available-groups'] });
      queryClient.invalidateQueries({
        queryKey: ['group-members', groupData.id],
      });
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <BackHeader />
        <View style={styles.contentContainer}>
          {/* Title Skeleton */}
          <SkeletonLoader
            width='70%'
            height={28}
            style={{ marginBottom: 12 }}
          />

          {/* Cover Image Skeleton */}
          <SkeletonLoader
            width='100%'
            height={200}
            style={styles.imageSkeleton}
          />

          {/* Metadata Skeleton */}
          <SkeletonLoader
            width='40%'
            height={20}
            style={{ marginBottom: 12 }}
          />

          {/* CTA Button Skeleton */}
          <SkeletonLoader
            width='100%'
            height={48}
            style={{ marginBottom: 24, borderRadius: 12 }}
          />

          {/* Description Skeleton */}
          <SkeletonLoader
            width='100%'
            height={16}
            style={{ marginBottom: 8 }}
          />
          <SkeletonLoader width='90%' height={16} style={{ marginBottom: 8 }} />
          <SkeletonLoader width='75%' height={16} />
        </View>

        {/* Posts Skeleton */}
        <View style={{ backgroundColor: Theme.white }}>
          {[1, 2, 3].map(i => (
            <SkeletonLoaderPostItem key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (!groupData) {
    return (
      <View style={styles.container}>
        <BackHeader />
        <Text style={styles.loadingText}>{t('groups.groupNotFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} key={groupData.id}>
      {/* Header - Using BackHeader component */}
      <BackHeader />

      {/* Single scrollable content */}
      <FlatList
        data={posts}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <PostItem
            post={item}
            metadata={postMetadata?.[item.id]}
            metadataLoading={postMetadataLoading}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isFocused && refreshing}
            onRefresh={onRefresh}
          />
        }
        ListHeaderComponent={() => (
          <View style={styles.contentContainer}>
            {/* Group Title */}
            <Text style={styles.groupTitle}>{groupData.name}</Text>

            {/* Group Image - Card style */}
            {groupData.coverPhotoUrl ? (
              <Image
                source={{ uri: groupData.coverPhotoUrl }}
                style={styles.groupImage}
                resizeMode='cover'
              />
            ) : (
              <View style={styles.imagePlaceholder} />
            )}

            {/* Metadata - Member count with status badge */}
            <View style={styles.metadataRow}>
              <Feather
                name='users'
                size={16}
                color={Theme.textAlternateGray}
                style={styles.metadataIcon}
              />
              <Text style={styles.metadataText}>
                {t('common.memberCount', { count: groupData.memberCount })}
              </Text>
              {isMember && (
                <View style={styles.memberBadge}>
                  <Feather name='check-circle' size={14} color='#4CAF50' />
                  <Text style={styles.memberBadgeText}>{t('groups.joined')}</Text>
                </View>
              )}
            </View>

            {members.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <GroupMemberAvatarStack
                  members={members}
                  totalCount={groupData.memberCount}
                  onPress={() => setMembersOpen(true)}
                />
              </View>
            )}

            {/* Join/Leave CTA Button */}
            <TouchableOpacity
              onPress={handleJoinToggle}
              disabled={joining}
              style={[
                styles.ctaButton,
                isMember ? styles.ctaButtonLeave : styles.ctaButtonJoin,
                joining && styles.ctaButtonDisabled,
              ]}
            >
              <Text style={styles.ctaButtonText}>
                {joining
                  ? isMember
                    ? t('groups.leaving')
                    : t('groups.joining')
                  : isMember
                    ? t('groups.leaveGroup')
                    : t('groups.joinGroup')}
              </Text>
            </TouchableOpacity>

            {/* About Group */}
            {groupData.description && (
              <>
                <Text style={styles.aboutTitle}>{t('groups.about')}</Text>
                <Text style={styles.aboutText}>{groupData.description}</Text>
              </>
            )}

            {/* Machine translation of the group name + description. Renders
                nothing when the UI language is English. */}
            <TranslateButton type='group' id={groupData.id} />

            {/* Posts section divider */}
            {posts.length > 0 && <View style={styles.sectionDivider} />}
          </View>
        )}
        ListEmptyComponent={() => {
          if (postsLoading) return null;
          return (
            <EmptyFeedMessage
              icon={<UnifyReplyIcon width={27} height={25} />}
              message={t('groups.emptyGroup')}
              submessage={
                <Text
                  style={{
                    fontSize: 18,
                    color: Theme.textInput,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}
                >
                  {t('groups.beFirstPost')}
                </Text>
              }
            />
          );
        }}
        onEndReached={() => fetchNextPage()}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />

      {/* floating create post button, only visible when user is a member */}
      {isMember && <CreatePostButton preselectedGroup={groupData} />}

      <GroupMembersSheet
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  contentContainer: {
    paddingTop: 4,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  groupTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Theme.black,
    marginBottom: 12,
    lineHeight: 28,
  },
  groupImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: Theme.imagePlaceholder,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: Theme.imagePlaceholder,
  },
  imageSkeleton: {
    borderRadius: 12,
    marginBottom: 20,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  metadataIcon: {
    marginRight: 10,
  },
  metadataText: {
    fontSize: 16,
    color: Theme.black,
    lineHeight: 22,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberBadgeText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
    marginLeft: 4,
  },
  ctaButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  ctaButtonJoin: {
    backgroundColor: Theme.primaryGatherRed,
  },
  ctaButtonLeave: {
    backgroundColor: DESTRUCTIVE_RED,
  },
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaButtonText: {
    color: Theme.white,
    fontSize: 16,
    fontWeight: '600',
  },
  aboutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Theme.black,
    marginBottom: 6,
  },
  aboutText: {
    fontSize: 18,
    color: Theme.black,
    lineHeight: 27,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Theme.surfaceGray,
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: -20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
});

export default GroupDetailScreen;
