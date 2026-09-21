import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getPreferredLanguage,
  resolveNotificationText,
  type NotificationLanguageSource,
} from '../_shared/notificationTemplates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type NotificationRow = {
  id: string;
  user_id: string;
  triggered_by_user_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

function isUuid(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  );
}

type PushResult = {
  ok: boolean;
  successCount: number;
  failureCount: number;
  errors: Array<{ token: string; error: string }>;
};

/** Same batching pattern as matchmake-circles `sendPushNotifications`. */
async function sendExpoPushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string
): Promise<PushResult> {
  const result: PushResult = {
    ok: true,
    successCount: 0,
    failureCount: 0,
    errors: [],
  };
  if (!userIds.length) return result;

  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', userIds);

  if (error) {
    console.error('send-social-push: push_tokens', error);
    return {
      ok: false,
      successCount: 0,
      failureCount: 0,
      errors: [{ token: '', error: error.message }],
    };
  }
  if (!tokens?.length) return result;

  const messages = tokens.map(({ token }: { token: string }) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    data: data ?? {},
    priority: 'high' as const,
    ...(channelId ? { channelId } : {}),
  }));

  const batchSize = 100;
  const timeoutMs = 5000;
  const staleTokens: string[] = [];

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (EXPO_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
      }
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('send-social-push: expo batch', i, text);
        result.ok = false;
        result.failureCount += batch.length;
        for (const msg of batch) {
          result.errors.push({ token: msg.to, error: `HTTP ${res.status}` });
        }
      } else {
        // Parse push tickets to detect stale tokens
        const ticketResult = await res.json();
        if (ticketResult.data) {
          for (let j = 0; j < ticketResult.data.length; j++) {
            const ticket = ticketResult.data[j];
            if (ticket.status === 'error') {
              console.error(
                'send-social-push: ticket error',
                ticket.message,
                ticket.details
              );
              result.ok = false;
              result.failureCount++;
              result.errors.push({
                token: batch[j].to,
                error: ticket.details?.error ?? ticket.message,
              });
              if (ticket.details?.error === 'DeviceNotRegistered') {
                staleTokens.push(batch[j].to);
              }
            } else {
              result.successCount++;
            }
          }
        }
      }
    } catch (e) {
      result.ok = false;
      result.failureCount += batch.length;
      if (e instanceof Error && e.name === 'AbortError') {
        console.error('send-social-push: expo timeout', i);
        for (const msg of batch) {
          result.errors.push({ token: msg.to, error: 'timeout' });
        }
      } else {
        console.error('send-social-push: expo error', i, e);
        for (const msg of batch) {
          result.errors.push({ token: msg.to, error: String(e) });
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  // Clean up stale tokens that are no longer registered
  if (staleTokens.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_tokens')
      .delete()
      .in('token', staleTokens);
    if (deleteError) {
      console.error(
        'send-social-push: failed to delete stale tokens',
        deleteError
      );
    } else {
      console.log(
        `send-social-push: cleaned ${staleTokens.length} stale token(s)`
      );
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('send-social-push: missing Supabase env');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const jwt =
    req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: authError,
  } = await supabaseService.auth.getUser(jwt);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('notification_id' in body)
  ) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const parsed = body as { notification_id?: string };

  if (!isUuid(parsed.notification_id)) {
    return new Response(JSON.stringify({ error: 'Invalid notification_id' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const { data: row, error: rowError } = await supabaseService
    .from('community_notifications')
    .select('id, user_id, triggered_by_user_id, type, title, body, data')
    .eq('id', parsed.notification_id)
    .maybeSingle();

  if (rowError) {
    console.error('send-social-push: load notification', rowError);
    return new Response(
      JSON.stringify({ error: 'Failed to load notification' }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }

  const notification = row as NotificationRow | null;
  if (!notification) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  }

  if (
    ![
      'liked',
      'commented',
      'followed',
      'comment_liked',
      'comment_reply',
      'invite_redeemed',
    ].includes(notification.type)
  ) {
    return new Response(
      JSON.stringify({ error: 'Unsupported notification type' }),
      {
        status: 400,
        headers: JSON_HEADERS,
      }
    );
  }

  if (notification.triggered_by_user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  // Atomic claim: set processing flag to prevent concurrent sends
  const { data: claimed, error: claimError } = await supabaseService
    .from('community_notifications')
    .update({ processing: true, processing_at: new Date().toISOString() })
    .eq('id', parsed.notification_id)
    .eq('delivered', false)
    .eq('processing', false)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('send-social-push: claim error', claimError);
    return new Response(
      JSON.stringify({ error: 'Failed to claim notification' }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }

  if (!claimed) {
    // Already delivered or being processed — idempotent success
    return new Response(JSON.stringify({ ok: true, already_delivered: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // Social notifications always send — users control via iOS/Android system settings.
  // Only learn reminders check the wants_reminders preference (in send-learn-reminders).

  const dataPayload = notification.data ?? {};
  const postId = dataPayload.post_id;
  const pushData: Record<string, string | number> = {
    type: notification.type,
  };
  if (typeof postId === 'number') pushData.post_id = postId;
  else if (typeof postId === 'string' && postId !== '') {
    const n = Number(postId);
    pushData.post_id = Number.isFinite(n) ? n : postId;
  }

  const actorUserId = dataPayload.actor_user_id;
  if (
    ['followed', 'comment_liked', 'comment_reply', 'invite_redeemed'].includes(
      notification.type
    ) &&
    typeof actorUserId === 'string' &&
    actorUserId !== ''
  ) {
    pushData.actor_user_id = actorUserId;
  }

  const commentId = dataPayload.comment_id;
  if (
    ['commented', 'comment_liked', 'comment_reply'].includes(notification.type)
  ) {
    if (typeof commentId === 'number') pushData.comment_id = commentId;
    else if (typeof commentId === 'string' && commentId !== '') {
      const n = Number(commentId);
      pushData.comment_id = Number.isFinite(n) ? n : commentId;
    }
  }

  const channelId = 'social';

  // The row's `title`/`body` are English. When the writer also stored
  // `data.i18n`, re-render the copy in the recipient's own language; rows
  // written before that contract (or with an unknown key) keep the English.
  const recipientLanguage = await getPreferredLanguage(
    supabaseService as unknown as NotificationLanguageSource,
    notification.user_id
  );
  const { title: pushTitle, body: pushBody } = resolveNotificationText(
    notification,
    recipientLanguage
  );

  const pushResult = await sendExpoPushToUsers(
    supabaseService,
    [notification.user_id],
    pushTitle,
    pushBody,
    pushData,
    channelId
  );

  if (!pushResult.ok) {
    // Clear processing flag so the notification can be retried
    await supabaseService
      .from('community_notifications')
      .update({ processing: false, processing_at: null })
      .eq('id', parsed.notification_id);

    return new Response(
      JSON.stringify({
        ok: false,
        successCount: pushResult.successCount,
        failureCount: pushResult.failureCount,
        errors: pushResult.errors,
      }),
      {
        status: 502,
        headers: JSON_HEADERS,
      }
    );
  }

  // Mark as delivered on successful send
  await supabaseService
    .from('community_notifications')
    .update({
      delivered: true,
      delivered_at: new Date().toISOString(),
      processing: false,
    })
    .eq('id', parsed.notification_id);

  return new Response(
    JSON.stringify({
      ok: true,
      successCount: pushResult.successCount,
    }),
    {
      status: 200,
      headers: JSON_HEADERS,
    }
  );
});
