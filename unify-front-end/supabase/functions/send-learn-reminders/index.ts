import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DEFAULT_NOTIFICATION_LANGUAGE,
  render,
  resolveNotificationLanguage,
  type NotificationLanguage,
} from '../_shared/notificationTemplates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const LEARN_REMINDERS_API_KEY = Deno.env.get('LEARN_REMINDERS_API_KEY');
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const HOUR_MS = 60 * 60 * 1000;

// Reminder tiers: each tier has a time window and a pair of template keys.
// Windows must be >= 24h (cron interval) and overlap adjacent tiers to avoid gaps.
// The copy itself lives in _shared/notificationTemplates.ts, one entry per
// language; `namedKey` is the variant that greets the user by first name
// (each language writes that greeting itself, rather than English-style
// lowercasing of the first letter).
const REMINDER_TIERS = [
  {
    tier: 1,
    minHours: 22,
    maxHours: 48,
    key: 'learnReminderTier1',
    namedKey: 'learnReminderTier1Named',
  },
  {
    tier: 2,
    minHours: 48,
    maxHours: 96,
    key: 'learnReminderTier2',
    namedKey: 'learnReminderTier2Named',
  },
  {
    tier: 3,
    minHours: 96,
    maxHours: 168,
    key: 'learnReminderTier3',
    namedKey: 'learnReminderTier3Named',
  },
];

type ReminderCandidate = {
  id: string;
  user_id: string;
  sanity_lesson_id: string;
  sanity_submodule_id: string;
  sanity_module_id: string;
  last_accessed_at: string;
  reminder_tier: number;
};

type PushDeliveryResult = {
  staleTokens: string[];
  failedTokens: string[];
};

/** Send push notifications via Expo in batches of 100. Returns stale and failed tokens. */
async function sendExpoPush(
  messages: Array<{
    to: string;
    sound: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    channelId: string;
    priority: string;
  }>
): Promise<PushDeliveryResult> {
  const batchSize = 100;
  const timeoutMs = 5000;
  const staleTokens: string[] = [];
  const failedTokens: string[] = [];

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
        console.error('send-learn-reminders: expo batch', i, await res.text());
        for (const msg of batch) {
          failedTokens.push(msg.to);
        }
      } else {
        const result = await res.json();
        if (result.data) {
          for (let j = 0; j < result.data.length; j++) {
            const ticket = result.data[j];
            if (ticket.status === 'error') {
              console.error(
                'send-learn-reminders: ticket error',
                ticket.message,
                ticket.details
              );
              if (ticket.details?.error === 'DeviceNotRegistered') {
                staleTokens.push(batch[j].to);
              } else {
                failedTokens.push(batch[j].to);
              }
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        console.error('send-learn-reminders: expo timeout', i);
      } else {
        console.error('send-learn-reminders: expo error', i, e);
      }
      for (const msg of batch) {
        failedTokens.push(msg.to);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return { staleTokens, failedTokens };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('send-learn-reminders: missing Supabase env');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  // Authenticate via API key (cron-only — not callable by users)
  const apiKey = req.headers.get('x-api-key');
  if (!LEARN_REMINDERS_API_KEY || apiKey !== LEARN_REMINDERS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = Date.now();

  // Query all in-progress, incomplete lessons with their users' push tokens
  // and notification preferences
  const { data: candidates, error: queryError } = await supabase
    .from('user_lesson_progress')
    .select(
      `
      id,
      user_id,
      sanity_lesson_id,
      sanity_submodule_id,
      sanity_module_id,
      last_accessed_at,
      reminder_tier
    `
    )
    .eq('is_in_progress', true)
    .eq('is_completed', false)
    .lt('reminder_tier', 3);

  if (queryError) {
    console.error('send-learn-reminders: query error', queryError);
    return new Response(JSON.stringify({ error: 'Query failed' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  if (!candidates?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // Group candidates by tier eligibility
  const toSend: Array<{
    candidate: ReminderCandidate;
    tier: (typeof REMINDER_TIERS)[number];
  }> = [];

  for (const candidate of candidates as ReminderCandidate[]) {
    const hoursSinceAccess =
      (now - new Date(candidate.last_accessed_at).getTime()) / HOUR_MS;

    for (const tierDef of REMINDER_TIERS) {
      if (
        candidate.reminder_tier < tierDef.tier &&
        hoursSinceAccess >= tierDef.minHours &&
        hoursSinceAccess <= tierDef.maxHours
      ) {
        toSend.push({ candidate, tier: tierDef });
        break; // Only one tier per candidate per run
      }
    }
  }

  if (!toSend.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }

  // Collect unique user IDs and check preferences + tokens in bulk
  const userIds = [...new Set(toSend.map(s => s.candidate.user_id))];

  // Check which users have opted into notifications.
  // user_onboarding_profiles is keyed on `id` (= auth.users.id), there is no `user_id` column.
  // first_name lives on the users table, fetched separately below.
  const { data: profiles, error: profilesError } = await supabase
    .from('user_onboarding_profiles')
    .select('id, wants_reminders, preferred_language')
    .in('id', userIds);

  if (profilesError) {
    console.error('send-learn-reminders: profiles query error', profilesError);
    return new Response(JSON.stringify({ error: 'Profiles query failed' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  // Require explicit opt-in: only users with wants_reminders === true get reminders
  const optedInUsers = new Set(
    (profiles ?? [])
      .filter((p: { wants_reminders: boolean }) => p.wants_reminders === true)
      .map((p: { id: string }) => p.id)
  );

  // Reminder copy follows the recipient's own language; anything unset or
  // unrecognized falls back to English.
  const languageByUser = new Map<string, NotificationLanguage>();
  for (const p of (profiles ?? []) as Array<{
    id: string;
    preferred_language?: unknown;
  }>) {
    languageByUser.set(p.id, resolveNotificationLanguage(p.preferred_language));
  }

  // Fetch first_name from users (separate table). Failure here is non-fatal —
  // reminders still go out without personalization.
  const firstNameByUser = new Map<string, string>();
  const { data: userRows, error: userRowsError } = await supabase
    .from('users')
    .select('id, first_name')
    .in('id', userIds);

  if (userRowsError) {
    console.warn(
      'send-learn-reminders: users query error (non-fatal)',
      userRowsError
    );
  } else {
    for (const u of (userRows ?? []) as Array<{
      id: string;
      first_name: string | null;
    }>) {
      const name = u.first_name?.trim();
      if (name) firstNameByUser.set(u.id, name);
    }
  }

  // Get push tokens for opted-in users
  const eligibleUserIds = userIds.filter(id => optedInUsers.has(id));
  if (!eligibleUserIds.length) {
    return new Response(
      JSON.stringify({ ok: true, sent: 0, skipped: 'all_opted_out' }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  }

  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', eligibleUserIds);

  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const existing = tokensByUser.get(row.user_id) ?? [];
    existing.push(row.token);
    tokensByUser.set(row.user_id, existing);
  }

  // Build push messages, tracking which tokens map to which candidates
  const messages: Array<{
    to: string;
    sound: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    channelId: string;
    priority: string;
  }> = [];

  // Map each message index to the candidate it belongs to
  const messageToCandidateIndex: Array<{ id: string; tier: number }> = [];

  for (const { candidate, tier } of toSend) {
    if (!optedInUsers.has(candidate.user_id)) continue;
    const tokens = tokensByUser.get(candidate.user_id);
    if (!tokens?.length) continue;

    // Use the name-greeting variant when we know the first name, so the push
    // feels personal in every language.
    const firstName = firstNameByUser.get(candidate.user_id);
    const language =
      languageByUser.get(candidate.user_id) ?? DEFAULT_NOTIFICATION_LANGUAGE;
    const rendered = render(
      firstName ? tier.namedKey : tier.key,
      language,
      firstName ? { name: firstName } : undefined
    );
    if (!rendered) {
      console.error(
        'send-learn-reminders: unknown template key',
        firstName ? tier.namedKey : tier.key
      );
      continue;
    }

    for (const token of tokens) {
      messages.push({
        to: token,
        sound: 'default',
        title: rendered.title,
        body: rendered.body,
        data: {
          type: 'learn_reminder',
          lesson_id: candidate.sanity_lesson_id,
          submodule_id: candidate.sanity_submodule_id,
          module_id: candidate.sanity_module_id,
        },
        channelId: 'learn',
        priority: 'default',
      });
      messageToCandidateIndex.push({ id: candidate.id, tier: tier.tier });
    }
  }

  // Send push notifications and determine which candidates succeeded
  let deliveryResult: PushDeliveryResult = {
    staleTokens: [],
    failedTokens: [],
  };
  const rowUpdates: Array<{ id: string; tier: number }> = [];

  if (messages.length > 0) {
    deliveryResult = await sendExpoPush(messages);

    // Only mark candidates as delivered if none of their tokens failed
    const failedSet = new Set([
      ...deliveryResult.staleTokens,
      ...deliveryResult.failedTokens,
    ]);
    const succeededCandidateIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      if (!failedSet.has(messages[i].to)) {
        succeededCandidateIds.add(messageToCandidateIndex[i].id);
      }
    }
    for (const entry of messageToCandidateIndex) {
      if (succeededCandidateIds.has(entry.id)) {
        // Deduplicate: only add each candidate once
        if (!rowUpdates.some(r => r.id === entry.id)) {
          rowUpdates.push(entry);
        }
      }
    }
  }

  // Clean up stale tokens that are no longer registered
  if (deliveryResult.staleTokens.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_tokens')
      .delete()
      .in('token', deliveryResult.staleTokens);
    if (deleteError) {
      console.error(
        'send-learn-reminders: failed to delete stale tokens',
        deleteError
      );
    } else {
      console.log(
        `send-learn-reminders: cleaned ${deliveryResult.staleTokens.length} stale token(s)`
      );
    }
  }

  // Update reminder_tier and last_reminder_sent_at in batches grouped by tier
  const nowIso = new Date(now).toISOString();
  const idsByTier = new Map<number, string[]>();
  for (const update of rowUpdates) {
    const ids = idsByTier.get(update.tier) ?? [];
    ids.push(update.id);
    idsByTier.set(update.tier, ids);
  }

  for (const [tier, ids] of idsByTier) {
    const { error: updateError } = await supabase
      .from('user_lesson_progress')
      .update({
        reminder_tier: tier,
        last_reminder_sent_at: nowIso,
      })
      .in('id', ids);

    if (updateError) {
      console.error(
        'send-learn-reminders: batch update error tier',
        tier,
        updateError
      );
    }
  }

  console.log(
    `send-learn-reminders: sent ${messages.length} pushes for ${rowUpdates.length} lessons`
  );

  return new Response(
    JSON.stringify({
      ok: true,
      sent: messages.length,
      lessons: rowUpdates.length,
    }),
    { status: 200, headers: JSON_HEADERS }
  );
});
