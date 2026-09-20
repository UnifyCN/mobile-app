import { supabase } from '@/lib/supabase';
import { buildNotificationI18n } from '@/utils/notificationText';

/**
 * Create a "someone followed you" notification for the user who was followed.
 * Call after followUser() succeeds (when isFollowing is true).
 */
export const createFollowNotification = async (
  followingId: string
): Promise<void> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (user.id === followingId) return;

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
      user_id: followingId,
      triggered_by_user_id: user.id,
      type: 'followed',
      title: 'New follower',
      body: `${username} started following you.`,
      data: {
        actor_user_id: user.id,
        i18n: buildNotificationI18n('followed', { name: actorUsername }),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create follow notification', {
      followingId,
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
      console.error('send-social-push failed (follow)', pushError);
    }
  }
};
