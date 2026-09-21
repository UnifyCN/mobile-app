import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Search, Settings } from 'lucide-react-native';
import UnifyLogo from '@/components/icons/UnifyLogo.svg';
import { useUnreadNotificationCount } from '@/hooks/useCommunityNotifications';
import { TAB_HEADER_METRICS, getTabHeaderHeight } from '@/constants/TabHeader';
import { formatNumber } from '@/utils/formatNumber';

interface HeaderProps {
  showSearchIcon?: boolean;
}

interface ActionButtonProps {
  accessibilityLabel: string;
  icon: React.ComponentType<{
    color?: string;
    size?: number;
    strokeWidth?: number;
    absoluteStrokeWidth?: boolean;
  }>;
  onPress: () => void;
  showBadge?: boolean;
  badgeValue?: number;
  isFirst?: boolean;
}

const ActionButton = ({
  accessibilityLabel,
  icon: Icon,
  onPress,
  showBadge = false,
  badgeValue = 0,
  isFirst = false,
}: ActionButtonProps) => {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        !isFirst && styles.actionButtonOverlap,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <View style={styles.actionIconWrap}>
        <Icon
          color='#000'
          size={TAB_HEADER_METRICS.iconSize}
          strokeWidth={TAB_HEADER_METRICS.iconStrokeWidth}
          absoluteStrokeWidth
        />
        {showBadge && badgeValue > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badgeValue > 9
                ? `${formatNumber(9)}+`
                : formatNumber(badgeValue)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

const Header = ({ showSearchIcon = true }: HeaderProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = getTabHeaderHeight(insets.top);
  const unreadCount = useUnreadNotificationCount();

  return (
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
      <View style={styles.rightButtons}>
        {showSearchIcon && (
          <ActionButton
            accessibilityLabel={t('common.openSearch')}
            icon={Search}
            isFirst
            onPress={() => router.push('/search' as any)}
          />
        )}
        <ActionButton
          accessibilityLabel={t('common.openNotifications')}
          icon={Bell}
          onPress={() => router.push('/notifications' as Href)}
          showBadge
          badgeValue={unreadCount}
        />
        <ActionButton
          accessibilityLabel={t('common.openSettings')}
          icon={Settings}
          onPress={() => router.push('/account-settings')}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: TAB_HEADER_METRICS.horizontalPadding,
    backgroundColor: '#fff',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TAB_HEADER_METRICS.actionGap,
  },
  actionButton: {
    width: TAB_HEADER_METRICS.actionSize,
    height: TAB_HEADER_METRICS.actionSize,
    borderRadius: TAB_HEADER_METRICS.actionSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonOverlap: {
    marginLeft: TAB_HEADER_METRICS.actionOverlap,
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionIconWrap: {
    position: 'relative',
    width: TAB_HEADER_METRICS.actionSize,
    height: TAB_HEADER_METRICS.actionSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: TAB_HEADER_METRICS.badgeTop,
    right: TAB_HEADER_METRICS.badgeRight,
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

export default Header;
