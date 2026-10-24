import { typography } from '@/constants/Typography';
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { getUserJoinedGroups } from '@/services/groups/getUserJoinedGroups';
import { getAvailableGroups } from '@/services/groups/getAvailableGroups';
import { joinGroup } from '@/services/groups/joinGroup';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Feather from '@expo/vector-icons/Feather';
import { Theme } from '@/constants/Theme';
import { Avatar } from '@/components/Avatar';
import BottomSheet from '@/components/common/BottomSheet';
import { Group } from '@/types/groups';

interface GroupSelectionSheetProps {
  visible: boolean;
  onClose: () => void;
  onGroupSelect: (group: Group) => void;
  useModal?: boolean;
}

export default function GroupSelectionSheet({
  visible,
  onClose,
  onGroupSelect,
  useModal = true,
}: GroupSelectionSheetProps) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const [joiningGroupId, setJoiningGroupId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Fetch user's joined groups
  const { data: joinedGroups, isLoading: joinedLoading } = useQuery({
    queryKey: ['joined-groups', 'self'],
    queryFn: () => getUserJoinedGroups(),
    enabled: visible,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch available groups (groups user hasn't joined)
  const { data: availableGroups, isLoading: availableLoading } = useQuery({
    queryKey: ['available-groups'],
    queryFn: getAvailableGroups,
    enabled: visible,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Join group mutation
  const joinMutation = useMutation({
    mutationFn: (groupId: number) => joinGroup(groupId),
    onSuccess: () => {
      // Invalidate queries to refresh the lists
      queryClient.invalidateQueries({ queryKey: ['joined-groups', 'self'] });
      queryClient.invalidateQueries({ queryKey: ['available-groups'] });
    },
  });

  const hasJoinedGroups = joinedGroups && joinedGroups.length > 0;

  // Filter joined groups based on search
  const filteredJoinedGroups = useMemo(() => {
    if (!joinedGroups || !searchText.trim()) {
      return joinedGroups || [];
    }
    return joinedGroups.filter(group =>
      group.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [joinedGroups, searchText]);

  // Filter available groups based on search
  const filteredAvailableGroups = useMemo(() => {
    if (!availableGroups || !searchText.trim()) {
      return availableGroups || [];
    }
    return availableGroups.filter(group =>
      group.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [availableGroups, searchText]);

  const handleGroupSelect = (group: Group) => {
    onGroupSelect(group);
    setSearchText('');
    onClose();
  };

  const handleJoinAndSelect = async (group: Group) => {
    setJoiningGroupId(group.id);
    try {
      await joinMutation.mutateAsync(group.id);
      // After joining, select the group for posting
      handleGroupSelect(group);
    } catch (error) {
      Alert.alert(
        t('posts.failedToJoin'),
        error instanceof Error ? error.message : t('posts.couldNotJoin')
      );
    } finally {
      setJoiningGroupId(null);
    }
  };

  const handleClose = () => {
    setSearchText('');
    onClose();
  };

  const isLoading = joinedLoading || availableLoading;

  const renderGroupItem = (group: Group, isJoined: boolean) => (
    <TouchableOpacity
      key={group.id}
      style={styles.groupOption}
      onPress={() => handleGroupSelect(group)}
      activeOpacity={0.7}
      disabled={!isJoined}
    >
      <Avatar
        profilePictureUrl={group.coverPhotoUrl || undefined}
        username={group.name}
        size={56}
      />
      <View style={styles.groupInfo}>
        <Text style={styles.groupName}>{group.name}</Text>
        <Text style={styles.groupDescription} numberOfLines={2}>
          {group.description || t('common.noDescription')}
        </Text>
      </View>
      {!isJoined && (
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => handleJoinAndSelect(group)}
          disabled={joiningGroupId === group.id}
        >
          {joiningGroupId === group.id ? (
            <ActivityIndicator size='small' color='#fff' />
          ) : (
            <Text style={styles.joinButtonText}>{t('posts.joinAndPost')}</Text>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <BottomSheet visible={visible} onClose={handleClose} useModal={useModal}>
      <View style={styles.container}>
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Feather name='search' size={20} color={Theme.textInput} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('groups.searchGroups')}
              placeholderTextColor={Theme.textAlternateGray}
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize='none'
              autoCorrect={false}
            />
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size='large' color={Theme.primaryGatherRed} />
              <Text style={styles.loadingText}>
                {t('groups.loadingGroups')}
              </Text>
            </View>
          ) : (
            <>
              {/* Your Groups Section */}
              {hasJoinedGroups && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {t('groups.yourGroups')}
                  </Text>
                  <View style={styles.groupsList}>
                    {filteredJoinedGroups.length > 0 ? (
                      filteredJoinedGroups.map(group =>
                        renderGroupItem(group, true)
                      )
                    ) : (
                      <Text style={styles.noResultsText}>
                        {t('groups.noGroupsMatch')}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Discover Groups Section */}
              {filteredAvailableGroups &&
                filteredAvailableGroups.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {hasJoinedGroups
                        ? t('groups.discoverMore')
                        : t('groups.discoverGroups')}
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      {t('groups.joinToPost')}
                    </Text>
                    <View style={styles.groupsList}>
                      {filteredAvailableGroups.map(group =>
                        renderGroupItem(group, false)
                      )}
                    </View>
                  </View>
                )}

              {/* Empty state when no groups at all */}
              {!hasJoinedGroups &&
                (!filteredAvailableGroups ||
                  filteredAvailableGroups.length === 0) && (
                  <View style={styles.emptyContainer}>
                    {searchText.trim() ? (
                      <>
                        <Text style={styles.emptyTitle}>
                          {t('groups.noGroupsMatch')}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                          {t('posts.tryDifferentSearchTerm')}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.emptyTitle}>
                          {t('posts.noGroupsAvailable')}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                          {t('posts.checkBackLaterForNewGroups')}
                        </Text>
                      </>
                    )}
                  </View>
                )}
            </>
          )}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 20,
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.surfaceTextInput,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 15,
  },
  searchInput: { ...typography.body, flex: 1, color: Theme.black },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: { ...typography.body, marginTop: 16, color: '#666' },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.cardTitle,
    color: Theme.black,
    marginBottom: 4,
  },
  sectionSubtitle: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    marginBottom: 12,
  },
  groupsList: {
    gap: 16,
  },
  groupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    gap: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: { ...typography.cardTitle, color: Theme.black, marginBottom: 2 },
  groupDescription: { ...typography.secondary, color: '#666' },
  joinButton: {
    backgroundColor: Theme.primaryGatherRed,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  joinButtonText: { ...typography.button, color: '#fff' },
  noResultsText: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    textAlign: 'center',
    paddingVertical: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: { ...typography.cardTitle, color: Theme.black, marginBottom: 8 },
  emptySubtitle: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    textAlign: 'center',
  },
});
