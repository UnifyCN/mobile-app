import { supabase } from '@/lib/supabase';
import { buildNotificationI18n } from '@/utils/notificationText';

/**
 * Create a "someone replied to your comment" notification for the parent comment author.
 * Call after createComment() succeeds when the comment has a parent_comment_id.
 * No-op if:
 *  - the parent comment author is the current user
 *  - the parent comment author is the post author (they already get a "commented" notification)
 */
export const createCommentReplyNotification = async (
  postId: number,
  commentId: number,
  parentCommentId: number
): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Get the parent comment to find its author
  const { data: parentComment } = await supabase
    .from('post_comments')
    .select('user_id')
    .eq('id', parentCommentId)
    .single();

  if (!parentComment || parentComment.user_id === user.id) return;

  // Skip if parent comment author is the post author (they already get a "commented" notification)
  const { data: post } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .single();

  if (post && post.user_id === parentComment.user_id) return;

  const { data: actor } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single();

  // The row keeps English copy for older builds; `data.i18n` lets newer
  // readers re-render it in the recipient's language.
  const actorUsername = actor?.username ?? null;
  const username = actorUsername ?? 'Someone';

  const { data: inserted, error } = await supabase
    .from('community_notifications')
    .insert({
      user_id: parentComment.user_id,
      triggered_by_user_id: user.id,
      type: 'comment_reply',
      title: 'Reply to your comment',
      body: `${username} replied to your comment.`,
      data: {
        post_id: postId,
        comment_id: commentId,
        parent_comment_id: parentCommentId,
        actor_user_id: user.id,
        i18n: buildNotificationI18n('commentReply', { name: actorUsername }),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create comment-reply notification', {
      postId,
      commentId,
      parentCommentId,
      parentCommentOwnerId: parentComment.user_id,
      actorUserId: user.id,
      error,
    });
    return;
  }

  if (inserted?.id) {
    const { error: pushError } = await supabase.functions.invoke(
      'send-social-push',
      { body: { notification_id: inserted.id } }
    );
    if (pushError) {
      console.error('send-social-push failed (comment_reply)', pushError);
    }
  }
};
