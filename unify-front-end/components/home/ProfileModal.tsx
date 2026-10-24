import { typography } from '@/constants/Typography';
import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import BottomSheet from '@/components/common/BottomSheet';
import { useCurrentUser } from '@/context/UserContext';
import { useUserInfo } from '@/hooks/users/useUserInfo';
import { Theme } from '@/constants/Theme';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

interface MenuRowProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  isLast?: boolean;
}

const MenuRow = ({ icon, label, onPress, isLast = false }: MenuRowProps) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.menuRow,
      !isLast && styles.menuRowBorder,
      pressed && styles.menuRowPressed,
    ]}
    accessibilityRole='button'
    accessibilityLabel={label}
  >
    <View style={styles.menuRowLeft}>
      <Feather name={icon} size={20} color='#333' />
      <Text style={styles.menuRowLabel}>{label}</Text>
    </View>
    <Feather name='chevron-right' size={20} color='#999' />
  </Pressable>
);

export default function ProfileModal({ visible, onClose }: ProfileModalProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const { data: userInfo } = useUserInfo(currentUser?.id);

  const followerCount = userInfo?.followerCount ?? 0;
  const followingCount = userInfo?.followingCount ?? 0;

  const navigate = useCallback(
    (path: string) => {
      onClose();
      setTimeout(() => {
        router.push(path as any);
      }, 150);
    },
    [onClose, router]
  );

  const handleFeedback = useCallback(() => {
    onClose();
    Linking.openURL('https://unify.userjot.com').catch(err =>
      console.error('Failed to open URL:', err)
    );
  }, [onClose]);

  if (!currentUser) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.55}>
      <View style={styles.profileSection}>
        <Avatar
          profilePictureUrl={currentUser.profilePictureUrl}
          username={currentUser.username}
          size={72}
        />
        {currentUser.firstName ? (
          <>
            <Text style={styles.displayName}>{currentUser.firstName}</Text>
            <Text style={styles.handle}>@{currentUser.username}</Text>
          </>
        ) : (
          <Text style={styles.username}>@{currentUser.username}</Text>
        )}
        <Text style={styles.counts}>
          {followerCount} {t('common.followers')}
          {'  '}·{'  '}
          {followingCount} {t('common.following')}
        </Text>
      </View>

      <View style={styles.menuSection}>
        <MenuRow
          icon='user'
          label={t('profile.title')}
          onPress={() => navigate(`/profile?userId=${currentUser.id}`)}
        />
        <MenuRow
          icon='bookmark'
          label={t('profile.saved')}
          onPress={() => navigate('/saved')}
        />
        <MenuRow
          icon='book'
          label={t('profile.savedFromLearn')}
          onPress={() => navigate('/saved-lessons')}
        />
        <MenuRow
          icon='message-circle'
          label={t('profile.giveFeedback')}
          onPress={handleFeedback}
        />
        <MenuRow
          icon='settings'
          label={t('profile.settings')}
          onPress={() => navigate('/account-settings')}
          isLast
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  profileSection: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  username: { ...typography.cardTitle, color: Theme.black, marginTop: 12 },
  displayName: { ...typography.cardTitle, color: Theme.black, marginTop: 12 },
  handle: { ...typography.secondary, color: '#666', marginTop: 2 },
  counts: { ...typography.secondary, color: '#666', marginTop: 4 },
  menuSection: {
    paddingTop: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 4,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuRowPressed: {
    opacity: 0.6,
  },
  menuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuRowLabel: { ...typography.label, color: '#1a1a1a' },
});
