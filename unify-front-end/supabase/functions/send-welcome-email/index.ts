import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend';
import { en } from './templates/en.ts';
import { vi } from './templates/vi.ts';
import { es } from './templates/es.ts';
import { hi } from './templates/hi.ts';
import { ar } from './templates/ar.ts';
import { frCA } from './templates/fr-CA.ts';
import { pa } from './templates/pa.ts';

const RESEND_USER_EMAILS_API_KEY = Deno.env.get('RESEND_USER_EMAILS_API_KEY');
const RESEND_WELCOME_FROM = Deno.env.get('RESEND_WELCOME_FROM');
const WELCOME_EMAIL_API_KEY = Deno.env.get('WELCOME_EMAIL_API_KEY');
const REPLY_TO = 'contact@unifysocial.ca';
const RESEND_TIMEOUT_MS = 5000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Keys are the exact `preferred_language` values the app stores. An unknown
// or null value falls back to English below.
const templates: Record<string, typeof en> = {
  en,
  vi,
  es,
  hi,
  ar,
  'fr-CA': frCA,
  pa,
};

Deno.serve(async req => {
  if (!RESEND_USER_EMAILS_API_KEY || !RESEND_WELCOME_FROM) {
    console.error('[welcome] missing Resend env vars');
    return new Response(JSON.stringify({ error: 'missing_env' }), {
      status: 500,
    });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WELCOME_EMAIL_API_KEY) {
    console.error('[welcome] missing Supabase/internal env vars');
    return new Response(JSON.stringify({ error: 'missing_env' }), {
      status: 500,
    });
  }

  // Caller must be the cron job (or a manual operator) — proven by a
  // shared secret kept in Vault. Stops random authenticated clients from
  // re-firing welcome emails on demand.
  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== WELCOME_EMAIL_API_KEY) {
    console.warn('[welcome] unauthorized invocation: bad or missing x-api-key');
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
    });
  }

  let userId: string | undefined;
  try {
    const body = await req.json();
    userId = typeof body?.userId === 'string' ? body.userId : undefined;
  } catch {
    // empty/invalid body — handled below
  }
  if (!userId) {
    return new Response(JSON.stringify({ error: 'missing_user_id' }), {
      status: 400,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const resend = new Resend(RESEND_USER_EMAILS_API_KEY);

  try {
    const { data: profileRow, error: profileError } = await supabase
      .from('user_onboarding_profiles')
      .select('welcome_email_sent_at, welcome_email_attempts, preferred_language')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[welcome] profile lookup failed', { userId, profileError });
      return new Response(
        JSON.stringify({ success: false, error: 'profile_lookup_failed' }),
        { status: 500 },
      );
    }
    if (!profileRow) {
      console.error('[welcome] no profile for user', userId);
      return new Response(
        JSON.stringify({ success: false, error: 'no_profile' }),
        { status: 200 },
      );
    }
    if (profileRow.welcome_email_sent_at) {
      console.log('[welcome] skipped: already_sent', { userId });
      return new Response(
        JSON.stringify({ success: true, skipped: 'already_sent' }),
        { status: 200 },
      );
    }

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      console.error('[welcome] user lookup failed', { userId, userError });
      return new Response(
        JSON.stringify({ success: false, error: 'user_lookup_failed' }),
        { status: 500 },
      );
    }
    if (!userRow?.email) {
      console.error('[welcome] no_email for user', userId);
      // Bump attempts so cron stops retrying a user who can never receive.
      await supabase
        .from('user_onboarding_profiles')
        .update({
          welcome_email_attempts: (profileRow.welcome_email_attempts ?? 0) + 1,
          welcome_email_last_attempt_at: new Date().toISOString(),
        })
        .eq('id', userId);
      return new Response(
        JSON.stringify({ success: false, error: 'no_email' }),
        { status: 200 },
      );
    }

    const lang = profileRow.preferred_language ?? 'en';
    const templateFactory = templates[lang] ?? templates.en;
    const template = templateFactory({ firstName: userRow.first_name ?? null });

    // Bump attempts BEFORE sending. If the send hangs and we crash, the next
    // cron tick still sees the bumped counter — prevents runaway retries.
    const { error: bumpError } = await supabase
      .from('user_onboarding_profiles')
      .update({
        welcome_email_attempts: (profileRow.welcome_email_attempts ?? 0) + 1,
        welcome_email_last_attempt_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (bumpError) {
      console.error('[welcome] failed to bump attempt counter', {
        userId,
        bumpError,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'attempt_bump_failed' }),
        { status: 500 },
      );
    }

    let resendId: string | undefined;
    let timeoutHandle: number | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('resend_timeout')),
          RESEND_TIMEOUT_MS,
        );
      });
      const sendPromise = resend.emails.send({
        from: RESEND_WELCOME_FROM,
        to: userRow.email,
        replyTo: REPLY_TO,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      const { data: sendData, error: sendError } = await Promise.race([
        sendPromise,
        timeoutPromise,
      ]);
      if (sendError) throw sendError;
      resendId = sendData?.id;
    } catch (emailErr) {
      const isTimeout =
        emailErr instanceof Error && emailErr.message === 'resend_timeout';
      console.error(
        isTimeout ? '[welcome] resend_timeout' : '[welcome] resend_failed',
        { userId, from: RESEND_WELCOME_FROM, error: emailErr },
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: isTimeout ? 'resend_timeout' : 'resend_failed',
        }),
        { status: 200 },
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }

    const { error: updateError } = await supabase
      .from('user_onboarding_profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) {
      // Resend ack'd the send but we failed to flip the gate. Next cron tick
      // will re-send — duplicate welcome is annoying but not catastrophic;
      // worth surfacing so we know to investigate.
      console.error('[welcome] sent but failed to flip welcome_email_sent_at', {
        userId,
        resendId,
        updateError,
      });
    }

    console.log('[welcome] sent', { userId, resendId });
    return new Response(JSON.stringify({ success: true, resendId }), {
      status: 200,
    });
  } catch (err) {
    console.error('[welcome] unexpected error', { userId, err });
    return new Response(
      JSON.stringify({ success: false, error: 'server_error' }),
      { status: 500 },
    );
  }
});
