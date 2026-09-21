import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Search } from 'lucide-react-native';
import UnifyLogo from '@/components/icons/UnifyLogo.svg';
import { Avatar } from '@/components/Avatar';
import ProfileModal from '@/components/home/ProfileModal';
import { useUnreadNotificationCount } from '@/hooks/useCommunityNotifications';
import { useCurrentUser } from '@/context/UserContext';
import { TAB_HEADER_METRICS, getTabHeaderHeight } from '@/constants/TabHeader';
import { formatNumber } from '@/utils/formatNumber';

interface TabHeaderProps {
  variant?: 'full' | 'minimal';
  title?: string;
}

const TabHeader = ({ variant = 'full', title }: TabHeaderProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = getTabHeaderHeight(insets.top);
  const unreadCount = useUnreadNotificationCount();
  const { currentUser } = useCurrentUser();
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  return (
    <>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            height: headerHeight,
          },
        ]}
      >
        <UnifyLogo
          width={TAB_HEADER_METRICS.logoSize}
          height={TAB_HEADER_METRICS.logoSize}
        />

        {variant === 'full' && (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.searchBar,
                pressed && styles.searchBarPressed,
              ]}
              onPress={() => router.push('/search' as any)}
              accessibilityRole='button'
              accessibilityLabel={t('common.openSearch')}
            >
              <Search color='#999' size={18} strokeWidth={2.5} />
              <Text style={styles.searchPlaceholder}>{t('common.search')}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.bellButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={() => router.push('/notifications' as Href)}
              accessibilityRole='button'
              accessibilityLabel={t('common.openNotifications')}
            >
              <View style={styles.bellWrap}>
                <Bell
                  color='#000'
                  size={TAB_HEADER_METRICS.iconSize}
                  strokeWidth={TAB_HEADER_METRICS.iconStrokeWidth}
                  absoluteStrokeWidth
                />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 9
                        ? `${formatNumber(9)}+`
                        : formatNumber(unreadCount)}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          </>
        )}

        {variant === 'minimal' && (
          <View style={styles.spacer}>
            {title && <Text style={styles.headerTitle}>{title}</Text>}
          </View>
        )}

        <Pressable
          onPress={() => setProfileModalVisible(true)}
          style={({ pressed }) => [
            variant === 'full' && styles.avatarButton,
            pressed && styles.actionButtonPressed,
          ]}
          accessibilityRole='button'
          accessibilityLabel={t('common.openProfileMenu')}
        >
          <Avatar
            profilePictureUrl={currentUser?.profilePictureUrl}
            username={currentUser?.username ?? '?'}
            size={32}
            showFallbackWhileLoading
          />
        </Pressable>
      </View>

      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TAB_HEADER_METRICS.horizontalPadding,
    backgroundColor: '#fff',
  },
  spacer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    height: 36,
    paddingHorizontal: 12,
    marginLeft: 10,
    gap: 8,
  },
  searchBarPressed: {
    opacity: 0.7,
  },
  searchPlaceholder: {
    fontSize: 15,
    color: '#999',
  },
  bellButton: {
    marginLeft: 10,
    paddingVertical: 6,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  avatarButton: {
    marginLeft: 10,
  },
  bellWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#FF7A18',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default TabHeader;
