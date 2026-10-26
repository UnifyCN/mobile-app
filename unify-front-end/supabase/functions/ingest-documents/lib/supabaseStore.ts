import { LEASE_SECONDS } from './ingest.ts';
import type { CrawlSource } from './pickDueSources.ts';
import type { RebuildStore } from './rebuild.ts';
import type { CallOptions, IngestStore, SourceConfig } from './types.ts';

/**
 * The part of the supabase-js client the store uses. The real client and the
 * boundary test's PostgREST stand-in both fit it.
 */
// deno-lint-ignore no-explicit-any
export interface SupabaseLike {
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): any;
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action} failed: ${error.message}`);
}

/**
 * A failed database call. `unknown` is true when no database answer arrived
 * (the wait was aborted, the connection failed, or a gateway timed out): the
 * call may still have committed, so the caller reads the status before any
 * new external work.
 */
export class StoreCallError extends Error {
  constructor(
    message: string,
    readonly unknown: boolean
  ) {
    super(message);
    this.name = 'StoreCallError';
  }
}

const GATEWAY_STATUSES = new Set([0, 502, 503, 504]);

/** The configuration a job binds, in the database's canonical shape. */
export function sourceConfig(source: CrawlSource): SourceConfig {
  return {
    url: source.url,
    data_urls: source.data_urls ?? [],
    source_kind: source.source_kind,
    province: source.province,
    enabled: source.enabled,
    label: source.label,
    crawl_frequency_hours: source.crawl_frequency_hours,
  };
}

export function createStore(supabase: SupabaseLike): IngestStore {
  const rpc = async <T>(
    fn: string,
    args: Record<string, unknown>,
    action: string,
    call?: CallOptions
  ): Promise<T> => {
    let query = supabase.rpc(fn, args);
    if (call?.signal) query = query.abortSignal(call.signal);
    const { data, error, status } = await query;
    if (error) {
      throw new StoreCallError(
        `${action} failed: ${error.message}`,
        GATEWAY_STATUSES.has(status) || call?.signal?.aborted === true
      );
    }
    return data as T;
  };
  const sourceColumns =
    'id, url, label, enabled, crawl_frequency_hours, last_crawled_at, province, source_kind, data_urls';
  return {
    async listCrawlSources(call) {
      let query = supabase
        .from('crawl_sources')
        .select(sourceColumns)
        .eq('enabled', true);
      if (call?.signal) query = query.abortSignal(call.signal);
      const { data, error } = await query;
      fail(error, 'Listing crawl sources');
      return data ?? [];
    },
    async getCrawlSource(id, call) {
      let query = supabase
        .from('crawl_sources')
        .select(sourceColumns)
        .eq('id', id);
      if (call?.signal) query = query.abortSignal(call.signal);
      const { data, error } = await query.maybeSingle();
      fail(error, 'Reading the crawl source');
      return data ?? null;
    },
    async findEnabledCrawlSourceByUrl(url, call) {
      let query = supabase
        .from('crawl_sources')
        .select(sourceColumns)
        .eq('url', url)
        .eq('enabled', true);
      if (call?.signal) query = query.abortSignal(call.signal);
      const { data, error } = await query.maybeSingle();
      fail(error, 'Reading the crawl source');
      return data ?? null;
    },
    async findDocument(url, call) {
      let query = supabase
        .from('knowledge_documents')
        .select('id, content_hash, embedding_model')
        .eq('source_url', url);
      if (call?.signal) query = query.abortSignal(call.signal);
      const { data, error } = await query.maybeSingle();
      fail(error, 'Document read');
      return data
        ? {
            id: data.id,
            contentHash: data.content_hash,
            embeddingModel: data.embedding_model,
          }
        : null;
    },
    async claimSource(sourceId, leaseSeconds, embeddingModel, call) {
      const data = await rpc<string | null>(
        'claim_crawl_source',
        {
          p_source_id: sourceId,
          p_lease_seconds: leaseSeconds,
          p_embedding_model: embeddingModel,
        },
        'Claiming the source',
        call
      );
      return data ?? null;
    },
    async stageChunks(sourceId, token, chunks, leaseSeconds, embeddingModel) {
      const { error } = await supabase.rpc('stage_knowledge_chunks', {
        p_source_id: sourceId,
        p_token: token,
        p_rows: chunks,
        p_lease_seconds: leaseSeconds,
        p_embedding_model: embeddingModel,
      });
      fail(error, 'Chunk staging');
    },
    async promoteGeneration(sourceId, token, input) {
      const { error } = await supabase.rpc('promote_knowledge_generation', {
        p_source_id: sourceId,
        p_token: token,
        p_title: input.title,
        p_metadata: input.metadata,
        p_content_hash: input.contentHash,
        p_chunk_count: input.chunkCount,
        p_updated_at: input.updatedAt,
        p_embedding_model: input.embeddingModel,
      });
      fail(error, 'Promoting the new chunks');
    },
    async releaseSource(sourceId, token, call) {
      await rpc(
        'release_crawl_source',
        { p_source_id: sourceId, p_token: token },
        'Releasing the source',
        call
      );
    },
    async recordAttempt(sourceId, at, call) {
      await rpc(
        'record_crawl_attempt',
        { p_source_id: sourceId, p_at: at },
        'Recording the crawl attempt',
        call
      );
    },
    async logCrawl(entry, call) {
      let query = supabase.from('crawl_logs').insert(entry);
      if (call?.signal) query = query.abortSignal(call.signal);
      const { error } = await query;
      // Logging is best effort and must not fail the crawl.
      if (error) console.error(`crawl_logs insert failed: ${error.message}`);
    },
    openGeneration(input, call) {
      return rpc(
        'ingest_generation_open',
        {
          p_operation_id: input.operationId,
          p_source_id: input.sourceId,
          p_token: input.token,
          p_source_config: input.sourceConfig,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_content_hash: input.contentHash,
          p_title: input.title,
          p_document_metadata: input.documentMetadata,
          p_fetched_at: input.fetchedAt,
          p_rows: input.rows,
          p_lease_seconds: LEASE_SECONDS,
        },
        'Opening the generation',
        call
      );
    },
    beginService(input, call) {
      return rpc(
        'ingest_generation_begin_service',
        {
          p_job_id: input.jobId,
          p_token: input.token,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_lease_seconds: LEASE_SECONDS,
        },
        'Starting the generation service',
        call
      );
    },
    reserveBatch(input, call) {
      return rpc(
        'ingest_generation_reserve',
        {
          p_request_id: input.requestId,
          p_job_id: input.jobId,
          p_token: input.token,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_lease_seconds: LEASE_SECONDS,
        },
        'Reserving the batch',
        call
      );
    },
    stageBatch(input, call) {
      return rpc(
        'ingest_generation_stage',
        {
          p_request_id: input.requestId,
          p_job_id: input.jobId,
          p_token: input.token,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_receipt: input.receipt,
          p_rows: input.rows,
          p_lease_seconds: LEASE_SECONDS,
        },
        'Staging the batch',
        call
      );
    },
    promoteJob(input, call) {
      return rpc(
        'ingest_generation_promote',
        {
          p_job_id: input.jobId,
          p_token: input.token,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_duration_ms: input.durationMs,
          p_lease_seconds: LEASE_SECONDS,
        },
        'Promoting the generation',
        call
      );
    },
    rejectBatch(input, call) {
      return rpc(
        'ingest_generation_reject',
        {
          p_job_id: input.jobId,
          p_token: input.token,
          p_request_id: input.requestId,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_error: input.error,
          p_duration_ms: input.durationMs,
        },
        'Rejecting the batch',
        call
      );
    },
    async refreshUnchanged(input, call) {
      const data = await rpc<boolean | null>(
        'ingest_generation_refresh',
        {
          p_source_id: input.sourceId,
          p_token: input.token,
          p_source_config: input.sourceConfig,
          p_embedding_model: input.embeddingModel,
          p_contract: input.contract,
          p_content_hash: input.contentHash,
          p_document_patch: input.documentPatch,
          p_chunk_groups: input.chunkGroups,
          p_lease_seconds: LEASE_SECONDS,
        },
        'Metadata refresh',
        call
      );
      return data === true;
    },
    retireJob(jobId, call) {
      return rpc(
        'ingest_generation_retire',
        { p_job_id: jobId },
        'Retiring the generation',
        call
      );
    },
    async listOpenJobs(call) {
      return (
        (await rpc<unknown[] | null>(
          'ingest_generation_list_open',
          {},
          'Listing open generations',
          call
        )) ?? []
      ) as never;
    },
    generationStatus(key, call) {
      return rpc(
        'ingest_generation_status',
        {
          p_job_id: key.jobId ?? null,
          p_operation_id: key.operationId ?? null,
          p_request_id: key.requestId ?? null,
        },
        'Reading the generation status',
        call
      );
    },
  };
}

/** The administrative rebuild calls; each is one database function. */
export function createRebuildStore(supabase: SupabaseLike): RebuildStore {
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    fail(error, fn);
    return data;
  };
  return {
    async status() {
      return (await call('knowledge_embedding_status', {})) as Record<
        string,
        unknown
      >;
    },
    async begin(targetModel, contract) {
      return (await call('knowledge_embedding_begin', {
        p_target_model: targetModel,
        p_contract: contract,
      })) as Record<string, unknown>;
    },
    async acquireWorker(runId, leaseSeconds) {
      const data = await call('knowledge_embedding_acquire_worker', {
        p_run: runId,
        p_lease_seconds: leaseSeconds,
      });
      return (data as string | null) ?? null;
    },
    async releaseWorker(runId, token) {
      await call('knowledge_embedding_release_worker', {
        p_run: runId,
        p_token: token,
      });
    },
    async nextBatch(runId, token, limit, leaseSeconds) {
      return (await call('knowledge_embedding_next_batch', {
        p_run: runId,
        p_token: token,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      })) as { remaining: number; rows: { chunk_id: number; text: string }[] };
    },
    async stageBatch(runId, token, model, contract, rows, leaseSeconds) {
      return (await call('knowledge_embedding_stage_batch', {
        p_run: runId,
        p_token: token,
        p_model: model,
        p_contract: contract,
        p_rows: rows,
        p_lease_seconds: leaseSeconds,
      })) as { staged: number; remaining: number };
    },
    async activate(runId, token) {
      return (await call('knowledge_embedding_activate', {
        p_run: runId,
        p_token: token,
      })) as Record<string, unknown>;
    },
    async abort(runId) {
      await call('knowledge_embedding_abort', { p_run: runId });
    },
    async enableWriters() {
      await call('knowledge_embedding_enable_writers', {});
    },
    async rollback() {
      return (await call('knowledge_embedding_rollback', {})) as Record<
        string,
        unknown
      >;
    },
    async returnToQwen() {
      await call('knowledge_embedding_return_to_qwen', {});
    },
  };
}
