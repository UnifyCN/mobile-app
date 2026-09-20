import { supabase } from '@/lib/supabase';
import { buildNotificationI18n } from '@/utils/notificationText';

/**
 * Create a "someone commented on your post" notification for the post author.
 * Call after createComment() succeeds. No-op if the post author is the current user.
 */
export const createCommentNotification = async (
  postId: number,
  commentId: number
): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: post } = await supabase
    .from('posts')
    .select('user_id')
    .eq('id', postId)
    .single();

  if (!post || post.user_id === user.id) return;

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
      user_id: post.user_id,
      triggered_by_user_id: user.id,
      type: 'commented',
      title: 'New comment on your post',
      body: `${username} commented on your post.`,
      data: {
        post_id: postId,
        comment_id: commentId,
        actor_user_id: user.id,
        i18n: buildNotificationI18n('commented', { name: actorUsername }),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create comment notification', {
      postId,
      commentId,
      postOwnerId: post.user_id,
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
      console.error('send-social-push failed (comment)', pushError);
    }
  }
};
