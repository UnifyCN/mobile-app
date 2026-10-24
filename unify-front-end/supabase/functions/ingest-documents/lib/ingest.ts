import { chunkText } from './chunker.ts';
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
import { computeContentHash, htmlToCleanText, isQualityChunk } from './text.ts';
import type {
  IngestDeps,
  Metadata,
  SourceResult,
  StoredDocument,
} from './types.ts';

export const EMBEDDING_BATCH_SIZE = 20;
const MIN_CONTENT_CHARS = 100;

export async function ingestSource(
  source: CrawlSource,
  deps: IngestDeps
): Promise<SourceResult> {
  const startedAt = performance.now();
  // One timestamp per attempt: it is the fetch time, the chunk write time and
  // the source's last-attempt stamp.
  const attemptedAt = deps.now().toISOString();
  let outcome: SourceResult;
  try {
    outcome =
      source.source_kind === 'html' || source.source_kind === undefined
        ? await crawlHtml(source, deps, attemptedAt)
        : await crawlRecords(source, deps, attemptedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Crawl failed';
    console.error(`Crawl failed for ${source.url}: ${message}`);
    outcome = { source_id: source.id, status: 'error', error: message };
  }
  // A failed attempt still advances last_crawled_at so one broken source cannot
  // keep being picked first.
  await deps.store.recordAttempt(source.id, attemptedAt);
  await deps.store.logCrawl({
    crawl_source_id: source.id,
    url: source.url,
    status: outcome.status,
    content_changed: outcome.status === 'success',
    chunks_created: outcome.chunks_created ?? 0,
    error_message: outcome.error,
    duration_ms: Math.round(performance.now() - startedAt),
  });
  return outcome;
}

async function crawlHtml(
  source: CrawlSource,
  deps: IngestDeps,
  now: string
): Promise<SourceResult> {
  const { store } = deps;
  const html = await deps.fetchPage(source.url);
  const cleanText = htmlToCleanText(html);
  if (cleanText.length < MIN_CONTENT_CHARS) {
    throw new Error('Empty or minimal content after HTML parsing');
  }
  const contentHash = await computeContentHash(cleanText);
  const existing = await store.findDocument(source.url);
  const stamp = {
    fetchedAt: now,
    dateModified: extractDateModified(html),
    province: source.province,
  };

  if (existing && existing.contentHash === contentHash) {
    await store.refreshMetadata(existing.id, {
      documentPatch: {
        fetched_at: stamp.fetchedAt,
        published_at: publishedAt(stamp),
        province: stamp.province,
      },
      chunkMetadata: chunkMetadata(stamp),
    });
    return { source_id: source.id, status: 'skipped' };
  }

  const rawChunks = chunkText(cleanText);
  const chunks = rawChunks.filter(isQualityChunk);
  if (chunks.length === 0) {
    throw new Error(
      `No quality chunks (${rawChunks.length} raw chunks all filtered)`
    );
  }

  return await replaceChunks(deps, {
    source,
    existing,
    now,
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
  now: string
): Promise<SourceResult> {
  const { store } = deps;
  const records = await loadSourceRecords(
    source,
    deps.fetchPage,
    new Date(now)
  );
  if (records.length === 0) {
    // An empty result is a broken feed, not news: keep the previous content.
    throw new Error('No records in the source');
  }
  // Dates are not hashed: a changed date alone refreshes metadata without
  // embedding again.
  const contentHash = await computeContentHash(
    records.map(r => r.text).join('\n')
  );
  const existing = await store.findDocument(source.url);
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

  if (existing && existing.contentHash === contentHash) {
    await store.refreshRecordMetadata(existing.id, {
      documentPatch,
      chunks: chunks.map((chunk, chunkIndex) => ({
        chunkIndex,
        metadata: chunk.metadata,
      })),
    });
    return { source_id: source.id, status: 'skipped' };
  }

  return await replaceChunks(deps, {
    source,
    existing,
    now,
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

interface ReplaceInput {
  source: CrawlSource;
  existing: StoredDocument | null;
  now: string;
  contentHash: string;
  document: { title: string; metadata: Metadata };
  chunks: Array<{ text: string; metadata: Metadata }>;
}

async function replaceChunks(
  deps: IngestDeps,
  { source, existing, now, contentHash, document, chunks }: ReplaceInput
): Promise<SourceResult> {
  const { store } = deps;
  const documentInput = {
    url: source.url,
    title: document.title,
    updatedAt: now,
    metadata: document.metadata,
  };
  // A new document needs its row first to own the chunks. An existing document
  // keeps its row untouched until the new chunks are safely written.
  const documentId =
    existing?.id ?? (await store.saveDocument({ id: null, ...documentInput }));

  try {
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const embeddings = await deps.embed(batch.map(chunk => chunk.text));
      await store.insertChunks(
        batch.map((chunk, offset) => ({
          document_id: documentId,
          chunk_index: i + offset,
          chunk_text: chunk.text,
          embedding: embeddings[offset],
          updated_at: now,
          metadata: chunk.metadata,
        }))
      );
    }
  } catch (error) {
    // Drop what this attempt wrote so the previous chunks stay the only copy.
    await store.deleteChunksAt(documentId, now).catch(() => undefined);
    throw error;
  }

  if (existing) {
    await store.saveDocument({ id: existing.id, ...documentInput });
    await store.deleteChunksBefore(documentId, now);
  }
  await store.setContentHash(documentId, contentHash);
  return {
    source_id: source.id,
    status: 'success',
    chunks_created: chunks.length,
  };
}
