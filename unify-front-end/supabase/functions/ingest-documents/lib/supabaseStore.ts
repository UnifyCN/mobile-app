import type { RebuildStore } from './rebuild.ts';
import type { IngestStore } from './types.ts';

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

export function createStore(supabase: SupabaseLike): IngestStore {
  const sourceColumns =
    'id, url, label, enabled, crawl_frequency_hours, last_crawled_at, province, source_kind, data_urls';
  return {
    async listCrawlSources() {
      const { data, error } = await supabase
        .from('crawl_sources')
        .select(sourceColumns)
        .eq('enabled', true);
      fail(error, 'Listing crawl sources');
      return data ?? [];
    },
    async getCrawlSource(id) {
      const { data } = await supabase
        .from('crawl_sources')
        .select(sourceColumns)
        .eq('id', id)
        .maybeSingle();
      return data ?? null;
    },
    async findEnabledCrawlSourceByUrl(url) {
      const { data } = await supabase
        .from('crawl_sources')
        .select(sourceColumns)
        .eq('url', url)
        .eq('enabled', true)
        .maybeSingle();
      return data ?? null;
    },
    async findDocument(url) {
      const { data, error } = await supabase
        .from('knowledge_documents')
        .select('id, content_hash, embedding_model')
        .eq('source_url', url)
        .maybeSingle();
      fail(error, 'Document read');
      return data
        ? {
            id: data.id,
            contentHash: data.content_hash,
            embeddingModel: data.embedding_model,
          }
        : null;
    },
    async claimSource(sourceId, leaseSeconds, embeddingModel) {
      const { data, error } = await supabase.rpc('claim_crawl_source', {
        p_source_id: sourceId,
        p_lease_seconds: leaseSeconds,
        p_embedding_model: embeddingModel,
      });
      fail(error, 'Claiming the source');
      return (data as string | null) ?? null;
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
    async refreshMetadata(sourceId, token, input) {
      const { data, error } = await supabase.rpc('refresh_knowledge_metadata', {
        p_source_id: sourceId,
        p_token: token,
        p_content_hash: input.contentHash,
        p_document_patch: input.documentPatch,
        p_chunk_groups: input.chunkGroups,
        p_embedding_model: input.embeddingModel,
      });
      fail(error, 'Metadata refresh');
      return data === true;
    },
    async releaseSource(sourceId, token) {
      const { error } = await supabase.rpc('release_crawl_source', {
        p_source_id: sourceId,
        p_token: token,
      });
      fail(error, 'Releasing the source');
    },
    async recordAttempt(sourceId, at) {
      const { error } = await supabase.rpc('record_crawl_attempt', {
        p_source_id: sourceId,
        p_at: at,
      });
      fail(error, 'Recording the crawl attempt');
    },
    async logCrawl(entry) {
      const { error } = await supabase.from('crawl_logs').insert(entry);
      // Logging is best effort and must not fail the crawl.
      if (error) console.error(`crawl_logs insert failed: ${error.message}`);
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
