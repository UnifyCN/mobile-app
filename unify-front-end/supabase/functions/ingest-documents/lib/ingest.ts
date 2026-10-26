import {
  EMBEDDING_CONTRACT,
  EMBEDDING_MODEL,
  EmbeddingError,
} from '../../_shared/embeddings.ts';
import {
  BackstopError,
  BATCH_START_MS,
  Budget,
  MAX_SENDS_PER_INVOCATION,
  PROVIDER_TIMEOUT_MS,
  realTimers,
  WORK_DEADLINE_MS,
} from './budget.ts';
import { chunkText } from './chunker.ts';
import {
  MAX_CHUNK_METADATA_BYTES,
  MAX_CHUNK_TEXT_BYTES,
  MAX_EMBEDDING_RESPONSE_BYTES,
  MAX_GENERATION_CHUNKS,
  MAX_JOB_PAYLOAD_BYTES,
  MAX_SOURCE_FILE_BYTES,
  ResourceLimitError,
} from './limits.ts';
import {
  chunkMetadata,
  documentMetadata,
  newestPublishedAt,
  publishedAt,
  recordChunkMetadata,
} from './metadata.ts';
import { extractDateModified } from './pageDates.ts';
import type { CrawlSource } from './pickDueSources.ts';
import { loadSourceRecords } from './records.ts';
import { sourceConfig, StoreCallError } from './supabaseStore.ts';
import { computeContentHash, htmlToCleanText, isQualityChunk } from './text.ts';
import type {
  CallOptions,
  ChunkMetadataGroup,
  IngestDeps,
  JobSummary,
  Metadata,
  OpenJob,
  SourceResult,
  StopReason,
} from './types.ts';

export const EMBEDDING_BATCH_SIZE = 20;
/**
 * How long a claim lasts without progress. Each reserve and stage renews it,
 * so only a stalled or stopped call loses it. Then the next call may take the
 * source and continue its open job.
 */
export const LEASE_SECONDS = 300;
export const SOURCE_BUSY = 'Another call is refreshing this source';
const MIN_CONTENT_CHARS = 100;

/**
 * What is known about one source's work so far. The handler reads it to
 * answer at the backstop while a call is still in flight.
 */
export interface Progress {
  source_id: number;
  started: boolean;
  finished: boolean;
  job_id: string | null;
  operation_id: string | null;
  fingerprint: string | null;
  total: number | null;
  staged: number | null;
  remaining: number | null;
  reserved: number | null;
  cap: number | null;
  /** A database call is in flight. */
  rpcInFlight: boolean;
  /** A database call ended without an answer: it may have committed. */
  unknown: boolean;
  /** The counts were read back after an unknown outcome. */
  statusRead: boolean;
  /** Provider requests this source started. */
  sends: number;
}

export function newProgress(sourceId: number): Progress {
  return {
    source_id: sourceId,
    started: false,
    finished: false,
    job_id: null,
    operation_id: null,
    fingerprint: null,
    total: null,
    staged: null,
    remaining: null,
    reserved: null,
    cap: null,
    rpcInFlight: false,
    unknown: false,
    statusRead: false,
    sends: 0,
  };
}

/** One source's place in an invocation. */
export interface SourceRun {
  budget: Budget;
  /** Elapsed milliseconds at which this source's work share ends. */
  shareEndsAt: number;
  /** Provider requests this source may start. */
  sendLimit: number;
  progress: Progress;
}

interface Attempt {
  /** The fetch time, the chunk write time and the source's last-attempt stamp. */
  now: string;
  /** This call's claim on the source. */
  token: string;
  /** Budget time when the source started, for durations. */
  startedAt: number;
}

/**
 * A source's outcome, and whether the database already wrote its one
 * terminal crawl_logs row (promotion and the job's terminal errors do).
 */
interface Outcome {
  result: SourceResult;
  logged: boolean;
}

/** Work stopped for a fixed reason; the job, if any, stays open. */
class Stop extends Error {
  constructor(
    readonly reason: StopReason,
    message?: string
  ) {
    super(message ?? reason);
    this.name = 'Stop';
  }
}

/** Fixed text for a job that closed without promoting. */
const CLOSED_JOB_ERRORS: Record<string, string> = {
  request_cap: 'Embedding request cap reached',
  configuration_changed: 'Source configuration changed',
  contract_rejected: 'Embedding response failed the contract check',
  newer_generation: 'A newer generation is already published',
  superseded: 'The generation was superseded',
  model_changed: 'The embedding model changed',
};
/** Terminal reasons whose crawl_logs row the database wrote. */
const LOGGED_REASONS = new Set([
  'request_cap',
  'configuration_changed',
  'contract_rejected',
]);

/**
 * Refreshes one stored source: claims it, stamps the attempt, fetches it, and
 * either refreshes the dates of unchanged content or publishes the changed
 * generation through a durable job. Called alone, it has a whole invocation's
 * budget to itself.
 */
export async function ingestSource(
  source: CrawlSource,
  deps: IngestDeps,
  given?: SourceRun
): Promise<SourceResult> {
  const budget = given ? null : new Budget(deps.timers ?? realTimers);
  const run = given ?? {
    budget: budget!,
    shareEndsAt: WORK_DEADLINE_MS,
    sendLimit: MAX_SENDS_PER_INVOCATION,
    progress: newProgress(source.id),
  };
  try {
    return await serveSource(source, deps, run, null);
  } finally {
    budget?.dispose();
  }
}

/**
 * Continues a source's open job under a new claim: no fetch and no attempt
 * stamp, only reservations, stages and the promotion.
 */
export async function continueJob(
  source: CrawlSource,
  job: OpenJob,
  deps: IngestDeps,
  run: SourceRun
): Promise<SourceResult> {
  return await serveSource(source, deps, run, job.job_id);
}

async function serveSource(
  source: CrawlSource,
  deps: IngestDeps,
  run: SourceRun,
  continuing: string | null
): Promise<SourceResult> {
  const { store } = deps;
  const { budget, progress } = run;
  progress.started = true;
  const startedAt = budget.elapsed();
  const attemptedAt = deps.now().toISOString();
  const token = await call(run, c =>
    store.claimSource(source.id, LEASE_SECONDS, EMBEDDING_MODEL, c)
  );
  if (token === null) {
    // The other call stamps and logs its own attempt.
    const busy: SourceResult = {
      source_id: source.id,
      status: 'skipped',
      error: SOURCE_BUSY,
    };
    await log(run, deps, source, busy, startedAt);
    progress.finished = true;
    return busy;
  }

  let outcome: Outcome;
  try {
    const attempt = { now: attemptedAt, token, startedAt };
    if (continuing === null) {
      // Stored before any external call, so a call that stalls or is stopped
      // still moves the source behind the others in the due queue. If the
      // stamp fails, the crawl does not start and the lease is released below.
      await call(run, c => store.recordAttempt(source.id, attemptedAt, c));
    }
    try {
      if (continuing !== null) {
        outcome = await resumeJob(deps, run, source, attempt, continuing);
      } else if (source.source_kind === 'html' || source.source_kind === undefined) {
        outcome = await crawlHtml(source, deps, run, attempt);
      } else {
        outcome = await crawlRecords(source, deps, run, attempt);
      }
    } catch (error) {
      outcome = await stopped(deps, run, source, error);
    }
  } finally {
    // Best effort: an unreleased lease expires on its own. Never after the
    // backstop.
    if (!budget.closed) {
      await rpc(run, c => store.releaseSource(source.id, token, c)).catch(
        error => console.error(`Lease release failed for ${source.url}: ${error}`)
      );
    }
  }
  if (!outcome.logged && outcome.result.status !== 'pending') {
    await log(run, deps, source, outcome.result, startedAt);
  }
  progress.finished = true;
  return outcome.result;
}

/** One crawl_logs row, best effort, never after the backstop. */
async function log(
  run: SourceRun,
  deps: IngestDeps,
  source: CrawlSource,
  result: SourceResult,
  startedAt: number
): Promise<void> {
  if (run.budget.closed || result.status === 'pending') return;
  const status = result.status;
  await rpc(run, c =>
    deps.store.logCrawl(
      {
        crawl_source_id: source.id,
        url: source.url,
        status,
        content_changed: status === 'success',
        chunks_created: result.chunks_created ?? 0,
        error_message: result.error,
        duration_ms: Math.round(run.budget.elapsed() - startedAt),
      },
      c
    )
  ).catch(error => console.error(`crawl_logs insert failed: ${error}`));
}

/**
 * One database call that starts new work: refused, like any other work, once
 * the work deadline or the source's share has passed.
 */
async function call<T>(
  run: SourceRun,
  f: (call: CallOptions) => Promise<T>
): Promise<T> {
  assertWork(run);
  return await rpc(run, f);
}

/**
 * One database call: refused after the backstop, its wait bounded by the
 * remaining response time and 15 seconds. A call that ends without an answer
 * marks the source's outcome unknown. Without the work check it is only for
 * cleanup, status reads and storing the answer of a provider call already
 * made.
 */
async function rpc<T>(
  run: SourceRun,
  f: (call: CallOptions) => Promise<T>
): Promise<T> {
  run.budget.assertOpen();
  const scoped = run.budget.rpcSignal();
  run.progress.rpcInFlight = true;
  try {
    return await f({ signal: scoped.signal });
  } catch (error) {
    if (error instanceof StoreCallError && error.unknown) {
      run.progress.unknown = true;
    }
    throw error;
  } finally {
    run.progress.rpcInFlight = false;
    scoped.dispose();
  }
}

function shareLeft(run: SourceRun): number {
  return Math.min(
    run.budget.workLeft(),
    Math.min(run.shareEndsAt, WORK_DEADLINE_MS) - run.budget.elapsed()
  );
}

function workStop(run: SourceRun): StopReason {
  if (run.budget.closed) return 'response_backstop';
  return run.shareEndsAt >= WORK_DEADLINE_MS || run.budget.workLeft() <= 0
    ? 'work_deadline'
    : 'source_budget';
}

/** Throws a Stop unless new work may start with `need` ms of share left. */
function assertWork(run: SourceRun, need = 1): void {
  run.budget.assertOpen();
  if (shareLeft(run) < need) throw new Stop(workStop(run));
}

/** Runs a fetch and conversion under the source share's signal. */
async function fetchWithin<T>(
  run: SourceRun,
  f: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  assertWork(run);
  const scoped = run.budget.workSignal(run.shareEndsAt);
  try {
    const value = await f(scoped.signal);
    if (scoped.signal.aborted) throw new Stop(workStop(run));
    return value;
  } catch (error) {
    if (scoped.signal.aborted) throw new Stop(workStop(run));
    throw error;
  } finally {
    scoped.dispose();
  }
}

/**
 * Unchanged content: one database transaction checks the fetched
 * configuration, refreshes the dates and, only when that refresh ran,
 * supersedes the source's open job (it holds other text and must never
 * promote over this verified version).
 */
async function refreshUnchanged(
  run: SourceRun,
  deps: IngestDeps,
  source: CrawlSource,
  attempt: Attempt,
  input: { contentHash: string; documentPatch: Metadata; chunkGroups: ChunkMetadataGroup[] }
): Promise<boolean> {
  return await call(run, c =>
    deps.store.refreshUnchanged(
      {
        ...writer(attempt),
        sourceId: source.id,
        sourceConfig: sourceConfig(source),
        ...input,
      },
      c
    )
  );
}

async function crawlHtml(
  source: CrawlSource,
  deps: IngestDeps,
  run: SourceRun,
  attempt: Attempt
): Promise<Outcome> {
  const { store } = deps;
  const { now } = attempt;
  const html = await fetchWithin(run, signal =>
    deps.fetchPage(source.url, { signal, maxBytes: MAX_SOURCE_FILE_BYTES })
  );
  if (utf8Bytes(html) > MAX_SOURCE_FILE_BYTES) {
    throw new ResourceLimitError('file size');
  }
  const cleanText = htmlToCleanText(html);
  if (cleanText.length < MIN_CONTENT_CHARS) {
    throw new Error('Empty or minimal content after HTML parsing');
  }
  const contentHash = await computeContentHash(cleanText);
  const existing = await call(run, c => store.findDocument(source.url, c));
  const stamp = {
    fetchedAt: now,
    dateModified: extractDateModified(html),
    province: source.province,
  };

  if (
    existing &&
    existing.contentHash === contentHash &&
    existing.embeddingModel === EMBEDDING_MODEL &&
    (await refreshUnchanged(run, deps, source, attempt, {
      contentHash,
      documentPatch: {
        fetched_at: stamp.fetchedAt,
        published_at: publishedAt(stamp),
        province: stamp.province,
      },
      chunkGroups: [{ metadata: chunkMetadata(stamp), indexes: null }],
    }))
  ) {
    return { result: { source_id: source.id, status: 'skipped' }, logged: false };
  }

  const rawChunks = chunkText(cleanText);
  const chunks = rawChunks.filter(isQualityChunk);
  if (chunks.length === 0) {
    throw new Error(
      `No quality chunks (${rawChunks.length} raw chunks all filtered)`
    );
  }
  assertTextLimits(chunks);

  return await replaceChunks(deps, run, {
    source,
    attempt,
    contentHash,
    document: {
      title: cleanText.split('\n')[0].slice(0, 200) || source.url,
      metadata: documentMetadata(stamp, {
        wordCount: cleanText.split(/\s+/).length,
        chunkCount: chunks.length,
      }),
    },
    chunks: chunks.map(text => ({ text, metadata: chunkMetadata(stamp) })),
  });
}

/**
 * A source whose official JSON gives one record per fact. Each record is one
 * chunk with its own dates. Records skip the prose chunker and the prose
 * quality filter, which would drop short valid facts.
 */
async function crawlRecords(
  source: CrawlSource,
  deps: IngestDeps,
  run: SourceRun,
  attempt: Attempt
): Promise<Outcome> {
  const { store } = deps;
  const { now } = attempt;
  const records = await fetchWithin(run, signal =>
    loadSourceRecords(source, deps.fetchPage, new Date(now), { signal })
  );
  // Only the newsroom can be validly empty: a readable feed with no item in
  // the last 30 days. Its expired items must then leave the knowledge base.
  // The converters throw on a broken file, so the previous content stays.
  if (records.length === 0 && source.source_kind !== 'ircc_newsroom') {
    throw new Error('No records in the source');
  }
  assertTextLimits(records.map(r => r.text));
  // Dates are not hashed: a changed date alone refreshes metadata without
  // embedding again.
  const contentHash = await computeContentHash(
    records.map(r => r.text).join('\n')
  );
  const existing = await call(run, c => store.findDocument(source.url, c));
  const stamp = { fetchedAt: now, province: source.province };
  const chunks = records.map(record => ({
    text: record.text,
    metadata: recordChunkMetadata(stamp, record),
  }));
  const documentPatch = {
    fetched_at: now,
    published_at: newestPublishedAt(now, records),
    province: source.province,
  };

  if (
    existing &&
    existing.contentHash === contentHash &&
    existing.embeddingModel === EMBEDDING_MODEL &&
    (await refreshUnchanged(run, deps, source, attempt, {
      contentHash,
      documentPatch,
      chunkGroups:
        chunks.length === 0
          ? [{ metadata: {}, indexes: [] }]
          : groupByMetadata(chunks.map(chunk => chunk.metadata)),
    }))
  ) {
    return { result: { source_id: source.id, status: 'skipped' }, logged: false };
  }

  return await replaceChunks(deps, run, {
    source,
    attempt,
    contentHash,
    document: {
      title: source.label ?? source.url,
      metadata: {
        word_count: records.reduce(
          (sum, r) => sum + r.text.split(/\s+/).length,
          0
        ),
        chunk_count: records.length,
        source: 'crawler',
        ...documentPatch,
      },
    },
    chunks,
  });
}

/**
 * Record indexes that share one metadata value travel together. A source has a
 * handful of distinct dates, not one per record.
 */
function groupByMetadata(metadata: Metadata[]): ChunkMetadataGroup[] {
  const groups = new Map<string, { metadata: Metadata; indexes: number[] }>();
  metadata.forEach((value, index) => {
    const key = JSON.stringify(value);
    const group = groups.get(key) ?? { metadata: value, indexes: [] };
    group.indexes.push(index);
    groups.set(key, group);
  });
  return [...groups.values()];
}

interface ReplaceInput {
  source: CrawlSource;
  attempt: Attempt;
  contentHash: string;
  document: { title: string; metadata: Metadata };
  chunks: Array<{ text: string; metadata: Metadata }>;
}

/**
 * Freezes the complete chunk set in a durable job, embeds it batch by batch
 * (each provider call reserved in the database first, at most 20 inputs), and
 * promotes the whole generation in one database transaction. Until then
 * readers see only the previous version, and a later call can continue the
 * same job under a new lease.
 */
async function replaceChunks(
  deps: IngestDeps,
  run: SourceRun,
  { source, attempt, contentHash, document, chunks }: ReplaceInput
): Promise<Outcome> {
  const rows = chunks.map((chunk, index) => ({
    chunk_index: index,
    chunk_text: chunk.text,
    metadata: chunk.metadata,
  }));
  assertPayloadLimits(document, rows);
  assertWork(run);
  const operationId = crypto.randomUUID();
  run.progress.operation_id = operationId;
  const job = await call(run, c =>
    deps.store.openGeneration(
      {
        ...writer(attempt),
        operationId,
        sourceId: source.id,
        sourceConfig: sourceConfig(source),
        contentHash,
        title: document.title,
        documentMetadata: document.metadata,
        fetchedAt: attempt.now,
        rows,
      },
      c
    )
  );
  return await runJob(deps, run, source, attempt, note(run, job));
}

async function resumeJob(
  deps: IngestDeps,
  run: SourceRun,
  source: CrawlSource,
  attempt: Attempt,
  jobId: string
): Promise<Outcome> {
  run.progress.job_id = jobId;
  const served = await call(run, c =>
    deps.store.beginService({ ...writer(attempt), jobId }, c)
  );
  return await runJob(deps, run, source, attempt, note(run, served));
}

const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

/** Refuses, never truncates, a generation with too many or too long texts. */
function assertTextLimits(texts: string[]): void {
  if (texts.length > MAX_GENERATION_CHUNKS) {
    throw new ResourceLimitError('record count');
  }
  if (texts.some(text => utf8Bytes(text) > MAX_CHUNK_TEXT_BYTES)) {
    throw new ResourceLimitError('chunk text size');
  }
}

/** The database checks the same limits again. */
function assertPayloadLimits(
  document: { title: string; metadata: Metadata },
  rows: Array<{ chunk_index: number; chunk_text: string; metadata: Metadata }>
): void {
  if (utf8Bytes(document.title) > MAX_CHUNK_TEXT_BYTES) {
    throw new ResourceLimitError('title size');
  }
  if (
    utf8Bytes(JSON.stringify(document.metadata)) > MAX_CHUNK_METADATA_BYTES ||
    rows.some(
      row => utf8Bytes(JSON.stringify(row.metadata)) > MAX_CHUNK_METADATA_BYTES
    )
  ) {
    throw new ResourceLimitError('metadata size');
  }
  if (utf8Bytes(JSON.stringify(rows)) > MAX_JOB_PAYLOAD_BYTES) {
    throw new ResourceLimitError('payload size');
  }
}

function writer(attempt: Attempt) {
  return {
    token: attempt.token,
    embeddingModel: EMBEDDING_MODEL,
    contract: EMBEDDING_CONTRACT,
  };
}

/** Records what the database said about the job. */
function note<T extends JobSummary>(run: SourceRun, summary: T): T {
  const p = run.progress;
  p.job_id = summary.job_id;
  p.operation_id = summary.operation_id ?? p.operation_id;
  p.fingerprint = summary.fingerprint;
  p.total = summary.total;
  p.staged = summary.staged;
  p.remaining = summary.remaining;
  p.reserved = summary.reserved;
  p.cap = summary.cap;
  return summary;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function runJob(
  deps: IngestDeps,
  run: SourceRun,
  source: CrawlSource,
  attempt: Attempt,
  opened: JobSummary
): Promise<Outcome> {
  const { store } = deps;
  const { budget, progress } = run;
  const jobId = opened.job_id;
  let state: JobSummary = opened;
  while (state.status === 'open' && state.remaining !== 0) {
    if (
      budget.sends >= MAX_SENDS_PER_INVOCATION ||
      progress.sends >= run.sendLimit
    ) {
      throw new Stop('send_limit');
    }
    assertWork(run, BATCH_START_MS);
    const requestId = crypto.randomUUID();
    const batch = note(
      run,
      await call(run, c =>
        store.reserveBatch({ ...writer(attempt), requestId, jobId }, c)
      )
    );
    state = batch;
    if (batch.rows.length === 0) {
      if (batch.status === 'open' && batch.remaining !== 0) {
        throw new Error('No rows were reserved for a pending generation');
      }
      continue;
    }
    const texts = batch.rows.map(row => row.chunk_text);
    // Counted immediately before the request, whatever its outcome.
    assertWork(run);
    budget.sends++;
    progress.sends++;
    const scoped = budget.workSignal(run.shareEndsAt);
    let checked;
    try {
      checked = await deps.embedChecked(texts, {
        signal: scoped.signal,
        retries: 0,
        timeoutMs: Math.max(1, Math.min(PROVIDER_TIMEOUT_MS, shareLeft(run))),
        maxResponseBytes: MAX_EMBEDDING_RESPONSE_BYTES,
      });
    } catch (error) {
      if (scoped.signal.aborted) throw new Stop(workStop(run));
      if (error instanceof EmbeddingError && error.category === 'response') {
        // The answer broke the contract: the job fails, its old document stays.
        const rejected = note(
          run,
          await rpc(run, c =>
            store.rejectBatch(
              {
                ...writer(attempt),
                jobId,
                requestId,
                error: error.message,
                durationMs: Math.round(budget.elapsed() - attempt.startedAt),
              },
              c
            )
          )
        );
        return closedOutcome(source, rejected, error.message);
      }
      const message = error instanceof Error ? error.message : 'Embedding failed';
      throw new Stop('provider_error', message);
    } finally {
      scoped.dispose();
    }
    const { vectors, receipt } = checked;
    if (vectors.length !== batch.rows.length) {
      throw new Error(
        `Embedding returned ${vectors.length} of ${batch.rows.length} vectors`
      );
    }
    const hashes = await Promise.all(texts.map(sha256Hex));
    if (hashes.some((hash, i) => hash !== batch.rows[i].text_sha256)) {
      throw new Error('A reserved text does not match its stored hash');
    }
    state = note(
      run,
      await rpc(run, c =>
        store.stageBatch(
          {
            ...writer(attempt),
            requestId,
            jobId,
            receipt,
            rows: batch.rows.map((row, i) => ({
              chunk_index: row.chunk_index,
              text_sha256: row.text_sha256,
              embedding: vectors[i],
            })),
          },
          c
        )
      )
    );
  }
  if (state.status === 'open') {
    state = note(
      run,
      await call(run, c =>
        store.promoteJob(
          {
            ...writer(attempt),
            jobId,
            durationMs: Math.round(budget.elapsed() - attempt.startedAt),
          },
          c
        )
      )
    );
  }
  return closedOutcome(source, state);
}

/** The outcome of a job that is no longer open. */
function closedOutcome(
  source: CrawlSource,
  state: JobSummary,
  error?: string
): Outcome {
  if (state.status === 'promoted') {
    return {
      result: {
        source_id: source.id,
        status: 'success',
        chunks_created: state.total,
      },
      logged: true,
    };
  }
  const reason = state.terminal_reason ?? 'superseded';
  return {
    result: {
      source_id: source.id,
      status: 'error',
      error: error ?? CLOSED_JOB_ERRORS[reason] ?? 'The generation closed',
    },
    logged: LOGGED_REASONS.has(reason),
  };
}

/**
 * The outcome of a source whose work stopped early. With an open job, or an
 * open whose outcome is unknown, it is pending, with what the database said;
 * an unknown database outcome is read back first when time allows. Without a
 * job it is an error, as before.
 */
async function stopped(
  deps: IngestDeps,
  run: SourceRun,
  source: CrawlSource,
  error: unknown
): Promise<Outcome> {
  const { progress } = run;
  const message = error instanceof Error ? error.message : 'Crawl failed';
  // After an unknown outcome, or a refused write to an existing job, read the
  // job back (no lease needed) before reporting it.
  const storeFailure =
    !(error instanceof Stop) && !(error instanceof BackstopError);
  if (
    (progress.unknown || (storeFailure && progress.job_id !== null)) &&
    !run.budget.closed
  ) {
    const key = progress.job_id
      ? { jobId: progress.job_id }
      : progress.operation_id
        ? { operationId: progress.operation_id }
        : null;
    if (key) {
      try {
        const status = await rpc(run, c => deps.store.generationStatus(key, c));
        if (status.found) {
          note(run, status as JobSummary);
          progress.statusRead = true;
          if (status.status !== 'open') {
            return closedOutcome(
              source,
              status as JobSummary,
              progress.unknown ? undefined : message
            );
          }
        }
      } catch {
        // The read is best effort; the outcome stays as it is.
      }
    }
  }
  const reason: StopReason | null =
    error instanceof Stop
      ? error.reason
      : error instanceof BackstopError
        ? 'response_backstop'
        : progress.unknown
          ? 'unknown_outcome'
          : progress.job_id !== null
            ? 'store_error'
            : null;
  // An open whose outcome is unknown, and not found yet, may still commit: it
  // stays pending under its operation id until a later call finds out.
  const openUnknown =
    progress.unknown && progress.job_id === null && progress.operation_id !== null;
  if (reason === null || (progress.job_id === null && !openUnknown)) {
    console.error(`Crawl failed for ${source.url}: ${message}`);
    return {
      result: {
        source_id: source.id,
        status: 'error',
        error:
          error instanceof Stop && error.reason !== 'provider_error'
            ? 'The work deadline stopped the source before its job opened'
            : message,
      },
      logged: false,
    };
  }
  return { result: pendingResult(progress, reason, error), logged: false };
}

/** A pending result: every unknown value is null, never invented. */
export function pendingResult(
  progress: Progress,
  reason: StopReason,
  error?: unknown
): SourceResult {
  const message =
    error instanceof Stop
      ? error.message === error.reason
        ? undefined
        : error.message
      : error instanceof Error && !(error instanceof BackstopError)
        ? error.message
        : undefined;
  // A call in flight, or one that ended without an answer and was not read
  // back, may still change the counts: they are unknown, so null.
  const exact =
    !progress.rpcInFlight && (!progress.unknown || progress.statusRead);
  return {
    source_id: progress.source_id,
    status: 'pending',
    job_id: progress.job_id,
    operation_id: progress.operation_id,
    fingerprint: progress.fingerprint,
    total: progress.total,
    staged: exact ? progress.staged : null,
    remaining: exact ? progress.remaining : null,
    reserved: exact ? progress.reserved : null,
    cap: progress.cap,
    stop_reason: reason,
    unknown_outcome: progress.unknown || progress.rpcInFlight,
    ...(message ? { error: message } : {}),
  };
}
