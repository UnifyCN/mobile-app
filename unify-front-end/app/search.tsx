import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState, useEffect } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Group } from '@/types/groups';
import { useSearchGroups } from '@/hooks/groups/useSearchGroups';
import { useSearchUsers } from '@/hooks/users/useSearchUsers';
import type { SearchUserResult } from '@/services/users/searchUsers';
import GroupCard from '@/components/groups/GroupCard';
import { Avatar } from '@/components/Avatar';
import { PostData } from '@/types/feeds/post';
import { PostItem } from '@/components/home/PostItem';
import { useQuery } from '@tanstack/react-query';
import { getAllPosts } from '@/services/posts/getAllPosts';
import {
  saveRecentSearch,
  getRecentSearches,
} from '@/services/users/recentSearches';
import {
  saveRecentGroups,
  getRecentGroupsWithData,
} from '@/services/users/recentGroups';
import { supabase } from '@/lib/supabase';
import BackHeader from '@/components/BackHeader';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

export const navigationOptions = {
  headerShown: false,
};

const SearchScreen = () => {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { data: searchGroups, isLoading: searchGroupsLoading } =
    useSearchGroups(searchQuery);
  const { data: searchUsersData, isLoading: searchUsersLoading } =
    useSearchUsers(searchQuery);
  const [recentGroups, setRecentGroups] = useState<Group[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['searchPosts', searchQuery],
    queryFn: () => getAllPosts(undefined, 50, searchQuery),
    enabled: !!searchQuery,
  });

  const postsToShow = searchResults?.posts ?? [];
  let searchHistory = null;
  let groupsHistory = null;

  useEffect(() => {
    const loadRecent = async () => {
      setLoadingData(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) return;

        const { searches } = await getRecentSearches(userId);
        setRecentSearches(searches);

        const { groups: recentGroupsData } =
          await getRecentGroupsWithData(userId);
        setRecentGroups(recentGroupsData);
      } catch (err) {
        console.error('loading error', err);
      } finally {
        setLoadingData(false);
      }
    };
    loadRecent();
  }, []);

  const handleSend = async (value?: string) => {
    const rawInput = (typeof value === 'string' ? value : searchInput) ?? '';
    const input = rawInput.trim();

    if (!input) {
      setSearchQuery('');
      return;
    }

    setSearchQuery(input);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    const res = await saveRecentSearch(userId, input);
    if (res?.error) {
      console.error('saveRecentSearch failed', res.error);
      return;
    }

    setRecentSearches(prev => {
      const updated = [input, ...prev.filter(s => s !== input)];
      return updated;
    });
  };

  const filterGroups = searchGroups || [];
  const filterUsers = searchUsersData ?? [];

  let foundGroup = filterGroups && filterGroups.length > 0;
  let foundUser = filterUsers.length > 0;
  let foundPost = searchQuery
    ? (searchResults?.posts?.length ?? 0) > 0
    : postsToShow.length > 0;
  const shouldShowEmptyState =
    !!searchQuery &&
    !foundGroup &&
    !foundPost &&
    !foundUser &&
    !searchGroupsLoading &&
    !searchLoading &&
    !searchUsersLoading;

  const groupPress = async (group: Group) => {
    setRecentGroups(prev => [
      group,
      ...prev.filter(tempGroup => tempGroup.id !== group.id),
    ]);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const res = await saveRecentGroups(userId, Number(group.id));
        if (res?.error) console.error('saveRecentGroups failed', res.error);
      }
    } catch (e) {
      console.error('saveRecentGroups exception', e);
    }

    // Navigate to GroupDetailScreen
    router.push({
      pathname: '/group-detail' as any,
      params: { group: JSON.stringify(group) },
    });
  };

  const renderPosts = ({ item }: { item: PostData }) => (
    <View style={styles.cardItem}>
      <PostItem post={item} shouldHideContent />
    </View>
  );
  const renderGroup = ({ item }: { item: Group }) => (
    <View style={styles.cardItem}>
      <GroupCard group={item} onPress={() => groupPress(item)} />
    </View>
  );

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

  if (
    recentSearches.length > 0 &&
    !(searchInput.trim().length > 0 && !searchQuery)
  ) {
    // user is typing but hasn't submitted yet — show the helper frame
    searchHistory = (
      <View style={{ marginTop: 10 }}>
        <Text style={styles.recentSectionHeader}>{t('search.recentSearches')}</Text>
        {recentSearches.map((recentSearch, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => {
              setSearchInput(recentSearch);
              handleSend(recentSearch);
            }}
            style={{ marginBottom: 12 }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Feather
                name='search'
                size={16}
                color='#666'
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: Theme.black, fontSize: 14 }}>
                {recentSearch}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  } else {
    searchHistory = (
      <View style={styles.searchFrame}>
        <Text style={styles.containerText}>
          {t('search.discoverPrompt')}
        </Text>
      </View>
    );
  }

  if (recentGroups.length > 0 && searchInput.trim().length === 0) {
    groupsHistory = (
      <View>
        <Text style={styles.recentSectionHeader}>{t('search.recentlyViewedGroups')}</Text>
        {recentGroups.map(group => (
          <View style={[styles.cardItem, { marginBottom: 20 }]} key={group.id}>
            <GroupCard group={group} onPress={() => groupPress(group)} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.searchContainer}>
      <BackHeader title={t('search.title')} />

      <View style={styles.searchInputContainer}>
        <Feather name='search' size={20} color={Theme.textInput} />
        <TextInput
          value={searchInput}
          onChangeText={text => {
            setSearchInput(text);
          }}
          style={styles.searchInput}
          //in figma says events and groups but this screen doesnt check events
          placeholder={t('search.placeholder')}
          onSubmitEditing={() => handleSend()}
          placeholderTextColor={Theme.textInput}
        />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: shouldShowEmptyState ? 'center' : 'flex-start',
        }}
      >
        {/*Show history/recent*/}
        {!searchQuery && loadingData ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ActivityIndicator size='small' color='#666' />
            <Text style={{ marginTop: 8, color: '#666' }}>{t('common.loading')}</Text>
          </View>
        ) : (
          <>
            {!searchQuery && searchHistory}
            {!searchQuery && groupsHistory}
          </>
        )}

        {searchQuery &&
        (searchLoading || searchGroupsLoading || searchUsersLoading) ? (
          <View
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <ActivityIndicator size='small' color='#666' />
            <Text style={{ marginTop: 8, color: '#666' }}>{t('common.loading')}</Text>
          </View>
        ) : (
          <>
            {searchQuery && foundUser && (
              <View>
                <View style={[styles.postsHeader, { marginBottom: 12 }]}>
                  <Text style={styles.resultHeaderText}>{t('search.people')}</Text>
                  {filterUsers.length > 3 && (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: '/see-more-users' as any,
                          params: { q: searchQuery },
                        })
                      }
                    >
                      <Text style={styles.seeMoreText}>{t('common.seeMore')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <FlatList
                  data={filterUsers.slice(0, 3)}
                  renderItem={renderUser}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => (
                    <View style={styles.userItemSeparator} />
                  )}
                />
              </View>
            )}

            {searchQuery && foundPost && (
              <View>
                <View style={styles.postsHeader}>
                  <Text style={[styles.resultHeaderText, { marginTop: 8 }]}>
                    {t('search.posts')}
                  </Text>
                  {postsToShow.length > 3 && (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: '/see-more-posts' as any,
                          params: { q: searchQuery },
                        })
                      }
                    >
                      <Text style={styles.seeMoreText}>{t('common.seeMore')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <FlatList
                  data={postsToShow.slice(0, 3)}
                  renderItem={renderPosts}
                  keyExtractor={item => item.id.toString()}
                  scrollEnabled={false}
                />
              </View>
            )}

            {searchQuery && foundGroup && (
              <View>
                <View style={[styles.postsHeader, { marginBottom: 20 }]}>
                  <Text style={styles.resultHeaderText}>{t('search.groups')}</Text>
                  {(filterGroups?.length ?? 0) > 3 && (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: '/see-more-groups' as any,
                          params: { q: searchQuery },
                        })
                      }
                    >
                      <Text style={styles.seeMoreText}>{t('common.seeMore')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <FlatList
                  data={(filterGroups ?? []).slice(0, 3)}
                  renderItem={renderGroup}
                  keyExtractor={item => item.id.toString()}
                  scrollEnabled={false}
                  contentContainerStyle={{ gap: 20, paddingBottom: 20 }}
                />
              </View>
            )}
          </>
        )}

        {shouldShowEmptyState && (
          <View style={styles.emptyContainer}>
            <Feather name='search' size={48} color='#ccc' />
            <Text style={styles.emptyText}>{t('search.noResults')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  cardItem: {
    width: '100%',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  containerText: {
    fontSize: 14,
    color: Theme.textInput,
    textAlign: 'left',
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#464646ff',
    marginTop: 16,
    marginBottom: 8,
  },
  recentSectionHeader: {
    fontSize: 12,
    color: Theme.textAlternateGray,
    fontWeight: '600',
    marginTop: 16,
    lineHeight: 14,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  postsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textAlternateGray,
    marginTop: 16,
    marginBottom: 0,
    lineHeight: 16,
  },
  resultHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textAlternateGray,
    marginBottom: 0,
    lineHeight: 16,
  },
  seeMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textAlternateGray,
    marginBottom: 0,
    lineHeight: 16,
  },
  searchContainer: {
    paddingHorizontal: 20,
    flex: 1,
    backgroundColor: '#ffffffff',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surfaceTextInput,
    borderRadius: 100,
    paddingHorizontal: 24,
    paddingVertical: 8,
    height: 36,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textAlternateGray,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  userAvatar: {
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    color: Theme.black,
    fontWeight: '500',
  },
  userItemSeparator: {
    height: 1,
    backgroundColor: Theme.surfaceGray,
    marginLeft: 52,
  },
  searchFrame: {
    marginTop: 30,
    alignSelf: 'center',
    width: '100%',
    height: 69,
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 5,
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
  },
});
