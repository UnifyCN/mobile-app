import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFollowers } from '@/hooks/users/useFollowers';
import { useFollowing } from '@/hooks/users/useFollowing';
import { Avatar } from '@/components/Avatar';
import BackHeader from '@/components/BackHeader';
import { Theme } from '@/constants/Theme';
import { FollowButton } from '@/components/profile/FollowButton';
import { useCurrentUser } from '@/context/UserContext';
import type { FollowSource } from '@/utils/analytics';

export const navigationOptions = {
  headerShown: false,
};

type TabType = 'followers' | 'following';

interface UserListItemProps {
  user: {
    id: string;
    username: string;
    profilePictureUrl?: string;
  };
  currentUserId?: string;
  source: FollowSource;
}

const UserListItem = ({ user, currentUserId, source }: UserListItemProps) => {
  const router = useRouter();
  const isCurrentUser = currentUserId === user.id;

  const handlePress = () => {
    router.push({
      pathname: '/profile',
      params: { userId: user.id },
    });
  };

  return (
    <TouchableOpacity
      style={styles.userItem}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.userInfo}>
        <Avatar
          profilePictureUrl={user.profilePictureUrl}
          username={user.username}
          size={48}
          style={styles.avatar}
        />
        <Text style={styles.username}>{user.username}</Text>
      </View>
      {!isCurrentUser && (
        <FollowButton
          targetUserId={user.id}
          compact={true}
          source={source}
        />
      )}
    </TouchableOpacity>
  );
};

export default function FollowersFollowingScreen() {
  const { userId, initialTab } = useLocalSearchParams();
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<TabType>(
    (initialTab as TabType) || 'followers'
  );

  const normalizedUserId = Array.isArray(userId) ? userId[0] : userId;

  const {
    data: followers,
    isLoading: followersLoading,
    error: followersError,
  } = useFollowers(normalizedUserId || '');

  const {
    data: following,
    isLoading: followingLoading,
    error: followingError,
  } = useFollowing(normalizedUserId || '');

  const isLoading =
    activeTab === 'followers' ? followersLoading : followingLoading;
  const error = activeTab === 'followers' ? followersError : followingError;
  const data = activeTab === 'followers' ? followers : following;

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size='large' color={Theme.primaryGatherRed} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>{t('profile.failedLoadUsers')}</Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>
          {activeTab === 'followers'
            ? t('profile.noFollowersYet')
            : t('profile.notFollowingAnyone')}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <BackHeader title='' />

      <View style={styles.tabsContainer}>
        {/* eslint-disable-next-line i18next/no-literal-string -- tab ids, not copy; the visible label comes from t() below */}
        {(['followers', 'following'] as TabType[]).map(tab => {
          const active = activeTab === tab;
          const label = tab === 'followers' ? t('profile.followersTab') : t('profile.followingTab');

          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={styles.tabButton}
              accessibilityRole='tab'
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {label}
              </Text>
              <View
                style={[
                  styles.tabIndicator,
                  active && styles.tabIndicatorActive,
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={data || []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <UserListItem
            user={item}
            currentUserId={currentUser?.id}
            source={
              activeTab === 'followers' ? 'followers_list' : 'following_list'
            }
          />
        )}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          !data || data.length === 0 ? styles.emptyListContainer : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    gap: 22,
  },
  tabButton: {
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: Theme.textInactiveTab,
  },
  tabTextActive: {
    color: Theme.black,
    fontWeight: '600',
  },
  tabIndicator: {
    marginTop: 8,
    height: 2,
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 1,
  },
  tabIndicatorActive: {
    backgroundColor: Theme.black,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    borderWidth: 1,
    borderColor: Theme.imagePlaceholder,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.black,
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: Theme.textInput,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
});
