import type { IngestStore } from './types.ts';

/**
 * The part of the supabase-js client the store uses. The real client and the
 * boundary test's PostgREST stand-in both fit it.
 */
// deno-lint-ignore no-explicit-any
export interface SupabaseLike {
  from(table: string): any;
}

/** Rows per request when a group of chunks is addressed by chunk_index. */
export const CHUNK_INDEX_FILTER_LIMIT = 100;

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
      const { data } = await supabase
        .from('knowledge_documents')
        .select('id, content_hash')
        .eq('source_url', url)
        .maybeSingle();
      return data ? { id: data.id, contentHash: data.content_hash } : null;
    },
    async saveDocument({ id, url, title, updatedAt, metadata }) {
      if (id !== null) {
        const { error } = await supabase
          .from('knowledge_documents')
          .update({ title, source_url: url, updated_at: updatedAt, metadata })
          .eq('id', id);
        fail(error, 'Document update');
        return id;
      }
      const { data, error } = await supabase
        .from('knowledge_documents')
        .insert({
          title,
          storage_path: '',
          source_url: url,
          updated_at: updatedAt,
          metadata,
        })
        .select('id')
        .single();
      fail(error, 'Document insert');
      return data.id;
    },
    async insertChunks(rows) {
      const { error } = await supabase.from('knowledge_chunks').insert(rows);
      fail(error, 'Chunk insert');
    },
    async setContentHash(documentId, hash) {
      const { error } = await supabase
        .from('knowledge_documents')
        .update({ content_hash: hash })
        .eq('id', documentId);
      fail(error, 'Content hash update');
    },
    async deleteChunksBefore(documentId, before) {
      const { error } = await supabase
        .from('knowledge_chunks')
        .delete()
        .eq('document_id', documentId)
        .lt('updated_at', before);
      // Non-fatal: new chunks are already in place.
      if (error) console.error(`Old chunk cleanup failed: ${error.message}`);
    },
    async deleteChunksAt(documentId, at) {
      const { error } = await supabase
        .from('knowledge_chunks')
        .delete()
        .eq('document_id', documentId)
        .eq('updated_at', at);
      fail(error, 'Partial chunk cleanup');
    },
    async refreshMetadata(documentId, { documentPatch, chunkMetadata }) {
      const { data, error: readError } = await supabase
        .from('knowledge_documents')
        .select('metadata')
        .eq('id', documentId)
        .single();
      fail(readError, 'Document metadata read');
      const { error: docError } = await supabase
        .from('knowledge_documents')
        .update({ metadata: { ...(data?.metadata ?? {}), ...documentPatch } })
        .eq('id', documentId);
      fail(docError, 'Document metadata refresh');
      const { error: chunkError } = await supabase
        .from('knowledge_chunks')
        .update({ metadata: chunkMetadata })
        .eq('document_id', documentId);
      fail(chunkError, 'Chunk metadata refresh');
    },
    async refreshRecordMetadata(documentId, { documentPatch, chunks }) {
      const { data, error: readError } = await supabase
        .from('knowledge_documents')
        .select('metadata')
        .eq('id', documentId)
        .single();
      fail(readError, 'Document metadata read');
      const { error: docError } = await supabase
        .from('knowledge_documents')
        .update({ metadata: { ...(data?.metadata ?? {}), ...documentPatch } })
        .eq('id', documentId);
      fail(docError, 'Document metadata refresh');
      // Records that share one metadata value are updated together. A source
      // has a handful of distinct dates, not one per record.
      const groups = new Map<
        string,
        { metadata: unknown; indexes: number[] }
      >();
      for (const { chunkIndex, metadata } of chunks) {
        const key = JSON.stringify(metadata);
        const group = groups.get(key) ?? { metadata, indexes: [] };
        group.indexes.push(chunkIndex);
        groups.set(key, group);
      }
      for (const { metadata, indexes } of groups.values()) {
        for (let i = 0; i < indexes.length; i += CHUNK_INDEX_FILTER_LIMIT) {
          const { error } = await supabase
            .from('knowledge_chunks')
            .update({ metadata })
            .eq('document_id', documentId)
            .in('chunk_index', indexes.slice(i, i + CHUNK_INDEX_FILTER_LIMIT));
          fail(error, 'Chunk metadata refresh');
        }
      }
    },
    async recordAttempt(sourceId, at) {
      const { error } = await supabase
        .from('crawl_sources')
        .update({ last_crawled_at: at })
        .eq('id', sourceId);
      fail(error, 'Recording the crawl attempt');
    },
    async logCrawl(entry) {
      const { error } = await supabase.from('crawl_logs').insert(entry);
      // Logging is best effort and must not fail the crawl.
      if (error) console.error(`crawl_logs insert failed: ${error.message}`);
    },
  };
}
