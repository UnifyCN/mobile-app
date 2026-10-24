#!/usr/bin/env node
/* Read-only, live-backend loader measurements. No message sends or data writes. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');

const appRoot = path.resolve(__dirname, '../..');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const ts = appRequire('typescript');
appRequire('dotenv').config({ path: path.join(appRoot, '.env'), quiet: true });
const { createClient, processLock } = appRequire('@supabase/supabase-js');
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log(
    'node scripts/performance/mobile-data.cjs --output FILE [--samples 12] [--ref COMMIT] [--compare COMMIT --candidate COMMIT] [--credentials FILE]'
  );
  console.log(
    'The credential file contains an owned QA email and password on separate lines. Only GET, auth login, and the read-only metadata RPC are permitted.'
  );
  console.log(
    'All application modules come from immutable commits. The candidate defaults to HEAD. Uncommitted application edits are not measured.'
  );
  process.exit(0);
}
const output = option('--output');
if (!output) throw new Error('--output is required');
const samples = Number(option('--samples', '12'));
if (!Number.isInteger(samples) || samples < 1 || samples > 50)
  throw new Error('Use 1-50 samples');
const resolveCommit = value =>
  execFileSync('git', ['rev-parse', '--verify', `${value}^{commit}`], {
    cwd: appRoot,
    encoding: 'utf8',
  }).trim();
const checkoutHead = resolveCommit('HEAD');
const ref = option('--ref', null);
const compare = option('--compare', null);
if (ref && (compare || args.includes('--candidate')))
  throw new Error('--ref cannot be combined with --compare or --candidate');
const baselineRef = ref || compare ? resolveCommit(ref ?? compare) : null;
const candidateRef = ref
  ? null
  : resolveCommit(option('--candidate', checkoutHead));
const credentialPath = option(
  '--credentials',
  path.join(require('node:os').homedir(), '.unify-qa-account')
);
const [email, password] = fs
  .readFileSync(credentialPath, 'utf8')
  .trim()
  .split(/\r?\n/);
if (!email?.includes('@') || !password)
  throw new Error('Expected two credential lines');
let activeRequests = null;
const request = async (input, init = {}) => {
  const url = new URL(
    typeof input === 'string' ? input : (input.url ?? input.toString())
  );
  const method = (init.method ?? 'GET').toUpperCase();
  const allowedPost =
    url.pathname === '/auth/v1/token' ||
    (url.pathname === '/auth/v1/logout' &&
      url.searchParams.get('scope') === 'local') ||
    url.pathname === '/rest/v1/rpc/get_post_metadata_batch';
  if (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && allowedPost))
    throw new Error(`Write blocked: ${method} ${url.pathname}`);
  const rows = activeRequests;
  const started = performance.now();
  const entry = {
    path: url.pathname,
    method,
    start_ms: started,
    status: null,
    bytes: 0,
    rows: null,
  };
  if (rows) rows.push(entry);
  const response = await fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  const body = await response.clone().text();
  entry.ms = performance.now() - started;
  entry.status = response.status;
  entry.bytes = Buffer.byteLength(body);
  try {
    const json = JSON.parse(body);
    entry.rows = Array.isArray(json)
      ? json.length
      : Array.isArray(json?.result)
        ? json.result.length
        : json
          ? 1
          : 0;
  } catch {
    entry.rows = null;
  }
  return response;
};

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    global: { fetch: request },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: (name, timeout, fn) =>
        processLock(name, timeout > 0 ? -1 : timeout, fn),
    },
  }
);
const sanity = {
  async fetch(query, params = {}) {
    const project = process.env.EXPO_PUBLIC_SANITY_PROJECT_ID;
    const dataset = process.env.EXPO_PUBLIC_SANITY_DATASET;
    const url = new URL(
      `https://${project}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}`
    );
    url.searchParams.set('query', query);
    url.searchParams.set('perspective', 'published');
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(`$${key}`, JSON.stringify(value));
    const response = await request(url.toString());
    const data = await response.json();
    if (!response.ok || data.error)
      throw new Error(`Sanity query failed: HTTP ${response.status}`);
    return data.result;
  },
};

// Load the actual application modules, including an immutable git revision.
// Only the native client adapters are replaced with equivalent Node transports.
function loader(revision) {
  const modules = new Map();
  const sourceHashes = {};
  function load(filename) {
    let resolved = filename;
    if (!path.extname(resolved)) resolved += '.ts';
    if (modules.has(resolved)) return modules.get(resolved).exports;
    const relative = path.relative(appRoot, resolved).split(path.sep).join('/');
    const source = revision
      ? execFileSync(
          'git',
          ['show', `${revision}:unify-front-end/${relative}`],
          { cwd: appRoot, encoding: 'utf8' }
        )
      : fs.readFileSync(resolved, 'utf8');
    sourceHashes[relative] = crypto
      .createHash('sha256')
      .update(source)
      .digest('hex');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const mod = { exports: {} };
    modules.set(resolved, mod);
    const localRequire = name => {
      if (
        name === '@/lib/supabase' ||
        name === '@/services/progress/progressClient'
      )
        return { supabase, progressClient: supabase };
      const target = name.startsWith('@/')
        ? path.join(appRoot, name.slice(2))
        : name.startsWith('.')
          ? path.resolve(path.dirname(resolved), name)
          : null;
      if (
        target &&
        path.normalize(target) === path.join(appRoot, 'sanity-custom')
      )
        return { sanityClient: sanity };
      if (target && path.normalize(target) === path.join(appRoot, 'i18n'))
        return { __esModule: true, default: { language: 'en', t: key => key } };
      if (target) return load(target);
      return appRequire(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
      filename: resolved,
    })(localRequire, mod, mod.exports);
    return mod.exports;
  }
  const read = name => load(path.join(appRoot, name));
  read.sourceHashes = sourceHashes;
  return read;
}

const digest = value =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify(value, (key, v) =>
        key === 'last_updated' ? undefined : v
      )
    )
    .digest('hex');
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];

async function main() {
  const auth = await supabase.auth.signInWithPassword({ email, password });
  if (auth.error) throw new Error(`QA sign-in failed: ${auth.error.status}`);
  const userId = auth.data.user.id;
  const profileResponse = await supabase
    .from('user_onboarding_profiles')
    .select('persona,stage,province,arrival_date')
    .eq('id', userId)
    .single();
  if (profileResponse.error)
    throw new Error(`QA profile read failed: ${profileResponse.error.code}`);
  const profile = profileResponse.data;
  const discoveryTime = new Date();
  let checklistStage = null;
  const make = revision => {
    const load = loader(revision);
    const progress = load(
      'services/progress/cachedProgressService'
    ).cachedProgressService;
    const checklist = load(
      'services/checklist/getChecklistWithUserProgress'
    ).getChecklistWithUserProgress;
    const arrival = load('helpers/arrivalDate');
    const stageNumber = arrival.getArrivalStage(
      arrival.normalizeStoredArrivalDate(profile.arrival_date),
      discoveryTime
    );
    const stage = load('helpers/dateHelpers').stageNumberToStageSlug(
      stageNumber
    );
    checklistStage = { number: stageNumber, slug: stage };
    const groups = load(
      'services/groups/getAvailableGroups'
    ).getAvailableGroups;
    const events = load('services/events/getAllEvents').getAllEvents;
    const upcoming = load('helpers/eventHelpers').getUpcomingEventsSorted;
    const news = load('services/news/getAllNews').getAllNews;
    const conversations = load(
      'services/companion/getConversations'
    ).getConversations;
    const usage = load('services/companion/getChatbotUsage').getChatbotUsage;
    const feed = load('services/feeds/getForYouFeed').getForYouFeed;
    const clearBlocks = load(
      'services/users/getBlockedUserIds'
    ).invalidateBlockedUserIds;
    const flows = {
      'Learn progress': () => progress.refreshProgress(),
      'Checklist data': () =>
        checklist(userId, profile.persona, stage, {
          language: 'en',
          province: profile.province,
        }),
      'Community data': () =>
        Promise.all([
          groups(),
          events().then(rows => {
            const visible = upcoming(rows, discoveryTime);
            return { cards: visible.slice(0, 3), hasMore: visible.length > 3 };
          }),
          news(),
        ]),
      'Companion history and usage': () =>
        Promise.all([conversations(), usage()]),
      'Social first page': () => {
        clearBlocks();
        return feed(undefined, 20);
      },
    };
    return { flows, sourceHashes: load.sourceHashes };
  };
  const variants = compare
    ? [
        { name: 'before', ref: baselineRef },
        { name: 'after', ref: candidateRef },
      ]
    : [{ name: ref ? 'before' : 'after', ref: baselineRef ?? candidateRef }];
  for (const variant of variants) Object.assign(variant, make(variant.ref));
  const results = [];
  const flowNames = Object.keys(variants[0].flows);
  for (let round = -1; round < samples; round++) {
    // Alternate variant order to reduce backend/cache/connection order bias.
    for (const flow of flowNames)
      for (const variant of round % 2 ? [...variants].reverse() : variants) {
        activeRequests = [];
        const started = performance.now();
        const value = await variant.flows[flow]();
        const ms = performance.now() - started;
        const requests = activeRequests;
        activeRequests = null;
        if (
          requests.some(
            r => r.status === null || r.status < 200 || r.status >= 300
          )
        )
          throw new Error(`Failed request in ${flow}`);
        if (requests.length === 0)
          throw new Error(`Unexpected cache-only result in ${flow}`);
        const count = Array.isArray(value)
          ? ['Community data', 'Companion history and usage'].includes(flow)
            ? value.map(v =>
                Array.isArray(v) ? v.length : v.cards ? v.cards.length : 1
              )
            : value.length
          : value.posts
            ? value.posts.length
            : Object.keys(value).length;
        const row = {
          variant: variant.name,
          flow,
          round,
          ms,
          count,
          hash: digest(value),
          bytes: requests.reduce((n, r) => n + r.bytes, 0),
          requests: requests.map(r => ({
            ...r,
            start_ms: r.start_ms - started,
          })),
        };
        if (round >= 0) results.push(row);
        console.log(
          JSON.stringify({
            variant: variant.name,
            flow,
            round,
            ms: Math.round(ms),
            count,
            requests: requests.length,
          })
        );
      }
  }
  const summary = variants.flatMap(variant =>
    flowNames.map(flow => {
      const rows = results.filter(
        r => r.variant === variant.name && r.flow === flow
      );
      return {
        variant: variant.name,
        flow,
        samples: rows.length,
        p50_ms: percentile(
          rows.map(r => r.ms),
          0.5
        ),
        p95_ms: percentile(
          rows.map(r => r.ms),
          0.95
        ),
        hashes: [...new Set(rows.map(r => r.hash))],
        counts: [...new Set(rows.map(r => JSON.stringify(r.count)))],
        request_counts: [...new Set(rows.map(r => r.requests.length))],
      };
    })
  );
  const report = {
    measured_at: new Date().toISOString(),
    runtime: process.version,
    platform: process.platform,
    baseline_ref: baselineRef,
    candidate_ref: candidateRef,
    checkout_head: checkoutHead,
    runner_sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(__filename))
      .digest('hex'),
    scope:
      'Real app data loaders with Node transports and live hosted data. Not native rendering or device latency. One warmup per variant, alternating variant order, no application data writes.',
    fixture: {
      persona: profile.persona,
      stored_stage: profile.stage,
      checklist_stage: checklistStage,
      province: profile.province,
      discovery_time: discoveryTime.toISOString(),
    },
    source_hashes: variants.map(({ name, ref, sourceHashes }) => ({
      name,
      ref,
      files: sourceHashes,
    })),
    summary,
    results,
  };
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  await supabase.auth.signOut({ scope: 'local' });
}
main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => supabase.auth.stopAutoRefresh());
