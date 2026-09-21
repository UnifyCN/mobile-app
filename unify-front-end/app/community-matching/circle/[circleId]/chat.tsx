import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useCurrentUser } from '@/context/UserContext';
import { Avatar } from '@/components/Avatar';
import {
  getCircleById,
  getCircleMembers,
  getMembershipForCircle,
} from '@/services/matching/circles';
import {
  fetchCircleMessages,
  sendCircleMessage,
} from '@/services/matching/messages';
import type {
  CommunityCircleMemberProfile,
  CommunityMessage,
} from '@/types/matching';
import { CircleMessageBubble } from '@/ui/communityMatching/CircleMessageBubble';
import { FollowButton } from '@/components/profile/FollowButton';
import { formatPersonaLabel, formatTimeInCanadaLabel } from '@/matching/pools';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import BackHeader from '@/components/BackHeader';
import {
  normalizeAvatarSource,
  prefetchAvatarUrls,
} from '@/services/s3/avatarUrlCache';
import { useTranslation } from 'react-i18next';

const GROUP_WINDOW_MS = 3 * 60 * 1000;

type CircleMessageListItem = {
  type: 'message';
  id: string;
  message: CommunityMessage;
  isOwn: boolean;
  isSystem: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  showTimestamp: boolean;
  timestampLabel?: string;
};

type CircleDateSeparatorItem = {
  type: 'date-separator';
  id: string;
  label: string;
};

type CircleChatListItem = CircleMessageListItem | CircleDateSeparatorItem;

const formatMessageTime = (isoDate: string, locale: string): string =>
  new Date(isoDate).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });

const isSameCalendarDay = (first: Date, second: Date): boolean =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const formatDateSeparatorLabel = (
  isoDate: string,
  t: (key: string) => string,
  locale: string
): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(date, now)) {
    return t('circles.today');
  }

  if (isSameCalendarDay(date, yesterday)) {
    return t('circles.yesterday');
  }

  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

export default function CircleChatScreen() {
  const { t, i18n } = useTranslation();
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentUser } = useCurrentUser();
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const flatListRef = useRef<FlatList<CircleChatListItem>>(null);

  // Presence tracking state
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());
  const [typingMembers, setTypingMembers] = useState<Set<string>>(new Set());
  const [selectedMember, setSelectedMember] =
    useState<CommunityCircleMemberProfile | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const memberAvatarSetRef = useRef<Set<string>>(new Set());
  const senderAvatarSetRef = useRef<Set<string>>(new Set());

  const { data: circle } = useQuery({
    queryKey: ['community-circle', circleId],
    queryFn: () => getCircleById(circleId as string),
    enabled: !!circleId,
  });

  const { data: members } = useQuery({
    queryKey: ['community-circle-members', circleId],
    queryFn: () => getCircleMembers(circleId as string),
    enabled: !!circleId,
  });

  const { data: membership } = useQuery({
    queryKey: ['community-circle-membership', circleId],
    queryFn: () => getMembershipForCircle(circleId as string),
    enabled: !!circleId,
  });

  const circleExpired =
    circle?.status === 'ended' ||
    (circle != null && new Date(circle.ends_at) <= new Date());

  const memberLookup = useMemo(() => {
    const map: Record<string, CommunityCircleMemberProfile> = {};
    members?.forEach(member => {
      map[member.user_id] = member;
    });
    return map;
  }, [members]);

  const memberAvatarSet = useMemo(
    () =>
      new Set(
        (members ?? [])
          .map(member => normalizeAvatarSource(member.user.profile_picture_url))
          .filter((value): value is string => !!value)
      ),
    [members]
  );

  useEffect(() => {
    memberAvatarSetRef.current = memberAvatarSet;
  }, [memberAvatarSet]);

  useEffect(() => {
    senderAvatarSetRef.current.clear();
  }, [circleId]);

  useEffect(() => {
    if (!members?.length) {
      return;
    }

    const avatarUrls = members.map(member => member.user.profile_picture_url);

    prefetchAvatarUrls(avatarUrls).catch(error => {
      console.warn('Failed to prefetch member avatar URLs', error);
    });
  }, [members]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const senderAvatarUrls = Array.from(
        new Set(
          messages
            .map(message =>
              normalizeAvatarSource(message.sender?.profile_picture_url)
            )
            .filter(
              (value): value is string =>
                !!value &&
                !memberAvatarSetRef.current.has(value) &&
                !senderAvatarSetRef.current.has(value)
            )
        )
      );

      if (!senderAvatarUrls.length) {
        return;
      }

      prefetchAvatarUrls(senderAvatarUrls)
        .then(() => {
          senderAvatarUrls.forEach(url => senderAvatarSetRef.current.add(url));
        })
        .catch(error => {
          console.warn('Failed to prefetch message avatar URLs', error);
        });
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    const loadMessages = async () => {
      if (!circleId) return;
      try {
        const data = await fetchCircleMessages(circleId as string);
        if (!cancelled) {
          setMessages(data);
        }
      } catch (error) {
        console.error('Failed to load messages', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [circleId]);

  useEffect(() => {
    if (!circleId) return;

    const channel = supabase
      .channel(`community-messages-${circleId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `circle_id=eq.${circleId}`,
        },
        payload => {
          setMessages(prev => {
            const incomingDedupeKey = payload.new.dedupe_key ?? null;
            const incomingMessage: CommunityMessage = {
              id: payload.new.id,
              circle_id: payload.new.circle_id,
              sender_user_id: payload.new.sender_user_id,
              content: payload.new.content,
              message_type: payload.new.message_type ?? 'user',
              metadata: payload.new.metadata ?? null,
              dedupe_key: incomingDedupeKey,
              created_at: payload.new.created_at,
              sender: payload.new.sender_user_id
                ? {
                    id: payload.new.sender_user_id,
                    username:
                      memberLookup[payload.new.sender_user_id]?.user.username ||
                      t('circles.memberFallback'),
                    profile_picture_url:
                      memberLookup[payload.new.sender_user_id]?.user
                        .profile_picture_url || null,
                  }
                : null,
            };
            const existingIndex = prev.findIndex(
              message =>
                message.id === payload.new.id ||
                (Boolean(incomingDedupeKey) &&
                  message.dedupe_key === incomingDedupeKey)
            );

            if (existingIndex >= 0) {
              const nextMessages = [...prev];
              nextMessages[existingIndex] = incomingMessage;
              return nextMessages;
            }

            if (prev.some(message => message.id === payload.new.id)) {
              return prev;
            }

            return [...prev, incomingMessage];
          });
        }
      )
      .subscribe(status => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [circleId, memberLookup]);

  // Presence tracking for online status and typing indicators
  useEffect(() => {
    if (!circleId || !currentUser) return;

    const presenceChannel = supabase
      .channel(`presence-${circleId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const online = new Set<string>();
        const typing = new Set<string>();

        Object.values(state).forEach((users: unknown) => {
          const presenceUsers = users as {
            user_id?: string;
            is_typing?: boolean;
          }[];
          presenceUsers.forEach(user => {
            if (user.user_id && user.user_id !== currentUser.id) {
              online.add(user.user_id);
              if (user.is_typing) {
                typing.add(user.user_id);
              }
            }
          });
        });

        setOnlineMembers(online);
        setTypingMembers(typing);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: currentUser.id,
            username: currentUser.username,
            is_typing: false,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;
    };
  }, [circleId, currentUser]);

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !circleId || circleExpired) {
      return;
    }

    // Clear input immediately for better UX
    setText('');
    setIsSending(true);

    // Optimistically add the message to the list
    const tempId = `temp-${Date.now()}`;
    const dedupeKey = `circle-msg-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const optimisticMessage: CommunityMessage = {
      id: tempId,
      circle_id: circleId as string,
      sender_user_id: currentUser?.id || '',
      content: trimmed,
      message_type: 'user',
      metadata: null,
      dedupe_key: dedupeKey,
      created_at: new Date().toISOString(),
      sender: currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username || 'You',
            profile_picture_url: currentUser.profilePictureUrl || null,
          }
        : null,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const sentMessage = await sendCircleMessage(
        circleId as string,
        trimmed,
        dedupeKey
      );

      if (sentMessage) {
        setMessages(prev =>
          prev.map(message =>
            message.id === tempId
              ? {
                  ...message,
                  id: sentMessage.id,
                  dedupe_key: sentMessage.dedupe_key ?? dedupeKey,
                }
              : message
          )
        );
      }
    } catch (error) {
      console.error('Failed to send message', error);
      // Remove the optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert(t('circles.messageNotSent'), t('common.tryAgain'));
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenCircleInfo = () => {
    if (!circleId) return;
    router.push(`/community-matching/circle/${circleId}` as const);
  };

  const handleMemberPress = (userId: string) => {
    const member = memberLookup[userId];
    if (member && member.user_id !== currentUser?.id) {
      setSelectedMember(member);
    }
  };

  const handleCloseModal = () => {
    setSelectedMember(null);
  };

  const viewFullProfile = () => {
    if (selectedMember) {
      handleCloseModal();
      router.push({
        pathname: '/profile',
        params: { userId: selectedMember.user_id },
      });
    }
  };

  // Handle text input with typing indicator broadcast
  const handleTextChange = (newText: string) => {
    setText(newText);

    // Broadcast typing status
    if (presenceChannelRef.current && currentUser) {
      presenceChannelRef.current.track({
        user_id: currentUser.id,
        username: currentUser.username,
        is_typing: newText.length > 0,
        online_at: new Date().toISOString(),
      });

      // Clear typing indicator after 2 seconds of inactivity
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        if (presenceChannelRef.current && currentUser) {
          presenceChannelRef.current.track({
            user_id: currentUser.id,
            username: currentUser.username,
            is_typing: false,
            online_at: new Date().toISOString(),
          });
        }
      }, 2000);
    }
  };

  // Get typing member names for display
  const typingMemberNames = useMemo(() => {
    return Array.from(typingMembers)
      .map(id => memberLookup[id]?.user?.username)
      .filter(Boolean)
      .slice(0, 2);
  }, [typingMembers, memberLookup]);

  const messageItems = useMemo<CircleChatListItem[]>(() => {
    const canGroupWith = (a?: CommunityMessage, b?: CommunityMessage) => {
      if (!a || !b) return false;
      if (!a.sender_user_id || !b.sender_user_id) return false;
      if (a.sender_user_id !== b.sender_user_id) return false;
      const firstTimestamp = new Date(a.created_at).getTime();
      const secondTimestamp = new Date(b.created_at).getTime();
      return Math.abs(secondTimestamp - firstTimestamp) <= GROUP_WINDOW_MS;
    };

    const items: CircleChatListItem[] = [];

    messages.forEach((message, index) => {
      const isSystem = !message.sender_user_id;
      const isOwn = !isSystem && message.sender_user_id === currentUser?.id;
      const previous = messages[index - 1];
      const next = messages[index + 1];

      const shouldShowDateSeparator =
        index === 0 ||
        !isSameCalendarDay(
          new Date(previous.created_at),
          new Date(message.created_at)
        );

      if (shouldShowDateSeparator) {
        const date = new Date(message.created_at);
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        items.push({
          type: 'date-separator',
          id: `date-${dateKey}-${index}`,
          label: formatDateSeparatorLabel(message.created_at, t, i18n.language),
        });
      }

      const groupedWithPrevious = !isSystem && canGroupWith(previous, message);
      const groupedWithNext = !isSystem && canGroupWith(message, next);
      const isGroupStart = isSystem || !groupedWithPrevious;
      const isGroupEnd = isSystem || !groupedWithNext;
      const showAvatar = !isSystem && !isOwn && isGroupStart;
      const showSenderName = showAvatar;
      const showTimestamp = !isSystem && isGroupEnd;

      items.push({
        type: 'message',
        id: message.id,
        message,
        isOwn,
        isSystem,
        showAvatar,
        showSenderName,
        isGroupStart,
        isGroupEnd,
        showTimestamp,
        timestampLabel: showTimestamp
          ? formatMessageTime(message.created_at, i18n.language)
          : undefined,
      });
    });

    return items;
  }, [currentUser?.id, messages, t, i18n.language]);

  const inputDisabled = circleExpired || membership?.left_at !== null;

  return (
    <View style={styles.root}>
      <View style={styles.contentWrapper}>
        <BackHeader
          title=''
          onBack={() => router.back()}
          rightButton={
            <TouchableOpacity
              onPress={handleOpenCircleInfo}
              style={styles.headerIcon}
            >
              <Feather name='info' size={22} color='#6B7280' />
            </TouchableOpacity>
          }
        />

        {/* Online members presence bar - Make clickable */}
        {onlineMembers.size > 0 && (
          <View style={styles.presenceBar}>
            <View style={styles.presenceAvatars}>
              {members
                ?.filter(m => onlineMembers.has(m.user_id))
                .slice(0, 4)
                .map(member => (
                  <TouchableOpacity
                    key={member.user_id}
                    style={styles.presenceAvatar}
                    onPress={() => handleMemberPress(member.user_id)}
                  >
                    <Avatar
                      profilePictureUrl={
                        member.user.profile_picture_url ?? undefined
                      }
                      username={member.user.username || '?'}
                      size={28}
                      style={styles.presenceAvatarImg}
                      fallbackStyle={styles.presenceAvatarFallback}
                      textStyle={styles.presenceAvatarText}
                    />
                    <View style={styles.onlineDot} />
                  </TouchableOpacity>
                ))}
            </View>
            <Text style={styles.presenceText}>{t('circles.online', { count: onlineMembers.size })}</Text>
          </View>
        )}

        {circleExpired && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {t('circles.circleEndedReadOnly')}
            </Text>
          </View>
        )}
        {membership?.left_at && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {t('circles.youLeftReadOnly')}
            </Text>
          </View>
        )}
        {isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator size='large' />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messageItems}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              if (item.type === 'date-separator') {
                return (
                  <View style={styles.dateSeparatorRow}>
                    <Text style={styles.dateSeparatorText}>{item.label}</Text>
                  </View>
                );
              }

              return (
                <CircleMessageBubble
                  message={item.message}
                  isOwn={item.isOwn}
                  showAvatar={item.showAvatar}
                  showSenderName={item.showSenderName}
                  isGroupStart={item.isGroupStart}
                  isGroupEnd={item.isGroupEnd}
                  showTimestamp={item.showTimestamp}
                  timestampLabel={item.timestampLabel}
                  onPressSender={handleMemberPress}
                />
              );
            }}
            keyboardShouldPersistTaps='handled'
            keyboardDismissMode='interactive'
            contentContainerStyle={styles.messagesList}
          />
        )}
      </View>

      <KeyboardStickyView style={styles.stickyContainer}>
        {/* Typing indicator */}
        {typingMemberNames.length > 0 && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>
              {typingMemberNames.length > 1
                ? t('circles.typingMultiple', {
                    names: typingMemberNames.join(', '),
                  })
                : t('circles.typingOne', { name: typingMemberNames[0] })}
            </Text>
          </View>
        )}

        <View
          style={[
            styles.inputSafeArea,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.inputContainer}>
            <View
              style={[
                styles.inputWrapper,
                isInputFocused && styles.inputWrapperFocused,
              ]}
            >
              <TextInput
                style={[styles.input, inputDisabled && styles.inputDisabled]}
                placeholder={t('circles.messagePlaceholder')}
                placeholderTextColor='#98A2B3'
                value={text}
                onChangeText={handleTextChange}
                editable={!inputDisabled}
                multiline
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!text.trim() || inputDisabled) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!text.trim() || isSending || inputDisabled}
              >
                {isSending ? (
                  <ActivityIndicator color='#fff' size='small' />
                ) : (
                  <Feather name='arrow-up' size={20} color='#fff' />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardStickyView>

      {/* Member Identity Modal */}
      {selectedMember && (
        <Modal
          animationType='fade'
          transparent={true}
          visible={!!selectedMember}
          onRequestClose={handleCloseModal}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={handleCloseModal}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={e => e.stopPropagation()}
              style={styles.modalContent}
            >
              <View style={styles.modalHeader}>
                <Avatar
                  profilePictureUrl={
                    selectedMember.user.profile_picture_url ?? undefined
                  }
                  username={selectedMember.user.username || '?'}
                  size={64}
                  style={styles.modalAvatar}
                  fallbackStyle={styles.modalAvatarFallback}
                  textStyle={styles.modalAvatarText}
                />
                <View style={styles.modalUserInfo}>
                  <Text style={styles.modalUsername}>
                    {selectedMember.user.username}
                  </Text>
                  <Text style={styles.modalRole}>
                    {formatPersonaLabel(t, circle?.persona)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCloseModal}
                  style={styles.modalCloseBtn}
                >
                  <Feather name='x' size={20} color='#9CA3AF' />
                </TouchableOpacity>
              </View>

              <View style={styles.commonGroundSection}>
                <Text style={styles.commonGroundTitle}>{t('circles.sharedJourney')}</Text>
                <View style={styles.commonGroundItem}>
                  <Feather name='map-pin' size={16} color='#ff820b' />
                  <Text style={styles.commonGroundText}>
                    {t('circles.bothArrived')}{' '}
                    <Text style={styles.highlight}>
                      {formatTimeInCanadaLabel(t, circle?.time_in_canada)}
                    </Text>
                  </Text>
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.viewProfileBtn}
                  onPress={viewFullProfile}
                >
                  <Text style={styles.viewProfileText}>{t('circles.viewProfile')}</Text>
                </TouchableOpacity>
                <View style={styles.modalFollowBtn}>
                  <FollowButton targetUserId={selectedMember.user_id} />
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentWrapper: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E6E6',
  },
  backText: {
    color: '#6E6E6E',
  },
  headerTitle: {
    fontWeight: '600',
    color: '#1F1300',
  },
  leaveText: {
    color: '#E74C3C',
    fontWeight: '600',
  },
  banner: {
    padding: 12,
    backgroundColor: '#FFF4E4',
    alignItems: 'center',
  },
  bannerText: {
    color: '#7C4A00',
    fontSize: 14,
    lineHeight: 18,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  dateSeparatorRow: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: '#98A2B3',
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  inputContainer: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 2,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF2F6',
  },
  inputSafeArea: {
    backgroundColor: '#fff',
  },
  stickyContainer: {
    backgroundColor: '#fff',
    width: '100%',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F5F7FA',
    borderRadius: 22,
    paddingVertical: 5,
    paddingLeft: 13,
    paddingRight: 6,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E8EDF3',
  },
  inputWrapperFocused: {
    borderColor: '#FBC184',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 112,
    paddingHorizontal: 0,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 16,
    lineHeight: 20,
    color: '#1F2937',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ff9b3d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#CDD6E2',
  },
  headerIcon: {
    padding: 4,
  },
  // Presence bar styles
  presenceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  presenceAvatars: {
    flexDirection: 'row',
    marginRight: 8,
  },
  presenceAvatar: {
    position: 'relative',
    marginRight: -6,
  },
  presenceAvatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
  },
  presenceAvatarFallback: {
    backgroundColor: '#ff9d40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#fff',
  },
  presenceText: {
    marginLeft: 8,
    fontSize: 13,
    lineHeight: 17,
    color: '#64748B',
  },
  // Typing indicator styles
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
  },
  typingText: {
    fontSize: 13,
    lineHeight: 17,
    color: '#64748B',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  modalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E5E7EB',
  },
  modalAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE0CC',
  },
  modalAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#9A3412',
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUsername: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalRole: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  commonGroundSection: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  commonGroundTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  commonGroundItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commonGroundText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 20,
    flex: 1,
  },
  highlight: {
    fontWeight: '600',
    color: '#1F2937',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewProfileBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  viewProfileText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  modalFollowBtn: {
    flex: 1,
  },
});
