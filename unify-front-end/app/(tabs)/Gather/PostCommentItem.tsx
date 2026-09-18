import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Like from '@/assets/images/Like.svg';
import Like_Fill from '@/assets/images/Like_filled.svg';
import { formatSmartTime } from '@/utils/dateUtils';
import { useMutateLikeComment } from '@/hooks/posts/useMutateLikeComment';
import { useMutateDeleteComment } from '@/hooks/posts/useMutateDeleteComment';
import { memo, useCallback, useState } from 'react';
import { PostCommentData } from '@/types/feeds/postcomment';
import { Avatar } from '@/components/Avatar';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { Theme } from '@/constants/Theme';
import { useCurrentUser } from '@/context/UserContext';
import { Permissions } from '@/types/permissions';
import { TranslateButton } from '@/components/home/TranslateButton';

interface PostCommentItemProps {
  comment: PostCommentData;
  metadata?: {
    isLiked: boolean;
    likeCount: number;
  };
  metadataLoading?: boolean;
  postAuthorId?: string; // ID of the user who created the parent post

  // Reply-thread props (only set when this comment renders as a top-level
  // comment with a reply group). When `isReply` is true, these stay undefined
  // because we never nest a second level — that's what enforces two-level
  // flat threading at the type level.
  replies?: PostCommentData[];
  repliesMetadata?: Record<number, { isLiked: boolean; likeCount: number }>;
  commentById?: Map<number, PostCommentData>;

  // Direct-target metadata for the @mention prefix on a reply. Set only when
  // `isReply` is true.
  parentAuthorUsername?: string;
  parentAuthorUserId?: string;

  onReply?: (comment: PostCommentData) => void;
  isReply?: boolean;
}

const PostCommentItem = memo(
  ({
    comment,
    metadata,
    metadataLoading,
    postAuthorId,
    replies,
    repliesMetadata,
    commentById,
    parentAuthorUsername,
    parentAuthorUserId,
    onReply,
    isReply = false,
  }: PostCommentItemProps) => {
    const { t } = useTranslation();
    const { currentUser } = useCurrentUser();
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [repliesExpanded, setRepliesExpanded] = useState(false);

    // Hook for liking and unliking comments
    const likeCommentMutation = useMutateLikeComment();
    const deleteCommentMutation = useMutateDeleteComment();

    const isAdmin = currentUser?.permissions === Permissions.ADMIN;
    const isPartner = currentUser?.permissions === Permissions.PARTNER;
    const ownsPost = postAuthorId && currentUser?.id === postAuthorId;
    const ownsComment = currentUser?.id === comment.user_id;
    const canDelete = isAdmin || (isPartner && ownsPost) || ownsComment;

    const toggleLike = useCallback(
      (commentId: number, isLiked: boolean) => {
        likeCommentMutation.mutate({ commentId, isLiked });
      },
      [likeCommentMutation]
    );

    const navigateToUserProfile = useCallback(() => {
      router.push(`/profile?userId=${comment.user_id}`);
    }, [comment.user_id]);

    const handleDeleteComment = useCallback(() => {
      Alert.alert(
        t('home.deleteComment'),
        t('home.deleteCommentConfirm'),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
            onPress: () => setDeleteModalVisible(false),
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              deleteCommentMutation.mutate(
                { commentId: comment.id, postId: comment.post_id },
                {
                  onSuccess: () => {
                    setDeleteModalVisible(false);
                  },
                  onError: error => {
                    Alert.alert(
                      t('common.error'),
                      error.message || t('home.failedDeleteComment')
                    );
                  },
                }
              );
            },
          },
        ]
      );
    }, [comment.id, comment.post_id, deleteCommentMutation, t]);

    // Use batch-loaded metadata
    const likeCount = metadata?.likeCount ?? 0;
    const isLiked = metadata?.isLiked;

    const replyCount = replies?.length ?? 0;
    const replyToggleLabel = repliesExpanded
      ? t('home.hideReplies')
      : t('home.viewReplies', { count: replyCount });

    const avatarSize = isReply ? 32 : 40;

    return (
      <View>
        <View
          style={[styles.postContainer, isReply && styles.postContainerReply]}
        >
          {/* Headshot */}
          <TouchableOpacity
            style={[
              styles.headshot,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              },
            ]}
            onPress={navigateToUserProfile}
          >
            <Avatar
              profilePictureUrl={comment.profilePictureUrl}
              username={comment.username}
              size={avatarSize}
            />
          </TouchableOpacity>

          <View style={styles.postContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <TouchableOpacity onPress={navigateToUserProfile}>
                  <Text style={styles.name}>{comment.username}</Text>
                </TouchableOpacity>
                <Text style={styles.time}>
                  {formatSmartTime(comment.created_at)}
                </Text>
              </View>
              {canDelete && (
                <TouchableOpacity
                  onPress={() => setDeleteModalVisible(true)}
                  style={styles.menuButton}
                >
                  <Feather name='more-vertical' size={20} color={Theme.black} />
                </TouchableOpacity>
              )}
            </View>

            {/* Description */}
            <Text style={styles.description}>
              {isReply &&
                parentAuthorUsername &&
                parentAuthorUserId &&
                parentAuthorUserId !== currentUser?.id && (
                  <Text
                    style={styles.mention}
                    onPress={() =>
                      router.push(`/profile?userId=${parentAuthorUserId}`)
                    }
                  >
                    @{parentAuthorUsername}{' '}
                  </Text>
                )}
              {comment.content}
            </Text>
            <TranslateButton type='comment' id={comment.id} />

            {/* Footer */}
            <View style={styles.footer}>
              <View style={styles.footerItem}>
                <TouchableOpacity
                  onPress={() => {
                    if (isLiked !== undefined && !metadataLoading) {
                      toggleLike(comment.id, isLiked);
                    }
                  }}
                  disabled={metadataLoading}
                >
                  {isLiked ? (
                    <Like_Fill width={20} height={20} />
                  ) : (
                    <Like width={20} height={20} />
                  )}
                </TouchableOpacity>
                {metadataLoading ? (
                  <SkeletonLoader width={24} height={20} />
                ) : (
                  <Text style={styles.footerText}>{likeCount}</Text>
                )}
              </View>
              {!isReply && onReply && (
                <TouchableOpacity
                  onPress={() => onReply(comment)}
                  style={styles.replyButton}
                  hitSlop={6}
                >
                  <Text style={styles.replyButtonText}>{t('home.reply')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {!isReply && replyCount > 0 && (
              <TouchableOpacity
                onPress={() => setRepliesExpanded(prev => !prev)}
                style={styles.repliesToggle}
                hitSlop={6}
              >
                <Text style={styles.repliesToggleText}>{replyToggleLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!isReply && replyCount > 0 && repliesExpanded && (
          <View style={styles.repliesContainer}>
            <View style={styles.connectorLine} />
            {replies!.map(reply => {
              const directParent =
                reply.parent_comment_id != null
                  ? commentById?.get(reply.parent_comment_id)
                  : undefined;
              return (
                <PostCommentItem
                  key={reply.id}
                  comment={reply}
                  metadata={repliesMetadata?.[reply.id]}
                  metadataLoading={metadataLoading}
                  postAuthorId={postAuthorId}
                  commentById={commentById}
                  parentAuthorUsername={directParent?.username}
                  parentAuthorUserId={directParent?.user_id}
                  onReply={onReply}
                  isReply
                />
              );
            })}
          </View>
        )}

        {!isReply && <View style={styles.divider} />}

        {/* Delete Modal */}
        <Modal
          animationType='fade'
          transparent={true}
          visible={deleteModalVisible}
          onRequestClose={() => setDeleteModalVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setDeleteModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <Pressable
                style={styles.modalContent}
                onPress={e => e.stopPropagation()}
              >
                <View style={styles.dragHandle} />
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={handleDeleteComment}
                >
                  <Feather
                    name='trash-2'
                    size={20}
                    color='#FF3B30'
                    style={styles.optionIcon}
                  />
                  <Text style={[styles.modalOptionText, styles.deleteText]}>
                    {t('home.deleteComment')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => setDeleteModalVisible(false)}
                >
                  <Text style={styles.modalOptionText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  postContainer: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  postContainerReply: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  postContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#000',
    textAlign: 'left',
    lineHeight: 16,
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  menuButton: {
    padding: 4,
  },
  headshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.black,
  },
  time: {
    paddingTop: 2,
    fontSize: 14,
    color: Theme.textPostTime,
    fontWeight: '500',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    marginLeft: 4,
    fontSize: 14,
  },
  replyButton: {
    marginLeft: 20,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  replyButtonText: {
    fontSize: 14,
    color: Theme.textPostTime,
    fontWeight: '500',
  },
  repliesToggle: {
    marginTop: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  repliesToggleText: {
    fontSize: 14,
    color: Theme.textPostTime,
    fontWeight: '500',
  },
  repliesContainer: {
    marginLeft: 32,
    paddingLeft: 20,
    position: 'relative',
  },
  connectorLine: {
    position: 'absolute',
    left: 0,
    // Anchor near the parent's footer area and hook into the first reply's
    // avatar with a short L-shape. Don't span the full reply group — that
    // pushes the curve to the bottom (wrong place) and looks orphaned.
    top: -20,
    width: 16,
    height: 40,
    borderLeftWidth: 1,
    borderLeftColor: Theme.textInactiveTab,
    borderBottomWidth: 1,
    borderBottomColor: Theme.textInactiveTab,
    borderBottomLeftRadius: 12,
  },
  mention: {
    color: Theme.mentionBlue,
    fontWeight: '500',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  dragHandle: {
    width: 77,
    height: 5,
    backgroundColor: Theme.textInactiveTab,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionIcon: {
    marginRight: 8,
  },
  modalOptionText: {
    fontSize: 18,
    color: Theme.black,
    fontWeight: '500',
    flex: 1,
  },
  deleteText: {
    color: '#FF3B30',
  },
});

export default PostCommentItem;
