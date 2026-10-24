import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Group } from '@/types/groups';
import { Avatar } from '@/components/Avatar';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { Theme } from '@/constants/Theme';

interface GroupsListProps {
  groups: Group[];
  onGroupSelect: (group: Group) => void;
  searchText?: string;
}

export default function SearchGroupsList({
  groups,
  onGroupSelect,
  searchText,
}: GroupsListProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.groupsList}>
      {groups.length > 0 ? (
        groups.map(group => (
          <TouchableOpacity
            key={group.id}
            style={styles.groupOption}
            onPress={() => onGroupSelect(group)}
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
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>
            {searchText?.trim() ? (
              t('groups.noGroupsMatch')
            ) : (
              <EmptyFeedMessage
                message={t('groups.noGroupsHere')}
                submessage={
                  <Text
                    style={{
                      ...typography.secondary,
                      color: Theme.textInput,
                      textAlign: 'center',
                    }}
                  >
                    {t('groups.notJoinedHint')}
                    {'\n'}
                    {t('groups.joinToStart')}
                  </Text>
                }
              />
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupsList: {
    paddingTop: 12,
    gap: 30,
  },
  groupOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    gap: 16,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: { ...typography.cardTitle, color: '#000', marginBottom: 4 },
  groupDescription: { ...typography.secondary, color: '#666', marginBottom: 4 },
  emptyStateContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyStateText: { ...typography.body, color: '#666', textAlign: 'center' },
});
