// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/fetchWithRetry.ts';
import { handleIngestRequest, isAuthorized } from './lib/handler.ts';
import type { IngestDeps, IngestStore } from './lib/types.ts';

const EMBEDDING_MODEL =
  Deno.env.get('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small';

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action} failed: ${error.message}`);
}

function createStore(supabase): IngestStore {
  const sourceColumns =
    'id, url, label, enabled, crawl_frequency_hours, last_crawled_at, province';
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

async function fetchPage(url: string): Promise<string> {
  const response = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'UnifyBot/1.0 (+https://unifysocial.ca; educational-knowledge-indexer)',
      },
    },
    { timeoutMs: 15000, retries: 2, retryDelayMs: 500 }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

function createEmbed(apiKey: string): IngestDeps['embed'] {
  return async texts => {
    const response = await fetchWithRetry(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      },
      { timeoutMs: 30000, retries: 2, retryDelayMs: 500 }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI embedding error ${response.status}: ${errorText}`
      );
    }
    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  };
}

Deno.serve(async (req: Request) => {
  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // Reject before reading configuration, so callers learn nothing else.
    if (!isAuthorized(req, serviceRoleKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      // A configuration fault is not a source failure: fail the run loudly
      // instead of stamping every source as attempted.
      throw new Error('Missing OPENAI_API_KEY');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    );
    return await handleIngestRequest(req, {
      store: createStore(supabase),
      now: () => new Date(),
      fetchPage,
      embed: createEmbed(openaiApiKey),
      serviceRoleKey,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Ingest error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
