import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useCommunityNotifications } from '@/hooks/useCommunityNotifications';
import type { CommunityNotification } from '@/types/matching';
import BackHeader from '@/components/BackHeader';
import { Theme } from '@/constants/Theme';
import LoadingScreen from '@/components/LoadingScreen';
import { useAnalytics } from '@/utils/analytics';
import { formatRelativeTime } from '@/helpers/dateHelpers';
import { getNotificationText } from '@/utils/notificationText';

function getNotificationIcon(type: CommunityNotification['type']): string {
  switch (type) {
    case 'circle_matched':
      return 'users';
    case 'circle_ending_soon':
      return 'clock';
    case 'circle_ended':
      return 'check-circle';
    case 'followed':
      return 'user-plus';
    case 'liked':
      return 'heart';
    case 'commented':
    case 'comment_reply':
      return 'message-circle';
    case 'comment_liked':
      return 'heart';
    case 'invite_redeemed':
      return 'user-check';
    default:
      return 'bell';
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    trackScreen,
    trackNotificationOpened,
    trackNotificationsMarkAllRead,
  } = useAnalytics();
  const {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead: originalMarkAllAsRead,
    unreadCount,
    isMarkingAllAsRead,
  } = useCommunityNotifications();

  useFocusEffect(
    useCallback(() => {
      trackScreen('Notifications');
    }, [trackScreen])
  );

  const markAllAsRead = useCallback(() => {
    trackNotificationsMarkAllRead(unreadCount);
    originalMarkAllAsRead();
  }, [unreadCount, originalMarkAllAsRead, trackNotificationsMarkAllRead]);

  const handleNotificationPress = useCallback(
    (notification: CommunityNotification) => {
      trackNotificationOpened(notification.type);
      if (!notification.read_at) {
        markAsRead(notification.id);
      }

      const data = notification.data;

      // Followed → go to actor's profile
      if (notification.type === 'followed' && data?.actor_user_id) {
        router.push(`/profile?userId=${data.actor_user_id}` as Href);
        return;
      }

      // Liked or commented → go to post
      if (
        (notification.type === 'liked' || notification.type === 'commented') &&
        data?.post_id != null
      ) {
        router.push({
          pathname: '/post-details',
          params: { postId: String(data.post_id) },
        } as Href);
        return;
      }

      // Circle → go to circle
      if (data?.circle_id) {
        router.push(`/community-matching/circle/${data.circle_id}` as Href);
      }
    },
    [markAsRead, router, trackNotificationOpened]
  );

  const renderNotification = ({ item }: { item: CommunityNotification }) => {
    const isUnread = !item.read_at;
    const iconName = getNotificationIcon(item.type);
    // Rows store English copy; `data.i18n` (when present) re-renders them in
    // the reader's current language.
    const { title, body } = getNotificationText(item, t);

    return (
      <TouchableOpacity
        style={[styles.notificationItem, isUnread && styles.notificationUnread]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View
          style={[styles.iconContainer, isUnread && styles.iconContainerUnread]}
        >
          <Feather
            name={iconName as any}
            size={22}
            color={isUnread ? Theme.primaryGatherRed : '#6E6E6E'}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, isUnread && styles.titleUnread]}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text style={styles.timestamp}>
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
          <Text
            style={[styles.body, isUnread && styles.bodyUnread]}
            numberOfLines={2}
          >
            {body}
          </Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyState}>
        <View style={styles.emptyIconCircle}>
          <Feather name='bell-off' size={40} color='#D0D0D0' />
        </View>
        <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
        <Text style={styles.emptyBody}>
          {t('notifications.emptyHint')}
        </Text>
      </View>
    </View>
  );

  const MarkAllButton = () =>
    unreadCount > 0 ? (
      <TouchableOpacity
        onPress={markAllAsRead}
        disabled={isMarkingAllAsRead}
        style={styles.markAllButton}
      >
        {isMarkingAllAsRead ? (
          <ActivityIndicator size='small' color={Theme.primaryGatherRed} />
        ) : (
          <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
        )}
      </TouchableOpacity>
    ) : null;

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.root}>
      <BackHeader
        title=''
        onBack={() => router.back()}
        rightButton={<MarkAllButton />}
      />

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderNotification}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={
          notifications.length === 0
            ? styles.emptyListContent
            : styles.listContent
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  markAllText: {
    color: Theme.primaryGatherRed,
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 150,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#fff',
  },
  notificationUnread: {
    backgroundColor: '#FFF9F5',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconContainerUnread: {
    backgroundColor: '#FFF0E6',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1F1300',
    marginRight: 8,
  },
  titleUnread: {
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    color: '#6E6E6E',
    lineHeight: 20,
  },
  bodyUnread: {
    color: '#333333',
  },
  timestamp: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.primaryGatherRed,
    marginLeft: 8,
    alignSelf: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 72,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F9F9F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F1300',
  },
  emptyBody: {
    fontSize: 15,
    color: '#6E6E6E',
    textAlign: 'center',
    lineHeight: 22,
  },
});
