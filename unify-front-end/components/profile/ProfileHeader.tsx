import React, { useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { UserInfo } from '@/services/users/getUserInfo';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { ProfilePictureUpload } from './ProfilePictureUpload';
import { Avatar } from '@/components/Avatar';
import { Theme } from '@/constants/Theme';
import InfoBadge from '@/components/common/InfoBadge';
import {
  getPersonaBadgeInfo,
  getTimeInCanadaBadgeInfo,
} from '@/utils/onboardingBadges';
import { useUserJoinedGroups } from '@/hooks/groups/useUserJoinedGroups';
import { Group } from '@/types/groups';

interface ProfileHeaderProps {
  userInfo: UserInfo | undefined;
  isCurrentUser: boolean | null;
}

const AVATAR_SIZE = 92;
const GROUP_TILE_SIZE = 60;
const GROUP_DETAIL_ROUTE: Href = '/group-detail';

export const ProfileHeader = ({
  userInfo,
  isCurrentUser,
}: ProfileHeaderProps) => {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const router = useRouter();

  const {
    data: joinedGroups = [],
    isLoading: groupsLoading,
    isError: groupsError,
  } = useUserJoinedGroups(userInfo?.id);

  const personaBadge = getPersonaBadgeInfo(
    userInfo?.persona ?? null,
    userInfo?.personaOther ?? null
  );
  const timeInCanadaBadge = getTimeInCanadaBadgeInfo(
    userInfo?.arrivalDate ?? null
  );

  const handleGroupPress = (group: Group) => {
    router.push({
      pathname: GROUP_DETAIL_ROUTE,
      params: { group: JSON.stringify(group) },
    });
  };

  const handleFollowersPress = () => {
    if (!userInfo) return;
    router.push({
      pathname: '/followers-following',
      params: { userId: userInfo.id, initialTab: 'followers' },
    });
  };

  const handleFollowingPress = () => {
    if (!userInfo) return;
    router.push({
      pathname: '/followers-following',
      params: { userId: userInfo.id, initialTab: 'following' },
    });
  };

  if (!userInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.topRow}>
          <SkeletonLoader
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            borderRadius={AVATAR_SIZE / 2}
          />
          <View style={styles.topStatsColumn}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <SkeletonLoader width={34} height={24} />
                <SkeletonLoader
                  width={62}
                  height={14}
                  style={styles.statLabelSkeleton}
                />
              </View>
              <View style={styles.statItem}>
                <SkeletonLoader width={34} height={24} />
                <SkeletonLoader
                  width={62}
                  height={14}
                  style={styles.statLabelSkeleton}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.identitySection}>
          <SkeletonLoader width={140} height={32} style={styles.nameSkeleton} />
          <View style={styles.badgesRow}>
            <SkeletonLoader width={130} height={28} />
            <SkeletonLoader width={96} height={28} />
          </View>
        </View>
        <View style={styles.groupsSection}>
          <SkeletonLoader width={80} height={24} />
          <View style={styles.groupSkeletonRow}>
            {[0, 1, 2, 3].map(item => (
              <SkeletonLoader
                key={item}
                width={GROUP_TILE_SIZE}
                height={GROUP_TILE_SIZE}
                borderRadius={18}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.avatarWrapper}>
          <Avatar
            profilePictureUrl={userInfo.profilePictureUrl}
            username={userInfo.username}
            size={AVATAR_SIZE}
            style={styles.profilePicture}
          />
          {isCurrentUser && (
            <>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={() => setModalVisible(true)}
              >
                <View style={styles.cameraIconContainer}>
                  <Feather name='camera' size={18} color={Theme.white} />
                </View>
              </TouchableOpacity>
              <ProfilePictureUpload
                currentPictureUrl={userInfo.profilePictureUrl}
                userId={userInfo.id}
                modalVisible={modalVisible}
                onClose={() => setModalVisible(false)}
              />
            </>
          )}
        </View>

        <View style={styles.topStatsColumn}>
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={handleFollowersPress}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{userInfo.followerCount}</Text>
              <Text style={styles.statLabel}>{t('profile.followersLabel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={handleFollowingPress}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{userInfo.followingCount}</Text>
              <Text style={styles.statLabel}>{t('profile.followingLabel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.identitySection}>
        {isCurrentUser ? (
          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => router.push('/edit-name')}
            activeOpacity={0.7}
          >
            <Text style={styles.nameText}>{userInfo.username}</Text>
            <Feather name='edit-3' size={18} color={Theme.black} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.nameText}>{userInfo.username}</Text>
        )}

        {(personaBadge || timeInCanadaBadge) && (
          <View style={styles.badgesRow}>
            {personaBadge && (
              <InfoBadge
                label={personaBadge.labelText ?? t(personaBadge.labelKey)}
                iconName={personaBadge.iconName}
                backgroundColor={personaBadge.colors.backgroundColor}
                textColor={personaBadge.colors.textColor}
                style={styles.badge}
              />
            )}
            {timeInCanadaBadge && (
              <InfoBadge
                label={t(timeInCanadaBadge.labelKey)}
                iconName={timeInCanadaBadge.iconName}
                backgroundColor={timeInCanadaBadge.colors.backgroundColor}
                textColor={timeInCanadaBadge.colors.textColor}
                style={styles.badge}
              />
            )}
          </View>
        )}
      </View>

      <View style={styles.groupsSection}>
        <Text style={styles.groupsTitle}>{t('profile.groups')}</Text>

        {groupsLoading ? (
          <View style={styles.groupSkeletonRow}>
            {[0, 1, 2, 3].map(item => (
              <SkeletonLoader
                key={item}
                width={GROUP_TILE_SIZE}
                height={GROUP_TILE_SIZE}
                borderRadius={18}
              />
            ))}
          </View>
        ) : groupsError ? (
          <Text style={styles.emptyGroupsText}>{t('profile.unableLoadGroups')}</Text>
        ) : joinedGroups.length > 0 ? (
          <FlatList
            data={joinedGroups}
            keyExtractor={item => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupsList}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.groupTile}
                onPress={() => handleGroupPress(item)}
                activeOpacity={0.8}
              >
                <Avatar
                  profilePictureUrl={item.coverPhotoUrl || undefined}
                  username={item.name}
                  size={GROUP_TILE_SIZE}
                  style={styles.groupAvatar}
                />
              </TouchableOpacity>
            )}
          />
        ) : (
          <Text style={styles.emptyGroupsText}>{t('profile.noGroupsYet')}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Theme.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  topStatsColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: AVATAR_SIZE,
    paddingHorizontal: 8,
  },
  identitySection: {
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: Theme.black,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    marginRight: 0,
    marginBottom: 0,
  },
  nameSkeleton: {
    marginTop: 2,
  },
  avatarWrapper: {
    position: 'relative',
  },
  profilePicture: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: Theme.imagePlaceholder,
    backgroundColor: Theme.surfaceTextInput,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  cameraIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.primaryGatherRed,
    borderWidth: 2,
    borderColor: Theme.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 260,
  },
  statItem: {
    alignItems: 'center',
    width: 120,
  },
  statNumber: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: Theme.black,
  },
  statLabel: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: Theme.textAlternateGray,
  },
  statLabelSkeleton: {
    marginTop: 6,
  },
  groupsSection: {
    gap: 8,
    marginTop: 14,
  },
  groupsTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: Theme.black,
  },
  groupsList: {
    paddingRight: 20,
    gap: 10,
  },
  groupTile: {
    width: GROUP_TILE_SIZE,
    height: GROUP_TILE_SIZE,
    borderRadius: 14,
    overflow: 'hidden',
  },
  groupAvatar: {
    width: GROUP_TILE_SIZE,
    height: GROUP_TILE_SIZE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceTextInput,
  },
  emptyGroupsText: {
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textInput,
  },
  groupSkeletonRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
