/**
 * redeem-referral
 *
 * Atomic-ish redemption of an invite code. Called once per new user, right after
 * onboarding completes. Mirrors the block-user / report-user pattern: 200 status on
 * expected failures with { success: false, reason } so the client treats them as
 * data, not exceptions. The invitee's signup is never blocked by a redeem failure.
 *
 *  CALL FLOW:
 *
 *    client (saveOnboardingProfile) ──▶ POST /redeem-referral { code, source }
 *           │
 *           ▼
 *    [1] auth check          ─── unauthorized                ─▶ 401
 *    [2] body validation     ─── bad payload                 ─▶ 400
 *    [3] find inviter by code (users WHERE invite_code = $1)
 *           │ not found / banned                             ─▶ {ok:false, reason:'invalid_code'|'inviter_banned'}
 *           ▼
 *    [4] self-referral check                                 ─▶ {ok:false, reason:'self_referral'}
 *    [5] INSERT referrals (UNIQUE on invitee_id)
 *           │ conflict (already redeemed)                    ─▶ {ok:false, reason:'already_redeemed'} (idempotent)
 *           ▼
 *    [6] INSERT user_followers (follower=invitee, following=inviter)
 *           │ (we do NOT call createFollowNotification — the invite-redeemed push
 *           │  below is the better signal, avoids double-notify)
 *           ▼
 *    [7] INSERT community_notifications (type='invite_redeemed') for inviter
 *           │
 *           ▼
 *    [8] best-effort invoke send-social-push for that notification
 *           ▼
 *    [9] fetch inviter card + their joined groups for the welcome screen
 *           ▼
 *           return { success:true, inviter, groups }
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildI18n } from '../_shared/notificationTemplates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const REFERRALS_ENABLED = (Deno.env.get('REFERRALS_ENABLED') ?? 'true') !== 'false';

type RedeemSource = 'clipboard' | 'manual' | 'universal_link';

interface RedeemBody {
  code?: unknown;
  source?: unknown;
}

interface InviterCard {
  id: string;
  username: string;
  profile_picture_url: string | null;
  city: string | null;
}

interface GroupCard {
  id: number;
  name: string;
  description: string | null;
  member_count: number | null;
  cover_photo_url: string | null;
}

function ok200(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidSource(s: unknown): s is RedeemSource {
  return s === 'clipboard' || s === 'manual' || s === 'universal_link';
}

// Alphabet matches generate_invite_code RPC: A-Z minus I and O, digits 2-9.
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

Deno.serve(async req => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('redeem-referral: missing Supabase env vars');
    return new Response(JSON.stringify({ success: false, reason: 'server_error' }), {
      status: 500,
    });
  }

  if (!REFERRALS_ENABLED) {
    return ok200({ success: false, reason: 'feature_disabled' });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // [1] auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ success: false, reason: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  const user = authData?.user;
  if (authErr || !user) {
    return new Response(JSON.stringify({ success: false, reason: 'unauthorized' }), { status: 401 });
  }

  // [2] body validation
  let body: RedeemBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, reason: 'bad_request' }), { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const source = isValidSource(body.source) ? body.source : 'manual';

  if (!CODE_RE.test(code)) {
    return ok200({ success: false, reason: 'invalid_code' });
  }

  // [3] find inviter
  const { data: inviterRow, error: inviterErr } = await supabase
    .from('users')
    .select('id, username, profile_picture_url')
    .eq('invite_code', code)
    .maybeSingle();

  if (inviterErr) {
    console.error('redeem-referral: inviter lookup error', inviterErr);
    return ok200({ success: false, reason: 'server_error' });
  }
  if (!inviterRow) {
    return ok200({ success: false, reason: 'invalid_code' });
  }

  // [4] self-referral
  if (inviterRow.id === user.id) {
    return ok200({ success: false, reason: 'self_referral' });
  }

  // [4.5] defense-in-depth: gate redemption behind a completed onboarding
  // profile. The only legitimate caller is saveOnboardingProfile after a
  // successful upsert with onboarding_completed=true, but the service-role
  // edge fn shouldn't blindly trust the caller. One small query keeps the
  // referrals table clean of any direct-API-call pollution.
  const { data: inviteeOnb, error: inviteeOnbErr } = await supabase
    .from('user_onboarding_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (inviteeOnbErr) {
    console.error('redeem-referral: invitee profile lookup error', inviteeOnbErr);
    return ok200({ success: false, reason: 'server_error' });
  }
  if (!inviteeOnb || inviteeOnb.onboarding_completed !== true) {
    return ok200({ success: false, reason: 'bad_request' });
  }

  // [5] insert referral row (UNIQUE on invitee_id)
  const { error: insertErr } = await supabase.from('referrals').insert({
    inviter_id: inviterRow.id,
    invitee_id: user.id,
    invite_code: code,
    source,
  });

  if (insertErr) {
    // 23505 = unique_violation. There's already a referrals row for this invitee.
    // If it's the SAME code+inviter as the current request, treat as an
    // idempotent retry: re-run the side effects with existence guards (so a
    // previously-partial commit can finish), then hydrate the welcome payload.
    // If it's a DIFFERENT code (user already redeemed someone else's code
    // earlier), refuse: don't overwrite, don't show a second welcome.
    if ((insertErr as { code?: string }).code === '23505') {
      const { data: existing, error: lookupErr } = await supabase
        .from('referrals')
        .select('inviter_id, invite_code')
        .eq('invitee_id', user.id)
        .maybeSingle();

      if (lookupErr || !existing) {
        console.error('redeem-referral: 23505 reload failed', lookupErr);
        return ok200({ success: false, reason: 'server_error' });
      }
      if (existing.inviter_id !== inviterRow.id || existing.invite_code !== code) {
        // Different code redeemed earlier — refuse silently.
        return ok200({ success: false, reason: 'already_redeemed' });
      }
      // Same code+inviter: legitimate retry. Fall through to side effects with
      // existence-guarded inserts so a partially-committed first attempt can
      // finish without double-creating notifications/pushes.
    } else {
      console.error('redeem-referral: insert error', insertErr);
      return ok200({ success: false, reason: 'server_error' });
    }
  }

  // [6] auto-follow inviter. The upsert is naturally idempotent (ignoreDuplicates
  // on the (follower_id, following_id) PK), so it's safe to re-run on a retry.
  // Bypass createFollowNotification by inserting directly; this avoids a duplicate
  // "started following you" push since we send the more meaningful invite-redeemed
  // push below.
  const { error: followErr } = await supabase
    .from('user_followers')
    .upsert(
      { follower_id: user.id, following_id: inviterRow.id },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
    );
  if (followErr) {
    console.error('redeem-referral: follow insert error (non-fatal)', followErr);
  }

  // [7+8] inviter notification + push — guarded by existence check so retries
  // don't double-notify. We treat the (recipient=inviter, actor=invitee,
  // type='invite_redeemed') triple as the natural idempotency key.
  const { data: existingNotif, error: notifLookupErr } = await supabase
    .from('community_notifications')
    .select('id')
    .eq('user_id', inviterRow.id)
    .eq('triggered_by_user_id', user.id)
    .eq('type', 'invite_redeemed')
    .maybeSingle();

  if (notifLookupErr) {
    console.error('redeem-referral: notification existence check failed', notifLookupErr);
  }

  if (!existingNotif) {
    const { data: inviteeProfile } = await supabase
      .from('users')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    // The row keeps English copy for builds that predate `data.i18n`; the
    // structured payload lets the app and send-social-push localize it.
    const inviteeUsername = inviteeProfile?.username ?? null;
    const inviteeDisplayName = inviteeUsername ?? 'Someone';
    const { data: notif, error: notifErr } = await supabase
      .from('community_notifications')
      .insert({
        user_id: inviterRow.id,
        triggered_by_user_id: user.id,
        type: 'invite_redeemed',
        title: 'New friend on Unify',
        body: `🎉 ${inviteeDisplayName} just joined Unify thanks to you.`,
        data: {
          actor_user_id: user.id,
          source,
          i18n: buildI18n(
            'inviteRedeemed',
            inviteeUsername ? { name: inviteeUsername } : undefined
          ),
        },
      })
      .select('id')
      .single();

    if (notifErr) {
      console.error('redeem-referral: notification insert error (non-fatal)', notifErr);
    } else if (notif?.id) {
      // Fire-and-forget push. Failure must not break the redeem.
      supabase.functions
        .invoke('send-social-push', { body: { notification_id: notif.id } })
        .catch(err => console.error('redeem-referral: send-social-push failed', err));
    }
  }

  // [9] hydrate the welcome screen response
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from('user_onboarding_profiles')
      .select('city')
      .eq('id', inviterRow.id)
      .maybeSingle(),
    supabase
      .from('group_members')
      .select(
        `groups!inner ( id, group_name, group_description, member_count, cover_photo_url )`
      )
      .eq('user_id', inviterRow.id),
  ]);

  const inviter: InviterCard = {
    id: inviterRow.id,
    username: inviterRow.username,
    profile_picture_url: (inviterRow as { profile_picture_url?: string | null }).profile_picture_url ?? null,
    city: profile?.city ?? null,
  };

  const groups: GroupCard[] = ((memberships ?? []) as Array<{
    groups: {
      id: number;
      group_name: string | null;
      group_description: string | null;
      member_count: number | null;
      cover_photo_url: string | null;
    };
  }>).map(m => ({
    id: m.groups.id,
    name: (m.groups.group_name ?? '').trim(),
    description: m.groups.group_description?.trim() ?? null,
    member_count: m.groups.member_count,
    cover_photo_url: m.groups.cover_photo_url,
  }));

  return ok200({ success: true, inviter, groups });
});
