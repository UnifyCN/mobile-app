import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CommunityMessage } from '@/types/matching';
import { Avatar } from '@/components/Avatar';

const AVATAR_SIZE = 36;

interface CircleMessageBubbleProps {
  message: CommunityMessage;
  isOwn: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  showTimestamp: boolean;
  timestampLabel?: string;
  onPressSender?: (userId: string) => void;
}

export function CircleMessageBubble({
  message,
  isOwn,
  showAvatar,
  showSenderName,
  isGroupStart,
  isGroupEnd,
  showTimestamp,
  timestampLabel,
  onPressSender,
}: CircleMessageBubbleProps) {
  const { t } = useTranslation();

  if (!message.sender_user_id) {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  const handlePressSender = () => {
    if (onPressSender && message.sender_user_id) {
      onPressSender(message.sender_user_id);
    }
  };

  return (
    <View
      style={[
        styles.row,
        isOwn ? styles.rowOwn : styles.rowOther,
        isGroupStart ? styles.rowStart : styles.rowContinue,
        isGroupEnd && styles.rowEnd,
      ]}
    >
      {!isOwn &&
        (showAvatar ? (
          <TouchableOpacity
            onPress={handlePressSender}
            activeOpacity={0.8}
            style={styles.avatarContainer}
          >
            <Avatar
              profilePictureUrl={
                message.sender?.profile_picture_url ?? undefined
              }
              username={message.sender?.username || '?'}
              size={AVATAR_SIZE}
              style={styles.avatar}
              fallbackStyle={styles.avatarFallback}
              textStyle={styles.avatarText}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.avatarSpacer} />
        ))}

      <View style={[styles.messageColumn, isOwn && styles.messageColumnOwn]}>
        {!isOwn && showSenderName && (
          <TouchableOpacity onPress={handlePressSender}>
            <Text style={styles.senderName}>
              {message.sender?.username || t('circles.memberFallback')}
            </Text>
          </TouchableOpacity>
        )}

        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            isOwn
              ? isGroupStart
                ? styles.ownStart
                : styles.ownContinue
              : isGroupStart
                ? styles.otherStart
                : styles.otherContinue,
            isOwn
              ? isGroupEnd
                ? styles.ownEnd
                : styles.ownMiddle
              : isGroupEnd
                ? styles.otherEnd
                : styles.otherMiddle,
          ]}
        >
          <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
            {message.content}
          </Text>
        </View>

        {showTimestamp && !!timestampLabel && (
          <Text
            style={[
              styles.timestamp,
              isOwn ? styles.timestampOwn : styles.timestampOther,
            ]}
          >
            {timestampLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
  },
  rowOwn: {
    alignItems: 'flex-end',
  },
  rowOther: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  rowStart: {
    marginTop: 8,
  },
  rowContinue: {
    marginTop: 2,
  },
  rowEnd: {
    marginBottom: 6,
  },
  avatarContainer: {
    marginTop: 4,
    width: AVATAR_SIZE,
    alignItems: 'center',
  },
  avatarSpacer: {
    width: AVATAR_SIZE,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE0CC',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9A3412',
  },
  messageColumn: {
    maxWidth: '80%',
  },
  messageColumnOwn: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '100%',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  bubbleOwn: {
    backgroundColor: '#ff9d40',
  },
  bubbleOther: {
    backgroundColor: '#F3F4F6',
  },
  ownStart: {
    borderTopRightRadius: 18,
  },
  ownContinue: {
    borderTopRightRadius: 9,
  },
  ownMiddle: {
    borderBottomRightRadius: 9,
  },
  ownEnd: {
    borderBottomRightRadius: 6,
  },
  otherStart: {
    borderTopLeftRadius: 18,
  },
  otherContinue: {
    borderTopLeftRadius: 9,
  },
  otherMiddle: {
    borderBottomLeftRadius: 9,
  },
  otherEnd: {
    borderBottomLeftRadius: 6,
  },
  messageText: {
    color: '#1F2937',
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextOwn: {
    color: '#fff',
  },
  senderName: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 15,
    marginBottom: 4,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
    color: '#98A2B3',
    lineHeight: 14,
    marginTop: 4,
  },
  timestampOwn: {
    textAlign: 'right',
    marginRight: 4,
  },
  timestampOther: {
    textAlign: 'left',
    marginLeft: 4,
  },
  systemRow: {
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 24,
  },
  systemBubble: {
    maxWidth: '92%',
    backgroundColor: '#FFF8F1',
    borderWidth: 1,
    borderColor: '#FEE9D1',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 16,
  },
  systemText: {
    color: '#D97706',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
