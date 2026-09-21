import { supabase } from '@/lib/supabase';
import { buildNotificationI18n } from '@/utils/notificationText';

/**
 * Create a "someone liked your comment" notification for the comment author.
 * Call after likeComment() succeeds. No-op if the comment author is the current user.
 */
export const createCommentLikeNotification = async (
  commentId: number
): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Get the comment to find its author and parent post
  const { data: comment } = await supabase
    .from('post_comments')
    .select('user_id, post_id')
    .eq('id', commentId)
    .single();

  if (!comment || comment.user_id === user.id) return;

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
      user_id: comment.user_id,
      triggered_by_user_id: user.id,
      type: 'comment_liked',
      title: 'Someone liked your comment',
      body: `${username} liked your comment.`,
      data: {
        post_id: comment.post_id,
        comment_id: commentId,
        actor_user_id: user.id,
        i18n: buildNotificationI18n('commentLiked', { name: actorUsername }),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create comment-like notification', {
      commentId,
      commentOwnerId: comment.user_id,
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
      console.error('send-social-push failed (comment_liked)', pushError);
    }
  }
};
