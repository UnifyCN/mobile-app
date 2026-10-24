import { typography } from '@/constants/Typography';
import { memo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Group } from '@/types/groups';
import { Avatar } from '@/components/Avatar';
import { Theme } from '@/constants/Theme';

interface GroupCardProps {
  group: Group;
  onPress?: () => void;
}

const GroupCard = memo(({ group, onPress }: GroupCardProps) => {
  return (
    <TouchableOpacity style={[styles.groupCard]} onPress={onPress}>
      <View style={styles.imageContainer}>
        <Avatar
          profilePictureUrl={group.coverPhotoUrl || undefined}
          username={group.name}
          size={57}
        />
      </View>
      <View style={styles.groupContent}>
        <Text style={styles.groupTitle} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.groupDetailText} numberOfLines={2}>
          {group.description ?? ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  groupCard: {
    backgroundColor: Theme.white,
    borderColor: Theme.borderCard,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    width: '100%',
    minHeight: 82,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  imageContainer: {
    height: 57,
    width: 57,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  groupContent: {
    flex: 1,
    justifyContent: 'center',
  },
  groupTitle: {
    ...typography.cardTitle,
    color: Theme.black,
    fontWeight: '600',
  },
  groupDetailText: {
    ...typography.secondary,
    marginTop: 2,
    color: Theme.black,
    flex: 1,
    fontWeight: '400',
  },
});

export default GroupCard;
