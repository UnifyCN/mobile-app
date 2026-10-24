import { typography } from '@/constants/Typography';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { FollowButton } from '@/components/profile/FollowButton';
import { router } from 'expo-router';
import { Theme } from '@/constants/Theme';
import type { GroupMember } from '@/services/groups/getGroupMembers';

export default function GroupMemberRow({
  member,
  highlight = false,
}: {
  member: GroupMember;
  highlight?: boolean;
}) {
  const { t } = useTranslation();

  const relationshipLabel =
    member.isFollowing && member.followsYou
      ? t('groups.mutuals')
      : member.followsYou
        ? t('groups.followsYou')
        : null;

  return (
    <View style={[styles.row, highlight && styles.highlightRow]}>
      <TouchableOpacity
        style={styles.left}
        onPress={() =>
          router.push({
            pathname: '/profile',
            params: { userId: member.id },
          })
        }
      >
        <Avatar
          profilePictureUrl={member.profilePictureUrl || undefined}
          username={member.username}
          size={42}
        />
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{member.username}</Text>
          {highlight && relationshipLabel && (
            <Text style={styles.relationship}>{relationshipLabel}</Text>
          )}
        </View>
      </TouchableOpacity>

      {!member.isFollowing && (
        <FollowButton targetUserId={member.id} compact source='community' />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  highlightRow: {
    backgroundColor: '#FFF8F0',
    marginHorizontal: -4,
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  nameBlock: {
    flexShrink: 1,
  },
  name: { ...typography.body, color: Theme.black },
  relationship: {
    ...typography.caption,
    color: Theme.primaryGatherRed,
    marginTop: 1,
    fontWeight: '500',
  },
});
