import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// @ts-ignore
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildI18n,
  getPreferredLanguages,
  render,
  type NotificationLanguageSource,
  type RenderedNotification,
} from '../_shared/notificationTemplates.ts';

const COMMUNITY_CIRCLE_DURATION_DAYS = 14;
const MAX_CIRCLE_SIZE = 4;
const MIN_CIRCLE_SIZE = 2;
const PLACEMENT_DEADLINE_DAYS = 3;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const DELETE_ENDED_CIRCLES_GRACE_PERIOD_MS = 24 * HOUR_IN_MS;

const WELCOME_MESSAGE =
  'You have a new Unify Circle. Take a moment to introduce yourself and share what you hope to get from the next 14 days together.';
const FORCED_PLACEMENT_BODY =
  "We placed you into a circle so you wouldn't keep waiting. Tap to meet your group.";
const STANDARD_MATCH_BODY =
  'Your Unify Circle is ready. Tap to meet your group.';
const CLOSING_MESSAGE =
  'This circle has wrapped up. Say thanks, follow one another, and keep the support going beyond Circles.';
const DAY_13_REMINDER_MESSAGE =
  'One day left in this circle. Share one last useful tip, thank someone who helped you, or exchange contact info if you want to stay in touch.';

const DAILY_PROMPT_LIBRARY = {
  fallback: [
    'What is one small thing that feels easier in Canada now than it did when you started?',
    'What is one question you wish you had asked earlier in your newcomer journey?',
    'What is one place, app, or service in Canada that has made your week easier?',
    'What is one win from this week, even if it felt small?',
    'What advice would you give someone arriving in Canada next month?',
  ],
  goal: {
    make_friends: [
      'What helped you feel most connected in a new place before, and what are you hoping to try here?',
      'If someone new to your city asked where to meet people, what would you tell them?',
    ],
    practice_english: [
      'What everyday conversation in English or French still feels hard, and how do you practice it?',
      'Share one phrase you learned recently that you want to use more confidently.',
    ],
    job_search: [
      'What part of the job search feels most confusing right now: resumes, networking, interviews, or something else?',
      'What is one job-search tip or resource that has actually been useful for you?',
    ],
    wellness: [
      'What routine or habit helps you feel steady when life gets overwhelming?',
      'What is one thing you do to recharge after a difficult week?',
    ],
  } as Record<string, string[]>,
  topic: {
    immigration: [
      'What immigration or paperwork task is taking the most energy right now?',
      'What is one paperwork tip you wish more newcomers heard earlier?',
    ],
    housing: [
      'What has surprised you most about finding housing in Canada?',
      'If someone were starting their housing search today, what would you warn them about?',
    ],
    finances: [
      'What money habit or banking tip has helped you settle in more confidently?',
      'What expense in Canada caught you off guard at first?',
    ],
    community: [
      'What has helped you feel less alone since arriving in Canada?',
      'Where have you found the warmest sense of community so far?',
    ],
    career: [
      'What part of working life in Canada still feels hardest to decode?',
      'What is one resume, networking, or interview lesson you have picked up recently?',
    ],
  } as Record<string, string[]>,
};

type SupabaseClient = ReturnType<typeof createClient>;

type WaitlistRow = {
  user_id: string;
  pool_key: string;
  persona: string | null;
  time_in_canada: string;
  created_at: string;
  placement_deadline_at: string | null;
  goal: string | null;
  topics: string[] | null;
};

type MatchHistoryRow = {
  user_a: string;
  user_b: string;
};

type CirclePromptRow = {
  id: string;
  created_at: string;
  goal: string | null;
  topics: string[] | null;
};

type MatchingGroup = {
  entries: WaitlistRow[];
  forcedPlacement: boolean;
};

type GroupContext = {
  poolKey: string;
  persona: string | null;
  timeInCanada: string;
  goal: string | null;
  topics: string[];
  matchMetadata: Record<string, unknown>;
};

const responseHeaders = {
  'Content-Type': 'application/json',
};

function normalizePoolSegment(value?: string | null, fallback = 'open') {
  return (value || fallback).trim().toLowerCase().replace(/\s+/g, '_');
}

function buildPoolKey(persona?: string | null, timeInCanada?: string | null) {
  return `${normalizePoolSegment(persona, 'mixed')}__${normalizePoolSegment(
    timeInCanada,
    'unknown'
  )}`;
}

function decodeBase64Url(value: string): Uint8Array | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );

  try {
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    return null;
  }

  const payloadBytes = decodeBase64Url(payloadSegment);
  if (!payloadBytes) {
    return null;
  }

  try {
    return JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

async function verifyServiceRoleJwt(
  authorization: string | null
): Promise<boolean> {
  if (!authorization?.startsWith('Bearer ')) {
    return false;
  }

  const token = authorization.slice('Bearer '.length).trim();
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET');

  if (!encodedHeader || !encodedPayload || !encodedSignature || !jwtSecret) {
    return false;
  }

  const headerBytes = decodeBase64Url(encodedHeader);
  const payload = decodeJwtPayload(token);
  const signatureBytes = decodeBase64Url(encodedSignature);

  if (!headerBytes || !payload || !signatureBytes) {
    return false;
  }

  try {
    const header = JSON.parse(new TextDecoder().decode(headerBytes)) as {
      alg?: string;
      typ?: string;
    };

    if (header.alg !== 'HS256') {
      return false;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expiration =
      typeof payload.exp === 'number' ? payload.exp : Number(payload.exp);
    const notBefore =
      typeof payload.nbf === 'number' ? payload.nbf : Number(payload.nbf);

    if (Number.isFinite(expiration) && expiration <= nowInSeconds) {
      return false;
    }

    if (Number.isFinite(notBefore) && notBefore > nowInSeconds) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expectedSignature = new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
      )
    );

    if (expectedSignature.length !== signatureBytes.length) {
      return false;
    }

    for (let index = 0; index < expectedSignature.length; index += 1) {
      if (expectedSignature[index] !== signatureBytes[index]) {
        return false;
      }
    }

    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

async function isAuthorizedRequest(req: Request): Promise<boolean> {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = Deno.env.get('MATCHMAKE_API_KEY');

  if (expectedKey && apiKey === expectedKey) {
    return true;
  }

  const authorization = req.headers.get('authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (
    Boolean(
      serviceRoleKey &&
        authorization &&
        authorization === `Bearer ${serviceRoleKey}`
    )
  ) {
    return true;
  }

  return verifyServiceRoleJwt(authorization);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: responseHeaders,
    });
  }

  if (!(await isAuthorizedRequest(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: responseHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Missing Supabase environment configuration',
      }),
      {
        status: 500,
        headers: responseHeaders,
      }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const runId = await startMatchingRun(supabase);

  const summary = {
    availableUsers: 0,
    circlesCreated: [] as Array<{
      circleId: string;
      memberIds: string[];
      forcedPlacement: boolean;
    }>,
    failures: [] as Array<{ memberIds: string[]; reason: string }>,
    expiredCirclesClosed: 0,
    day13RemindersSent: 0,
    dailyPromptsSent: 0,
    circlesDeleted: 0,
  };

  try {
    summary.expiredCirclesClosed = await closeExpiredCircles(supabase);
    summary.day13RemindersSent = await sendDay13Reminders(supabase);
    summary.dailyPromptsSent = await sendDailyPrompts(supabase);
    summary.circlesDeleted = await deleteEndedCircles(supabase);

    const waitlistEntries = await fetchWaitlist(supabase);
    const activeUsers = await getActiveUserIds(supabase);
    const availableEntries = waitlistEntries.filter(
      entry => !activeUsers.has(entry.user_id)
    );

    summary.availableUsers = availableEntries.length;

    if (availableEntries.length < MIN_CIRCLE_SIZE) {
      await finishMatchingRun(supabase, runId, 'success', summary);
      return new Response(JSON.stringify({ ok: true, summary }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const groups = await buildGroups(supabase, availableEntries);

    for (const group of groups) {
      try {
        const circleId = await createCircleForGroup(supabase, group);
        summary.circlesCreated.push({
          circleId,
          memberIds: group.entries.map(entry => entry.user_id),
          forcedPlacement: group.forcedPlacement,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        summary.failures.push({
          memberIds: group.entries.map(entry => entry.user_id),
          reason,
        });
        console.error('matchmake-circles.createCircle.error', reason);
      }
    }

    await finishMatchingRun(supabase, runId, 'success', summary);

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('matchmake-circles.error', error);
    await finishMatchingRun(supabase, runId, 'error', summary, message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
});

async function startMatchingRun(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('community_matching_runs')
    .insert({ status: 'running' })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Failed to create matching run row', error);
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

async function finishMatchingRun(
  supabase: SupabaseClient,
  runId: string | null,
  status: 'success' | 'error',
  summary: Record<string, unknown>,
  errorMessage?: string
) {
  if (!runId) {
    return;
  }

  const { error } = await supabase
    .from('community_matching_runs')
    .update({
      status,
      summary,
      error: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    console.error('Failed to finalize matching run row', error);
  }
}

async function fetchWaitlist(supabase: SupabaseClient): Promise<WaitlistRow[]> {
  const { data, error } = await supabase
    .from('community_match_waitlist')
    .select(
      'user_id,pool_key,persona,time_in_canada,created_at,placement_deadline_at,goal,topics'
    )
    .eq('status', 'waiting')
    .order('placement_deadline_at', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch waitlist: ${error.message}`);
  }

  return ((data || []) as WaitlistRow[]).map(entry => ({
    ...entry,
    pool_key: buildPoolKey(entry.persona, entry.time_in_canada),
    topics: normalizeTopics(entry.topics),
  }));
}

async function getActiveUserIds(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('community_circle_members')
    .select('user_id, left_at, community_circles!inner(status)')
    .eq('community_circles.status', 'active')
    .is('left_at', null);

  if (error) {
    console.error('Failed to fetch active circle members', error);
    return new Set<string>();
  }

  const ids = new Set<string>();
  for (const row of data || []) {
    if (row.user_id) {
      ids.add(row.user_id);
    }
  }
  return ids;
}

async function buildGroups(
  supabase: SupabaseClient,
  entries: WaitlistRow[]
): Promise<MatchingGroup[]> {
  const sortedEntries = [...entries].sort(compareWaitlistEntries);
  const historyPairs = await fetchMatchHistoryForUsers(
    supabase,
    sortedEntries.map(entry => entry.user_id)
  );
  const used = new Set<string>();
  const groups: MatchingGroup[] = [];

  for (const anchor of sortedEntries) {
    if (used.has(anchor.user_id)) {
      continue;
    }

    const group = buildGroup(anchor, sortedEntries, used, historyPairs, {
      minSize: MAX_CIRCLE_SIZE,
      maxSize: MAX_CIRCLE_SIZE,
      allowHistoryConflicts: false,
    });

    if (group.length === MAX_CIRCLE_SIZE) {
      group.forEach(entry => used.add(entry.user_id));
      groups.push({ entries: group, forcedPlacement: false });
    }
  }

  const agedEntries = sortedEntries.filter(
    entry => !used.has(entry.user_id) && isDeadlineReached(entry)
  );

  for (const anchor of agedEntries) {
    if (used.has(anchor.user_id)) {
      continue;
    }

    let group = buildGroup(anchor, sortedEntries, used, historyPairs, {
      minSize: MIN_CIRCLE_SIZE,
      maxSize: MAX_CIRCLE_SIZE,
      allowHistoryConflicts: false,
    });

    if (group.length < MIN_CIRCLE_SIZE) {
      group = buildGroup(anchor, sortedEntries, used, historyPairs, {
        minSize: MIN_CIRCLE_SIZE,
        maxSize: MAX_CIRCLE_SIZE,
        allowHistoryConflicts: true,
      });
    }

    if (group.length >= MIN_CIRCLE_SIZE) {
      group.forEach(entry => used.add(entry.user_id));
      groups.push({ entries: group, forcedPlacement: true });
    }
  }

  return groups;
}

async function fetchMatchHistoryForUsers(
  supabase: SupabaseClient,
  userIds: string[]
) {
  const pairs = new Set<string>();
  if (!userIds.length) {
    return pairs;
  }

  const userSet = new Set(userIds);
  const [userAResponse, userBResponse] = await Promise.all([
    supabase
      .from('community_match_history')
      .select('user_a,user_b')
      .in('user_a', userIds),
    supabase
      .from('community_match_history')
      .select('user_a,user_b')
      .in('user_b', userIds),
  ]);

  if (userAResponse.error) {
    console.error(
      'Failed to fetch match history (user_a)',
      userAResponse.error
    );
  }
  if (userBResponse.error) {
    console.error(
      'Failed to fetch match history (user_b)',
      userBResponse.error
    );
  }

  const rows: MatchHistoryRow[] = [
    ...((userAResponse.data || []) as MatchHistoryRow[]),
    ...((userBResponse.data || []) as MatchHistoryRow[]),
  ];

  for (const row of rows) {
    if (userSet.has(row.user_a) && userSet.has(row.user_b)) {
      pairs.add(buildPairKey(row.user_a, row.user_b));
    }
  }

  return pairs;
}

function buildGroup(
  anchor: WaitlistRow,
  entries: WaitlistRow[],
  used: Set<string>,
  historyPairs: Set<string>,
  options: {
    minSize: number;
    maxSize: number;
    allowHistoryConflicts: boolean;
  }
) {
  const group = [anchor];
  const picked = new Set<string>([anchor.user_id]);
  const tiers = [
    (candidate: WaitlistRow) =>
      sameTimeInCanada(anchor, candidate) &&
      sameRecognizedPersona(anchor, candidate),
    (candidate: WaitlistRow) => sameTimeInCanada(anchor, candidate),
    (candidate: WaitlistRow) =>
      sameGoal(anchor, candidate) || sharedTopicCount(anchor, candidate) > 0,
    (_candidate: WaitlistRow) => true,
  ];

  for (const tier of tiers) {
    const candidates = entries
      .filter(candidate => !used.has(candidate.user_id))
      .filter(candidate => !picked.has(candidate.user_id))
      .filter(candidate => tier(candidate))
      .sort((a, b) => compareCandidates(anchor, group, a, b));

    for (const candidate of candidates) {
      if (group.length >= options.maxSize) {
        break;
      }

      if (
        !options.allowHistoryConflicts &&
        hasHistoryConflict(group, candidate, historyPairs)
      ) {
        continue;
      }

      group.push(candidate);
      picked.add(candidate.user_id);
    }
  }

  return group;
}

function compareWaitlistEntries(a: WaitlistRow, b: WaitlistRow) {
  const deadlineA = new Date(resolvePlacementDeadline(a)).getTime();
  const deadlineB = new Date(resolvePlacementDeadline(b)).getTime();

  if (deadlineA !== deadlineB) {
    return deadlineA - deadlineB;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function compareCandidates(
  anchor: WaitlistRow,
  group: WaitlistRow[],
  a: WaitlistRow,
  b: WaitlistRow
) {
  const scoreA = scoreCandidate(anchor, group, a);
  const scoreB = scoreCandidate(anchor, group, b);

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  return compareWaitlistEntries(a, b);
}

function scoreCandidate(
  anchor: WaitlistRow,
  group: WaitlistRow[],
  candidate: WaitlistRow
) {
  let score = 0;

  if (sameTimeInCanada(anchor, candidate)) {
    score += 5;
  }
  if (sameRecognizedPersona(anchor, candidate)) {
    score += 3;
  }
  if (sameGoal(anchor, candidate)) {
    score += 4;
  }

  score += sharedTopicCount(anchor, candidate) * 2;

  for (const member of group) {
    if (sameGoal(member, candidate)) {
      score += 1;
    }
    score += sharedTopicCount(member, candidate);
  }

  if (isDeadlineReached(candidate)) {
    score += 2;
  }

  return score;
}

function sameRecognizedPersona(a: WaitlistRow, b: WaitlistRow) {
  return Boolean(
    isRecognizedPersona(a.persona) &&
      isRecognizedPersona(b.persona) &&
      a.persona === b.persona
  );
}

function sameTimeInCanada(a: WaitlistRow, b: WaitlistRow) {
  return a.time_in_canada === b.time_in_canada;
}

function sameGoal(a: WaitlistRow, b: WaitlistRow) {
  return Boolean(a.goal && b.goal && a.goal === b.goal);
}

function sharedTopicCount(a: WaitlistRow, b: WaitlistRow) {
  const aTopics = new Set(normalizeTopics(a.topics));
  let count = 0;

  for (const topic of normalizeTopics(b.topics)) {
    if (aTopics.has(topic)) {
      count += 1;
    }
  }

  return count;
}

function isRecognizedPersona(persona?: string | null) {
  return Boolean(
    persona &&
      ['international_student', 'skilled_worker', 'refugee'].includes(persona)
  );
}

function normalizeTopics(topics: string[] | null | undefined) {
  return (topics || []).filter(Boolean);
}

function resolvePlacementDeadline(entry: WaitlistRow) {
  return (
    entry.placement_deadline_at ||
    new Date(
      new Date(entry.created_at).getTime() + PLACEMENT_DEADLINE_DAYS * DAY_IN_MS
    ).toISOString()
  );
}

function isDeadlineReached(entry: WaitlistRow) {
  return new Date(resolvePlacementDeadline(entry)).getTime() <= Date.now();
}

function hasHistoryConflict(
  group: WaitlistRow[],
  candidate: WaitlistRow,
  historyPairs: Set<string>
) {
  return group.some(entry =>
    historyPairs.has(buildPairKey(entry.user_id, candidate.user_id))
  );
}

function buildPairKey(userA: string, userB: string) {
  const [first, second] = userA < userB ? [userA, userB] : [userB, userA];
  return `${first}:${second}`;
}

function buildGroupContext(group: MatchingGroup): GroupContext {
  const persona = getDominantRecognizedPersona(group.entries);
  const timeInCanada =
    getMostCommonValue(group.entries.map(entry => entry.time_in_canada)) ||
    group.entries[0].time_in_canada;
  const goal = getMostCommonValue(
    group.entries.map(entry => entry.goal).filter(Boolean) as string[]
  );
  const topics = getTopTopics(group.entries);
  const memberCount = group.entries.length;
  const matchedOn = {
    time_in_canada: Boolean(timeInCanada),
    persona: Boolean(persona),
    goal: Boolean(goal),
    topics_count: topics.length,
  };

  return {
    poolKey: buildPoolKey(persona, timeInCanada),
    persona,
    timeInCanada,
    goal: goal || null,
    topics,
    matchMetadata: {
      version: 2,
      forced_placement: group.forcedPlacement,
      placement_reason: group.forcedPlacement
        ? 'deadline_reached'
        : 'tiered_match',
      matched_on: matchedOn,
      member_count: memberCount,
    },
  };
}

function getDominantRecognizedPersona(entries: WaitlistRow[]) {
  return (
    getMostCommonValue(
      entries
        .map(entry => entry.persona)
        .filter((persona): persona is string => isRecognizedPersona(persona))
    ) || null
  );
}

function getMostCommonValue(values: string[]) {
  if (!values.length) {
    return null;
  }

  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function getTopTopics(entries: WaitlistRow[]) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const topic of normalizeTopics(entry.topics)) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);
}

async function createCircleForGroup(
  supabase: SupabaseClient,
  group: MatchingGroup
) {
  const context = buildGroupContext(group);
  const memberIds = group.entries.map(entry => entry.user_id);
  const notificationBody = group.forcedPlacement
    ? FORCED_PLACEMENT_BODY
    : STANDARD_MATCH_BODY;
  const templateKey = group.forcedPlacement
    ? 'circleMatchedForced'
    : 'circleMatched';

  const { data, error } = await supabase.rpc('create_circle_match', {
    _pool_key: context.poolKey,
    _persona: context.persona,
    _time_in_canada: context.timeInCanada,
    _goal: context.goal,
    _topics: context.topics,
    _member_ids: memberIds,
    _match_metadata: context.matchMetadata,
    _notification_title: "You've been matched!",
    _notification_body: notificationBody,
    _welcome_message: WELCOME_MESSAGE,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create circle via RPC');
  }

  const circleId = data as string;

  // The RPC stores English copy and `{ circle_id }` as the payload. Re-write
  // `data` with the structured i18n key so the app can render the row in the
  // member's language; `circle_id` is preserved because the delivery update
  // below (and the client's navigation) filter on it.
  const { error: i18nError } = await supabase
    .from('community_notifications')
    .update({
      data: { circle_id: circleId, i18n: buildI18n(templateKey) },
    })
    .eq('type', 'circle_matched')
    .filter('data->>circle_id', 'eq', circleId);

  if (i18nError) {
    console.error(
      'matchmake-circles: failed to attach i18n payload to notifications',
      i18nError
    );
  }

  const languages = await getPreferredLanguages(
    supabase as unknown as NotificationLanguageSource,
    memberIds
  );
  const textByUser = new Map<string, RenderedNotification>();
  for (const [userId, lang] of languages) {
    const rendered = render(templateKey, lang);
    if (rendered) textByUser.set(userId, rendered);
  }

  const deliveredUserIds = await sendPushNotifications(
    supabase,
    memberIds,
    "You've been matched!",
    notificationBody,
    { type: 'circle_matched', circle_id: circleId },
    textByUser
  );

  if (deliveredUserIds.size > 0) {
    const nowIso = new Date().toISOString();
    const { error: deliveredError } = await supabase
      .from('community_notifications')
      .update({ delivered: true, delivered_at: nowIso })
      .in('user_id', [...deliveredUserIds])
      .eq('type', 'circle_matched')
      .filter('data->>circle_id', 'eq', circleId)
      .eq('delivered', false);

    if (deliveredError) {
      console.error(
        'matchmake-circles: failed to mark notifications delivered',
        deliveredError
      );
    }
  }

  return circleId;
}

async function closeExpiredCircles(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('community_circles')
    .select('id, status')
    .eq('status', 'active')
    .lte('ends_at', nowIso);

  if (error) {
    console.error('Failed to fetch expiring circles', error);
    return 0;
  }

  if (!data?.length) {
    return 0;
  }

  const circleIds = data.map(circle => circle.id as string);

  const { error: updateError } = await supabase
    .from('community_circles')
    .update({ status: 'ended' })
    .in('id', circleIds);

  if (updateError) {
    console.error('Failed to mark circles as ended', updateError);
  }

  const closingRows = circleIds.map(circleId => ({
    circle_id: circleId,
    sender_user_id: null,
    content: CLOSING_MESSAGE,
    message_type: 'system_notice',
    metadata: { kind: 'circle_ended' },
    dedupe_key: 'system:circle-ended',
  }));

  const { error: messageError } = await supabase
    .from('community_messages')
    .upsert(closingRows, {
      onConflict: 'circle_id,dedupe_key',
      ignoreDuplicates: true,
    });

  if (messageError) {
    console.error('Failed to insert closing message', messageError);
  }

  const { data: members, error: membersError } = await supabase
    .from('community_circle_members')
    .select('circle_id,user_id,left_at')
    .in('circle_id', circleIds);

  if (membersError) {
    console.error('Failed to fetch members for closeout', membersError);
    return circleIds.length;
  }

  const activeMembers =
    members?.filter(member => member.left_at === null) ?? [];

  if (activeMembers.length > 0) {
    const { error: notificationError } = await supabase
      .from('community_notifications')
      .insert(
        activeMembers.map(member => ({
          user_id: member.user_id,
          type: 'circle_ended',
          title: 'Your circle has wrapped up',
          body: 'Say thanks, follow one another, and keep the support going.',
          data: {
            circle_id: member.circle_id,
            i18n: buildI18n('circleEnded'),
          },
        }))
      );

    if (notificationError) {
      console.error(
        'Failed to insert circle ended notifications',
        notificationError
      );
    }
  }

  return circleIds.length;
}

async function sendDay13Reminders(supabase: SupabaseClient) {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + DAY_IN_MS);

  const { data, error } = await supabase
    .from('community_circles')
    .select('id')
    .eq('status', 'active')
    .eq('day_13_reminder_sent', false)
    .lte('ends_at', in24Hours.toISOString())
    .gt('ends_at', now.toISOString());

  if (error) {
    console.error('Failed to fetch circles needing Day 13 reminder', error);
    return 0;
  }

  if (!data?.length) {
    return 0;
  }

  const circleIds = data.map(circle => circle.id as string);

  const { data: members, error: membersError } = await supabase
    .from('community_circle_members')
    .select('circle_id,user_id,left_at')
    .in('circle_id', circleIds);

  if (membersError) {
    console.error('Failed to fetch members for Day 13 reminder', membersError);
    return 0;
  }

  const activeMembers =
    members?.filter(member => member.left_at === null) ?? [];

  if (activeMembers.length > 0) {
    const { error: notificationError } = await supabase
      .from('community_notifications')
      .insert(
        activeMembers.map(member => ({
          user_id: member.user_id,
          type: 'circle_ending_soon',
          title: 'One day left in your circle',
          body: DAY_13_REMINDER_MESSAGE,
          data: {
            circle_id: member.circle_id,
            i18n: buildI18n('circleEndingSoon'),
          },
        }))
      );

    if (notificationError) {
      console.error(
        'Failed to insert Day 13 reminder notifications',
        notificationError
      );
      return 0;
    }
  }

  const { error: updateError } = await supabase
    .from('community_circles')
    .update({ day_13_reminder_sent: true })
    .in('id', circleIds);

  if (updateError) {
    console.error('Failed to mark circles as reminder sent', updateError);
  }

  return circleIds.length;
}

async function sendDailyPrompts(supabase: SupabaseClient) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const { data: circles, error } = await supabase
    .from('community_circles')
    .select('id, created_at, goal, topics')
    .eq('status', 'active');

  if (error) {
    console.error('Failed to fetch circles for daily prompts', error);
    return 0;
  }

  if (!circles?.length) {
    return 0;
  }

  let promptsSent = 0;

  for (const circle of circles as CirclePromptRow[]) {
    const prompt = selectDailyPrompt(circle, todayKey);

    const { error: messageError } = await supabase
      .from('community_messages')
      .insert({
        circle_id: circle.id,
        sender_user_id: null,
        content: prompt.content,
        message_type: 'daily_prompt',
        metadata: {
          day_number: prompt.dayNumber,
          prompt_source: prompt.source,
          prompt_key: prompt.key,
          prompt_date: todayKey,
        },
        dedupe_key: `daily-prompt:${todayKey}`,
      });

    if (messageError) {
      if (messageError.code === '23505') {
        continue;
      }

      console.error('Failed to insert daily prompt', messageError);
      continue;
    }

    promptsSent += 1;
  }

  return promptsSent;
}

function selectDailyPrompt(circle: CirclePromptRow, todayKey: string) {
  const goal = circle.goal || '';
  const topics = normalizeTopics(circle.topics);
  const dayNumber =
    Math.floor(
      (new Date(todayKey).getTime() - new Date(circle.created_at).getTime()) /
        DAY_IN_MS
    ) + 1;

  for (const topic of topics) {
    const topicPrompts = DAILY_PROMPT_LIBRARY.topic[topic];
    if (topicPrompts?.length) {
      return {
        content: topicPrompts[(dayNumber - 1) % topicPrompts.length],
        source: 'topic',
        key: topic,
        dayNumber: Math.max(1, dayNumber),
      };
    }
  }

  const goalPrompts = DAILY_PROMPT_LIBRARY.goal[goal];
  if (goalPrompts?.length) {
    return {
      content: goalPrompts[(dayNumber - 1) % goalPrompts.length],
      source: 'goal',
      key: goal,
      dayNumber: Math.max(1, dayNumber),
    };
  }

  return {
    content:
      DAILY_PROMPT_LIBRARY.fallback[
        (Math.max(1, dayNumber) - 1) % DAILY_PROMPT_LIBRARY.fallback.length
      ],
    source: 'fallback',
    key: 'fallback',
    dayNumber: Math.max(1, dayNumber),
  };
}

async function deleteEndedCircles(supabase: SupabaseClient) {
  const gracePeriodAgo = new Date(
    Date.now() - DELETE_ENDED_CIRCLES_GRACE_PERIOD_MS
  );

  const { data, error } = await supabase
    .from('community_circles')
    .select('id')
    .eq('status', 'ended')
    .lt('ends_at', gracePeriodAgo.toISOString());

  if (error) {
    console.error('Failed to fetch circles for deletion', error);
    return 0;
  }

  if (!data?.length) {
    return 0;
  }

  const circleIds = data.map(circle => circle.id as string);

  const { data: deletedCount, error: deleteError } = await supabase.rpc(
    'delete_expired_community_circles',
    {
      _circle_ids: circleIds,
    }
  );

  if (deleteError) {
    console.error('Failed to delete ended circles atomically', deleteError);
    return 0;
  }

  return Number(deletedCount) || 0;
}

async function sendPushNotifications(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  /** Per-recipient localized copy; `title`/`body` are the English fallback. */
  textByUser?: Map<string, RenderedNotification>
): Promise<Set<string>> {
  const deliveredUserIds = new Set<string>();
  if (!userIds.length) return deliveredUserIds;

  const { data: tokenRows, error } = await supabase
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', userIds);

  if (error) {
    console.error('Failed to fetch push tokens', error);
    return deliveredUserIds;
  }

  if (!tokenRows?.length) {
    return deliveredUserIds;
  }

  const messages = (tokenRows as Array<{ token: string; user_id: string }>).map(
    ({ token, user_id }) => {
      const localized = textByUser?.get(user_id);
      return {
        to: token,
        user_id,
        sound: 'default',
        title: localized?.title ?? title,
        body: localized?.body ?? body,
        data: data || {},
        channelId: 'circles',
        priority: 'high',
      };
    }
  );

  const batchSize = 100;
  const timeoutMs = 5000;
  const staleTokens: string[] = [];

  for (let index = 0; index < messages.length; index += batchSize) {
    const batch = messages.slice(index, index + batchSize);
    // Strip user_id from the wire payload — Expo only accepts known fields
    const expoBatch = batch.map(({ user_id: _omit, ...msg }) => msg);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const pushHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      if (expoToken) {
        pushHeaders['Authorization'] = `Bearer ${expoToken}`;
      }
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: pushHeaders,
        body: JSON.stringify(expoBatch),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error(
          'Failed to send push notifications batch',
          index,
          await response.text()
        );
      } else {
        // Parse push tickets per-message to track per-user delivery
        const result = await response.json();
        if (Array.isArray(result?.data)) {
          for (let j = 0; j < result.data.length; j++) {
            const ticket = result.data[j];
            if (ticket.status === 'error') {
              console.error(
                'matchmake-circles: ticket error',
                ticket.message,
                ticket.details
              );
              if (ticket.details?.error === 'DeviceNotRegistered') {
                staleTokens.push(batch[j].to);
              }
            } else {
              deliveredUserIds.add(batch[j].user_id);
            }
          }
        } else {
          // Anomalous Expo response — 200 OK but no ticket array. Don't mark
          // anyone delivered (we can't prove the push reached APN/FCM); log
          // the raw payload so we can diagnose if this becomes recurring.
          console.warn(
            'matchmake-circles: Expo response missing data array',
            JSON.stringify(result).slice(0, 500)
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Push notification batch timed out', index);
      } else {
        console.error('Push notification batch error', index, error);
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
        'matchmake-circles: failed to delete stale tokens',
        deleteError
      );
    } else {
      console.log(
        `matchmake-circles: cleaned ${staleTokens.length} stale token(s)`
      );
    }
  }

  return deliveredUserIds;
}
