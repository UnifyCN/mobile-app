import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSearchUsers } from '@/hooks/users/useSearchUsers';
import type { SearchUserResult } from '@/services/users/searchUsers';
import { Avatar } from '@/components/Avatar';
import BackHeader from '@/components/BackHeader';
import { Theme } from '@/constants/Theme';

export default function SeeMoreUsersScreen() {
  const { t } = useTranslation();
  const { q } = useLocalSearchParams<{ q: string }>();
  const router = useRouter();
  const searchQuery = q ?? '';

  const { data: users, isLoading } = useSearchUsers(searchQuery);

  const userPress = (user: SearchUserResult) => {
    router.push({
      pathname: '/profile',
      params: { userId: user.id },
    });
  };

  const renderUser = ({ item }: { item: SearchUserResult }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => userPress(item)}
      activeOpacity={0.7}
    >
      <Avatar
        profilePictureUrl={item.profilePictureUrl ?? undefined}
        username={item.username}
        size={40}
        style={styles.userAvatar}
      />
      <Text style={styles.userName}>{item.username}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <BackHeader title={t('search.title')} />

      {isLoading ? (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : !users?.length ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('search.noPeopleFound')}</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={item => item.id}
          ItemSeparatorComponent={() => (
            <View style={styles.userItemSeparator} />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
    paddingHorizontal: 20,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  userAvatar: {
    marginRight: 12,
  },
  userName: { ...typography.body, color: Theme.black },
  userItemSeparator: {
    height: 1,
    backgroundColor: Theme.surfaceGray,
    marginLeft: 52,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { ...typography.secondary, color: Theme.textAlternateGray },
  emptyText: { ...typography.secondary, color: Theme.textInput },
});
