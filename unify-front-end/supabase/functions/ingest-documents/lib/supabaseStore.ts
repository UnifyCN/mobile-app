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
        .select('id, content_hash')
        .eq('source_url', url)
        .maybeSingle();
      fail(error, 'Document read');
      return data ? { id: data.id, contentHash: data.content_hash } : null;
    },
    async claimSource(sourceId, leaseSeconds) {
      const { data, error } = await supabase.rpc('claim_crawl_source', {
        p_source_id: sourceId,
        p_lease_seconds: leaseSeconds,
      });
      fail(error, 'Claiming the source');
      return (data as string | null) ?? null;
    },
    async stageChunks(sourceId, token, chunks, leaseSeconds) {
      const { error } = await supabase.rpc('stage_knowledge_chunks', {
        p_source_id: sourceId,
        p_token: token,
        p_rows: chunks,
        p_lease_seconds: leaseSeconds,
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
