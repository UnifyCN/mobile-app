import React, { useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import GroupCard from '@/components/groups/GroupCard';
import { Group } from '@/types/groups';
import { saveRecentGroups } from '@/services/users/recentGroups';
import { supabase } from '@/lib/supabase';
import BackHeader from '@/components/BackHeader';
import { useQuery } from '@tanstack/react-query';
import { getAvailableGroups } from '@/services/groups/getAvailableGroups';
import { getUserJoinedGroups } from '@/services/groups/getUserJoinedGroups';
import { Theme } from '@/constants/Theme';

type GroupsTab = 'discover' | 'joined';

export default function MoreGroupsScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<GroupsTab>('discover');
  const router = useRouter();

  const { data: discoverGroups, isLoading: discoverLoading } = useQuery({
    queryKey: ['available-groups'],
    queryFn: getAvailableGroups,
  });

  const { data: joinedGroups, isLoading: joinedLoading } = useQuery({
    queryKey: ['joined-groups', 'self'],
    queryFn: () => getUserJoinedGroups(),
  });

  const groups = useMemo(
    () => (activeTab === 'discover' ? discoverGroups : joinedGroups) ?? [],
    [activeTab, discoverGroups, joinedGroups]
  );
  const isLoading = activeTab === 'discover' ? discoverLoading : joinedLoading;

  const handleGroupPress = async (group: Group) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const res = await saveRecentGroups(userId, group.id);
      if (res?.error) console.error('saveRecentGroups failed', res.error);
    } catch (e) {
      console.error('saveRecentGroups exception', e);
    }

    // Navigate to GroupDetailScreen
    router.push({
      pathname: '/group-detail' as any,
      params: { group: JSON.stringify(group) },
    });
  };

  const renderGroup = ({ item }: { item: Group }) => {
    return (
      <View style={styles.groupItem}>
        <GroupCard group={item} onPress={() => handleGroupPress(item)} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <BackHeader title={t('groups.title')} />

      <View style={styles.tabsContainer}>
        {/* eslint-disable-next-line i18next/no-literal-string -- tab ids, not copy; the visible label comes from t() below */}
        {(['discover', 'joined'] as GroupsTab[]).map(tab => {
          const active = activeTab === tab;

          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={styles.tabButton}
              accessibilityRole='tab'
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab === 'discover' ? t('groups.discoverTabLabel') : t('groups.joinedTabLabel')}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab === 'discover' ? t('groups.discover') : t('groups.joined')}
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
        data={groups}
        renderItem={renderGroup}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {activeTab === 'discover'
                  ? t('groups.noGroupsDiscover')
                  : t('groups.noGroupsJoined')}
              </Text>
            </View>
          ) : null
        }
        keyExtractor={(i: Group) => String(i.id)}
        contentContainerStyle={styles.listContent}
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
  listContent: {
    paddingBottom: 40,
  },
  groupItem: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Theme.textInput,
  },
});
