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
  ChunkMetadataGroup,
  IngestDeps,
  Metadata,
  SourceResult,
} from './types.ts';

export const EMBEDDING_BATCH_SIZE = 20;
/**
 * How long a claim lasts without progress. Each staged batch renews it, so only
 * a stalled or stopped call loses it. Then the next call may take the source.
 */
export const LEASE_SECONDS = 300;
export const SOURCE_BUSY = 'Another call is refreshing this source';
const MIN_CONTENT_CHARS = 100;

interface Attempt {
  /** The fetch time, the chunk write time and the source's last-attempt stamp. */
  now: string;
  /** This call's claim on the source. */
  token: string;
}

export async function ingestSource(
  source: CrawlSource,
  deps: IngestDeps
): Promise<SourceResult> {
  const startedAt = performance.now();
  const attemptedAt = deps.now().toISOString();
  const token = await deps.store.claimSource(source.id, LEASE_SECONDS);
  if (token === null) {
    // The other call stamps and logs its own attempt.
    const busy: SourceResult = {
      source_id: source.id,
      status: 'skipped',
      error: SOURCE_BUSY,
    };
    await deps.store.logCrawl({
      crawl_source_id: source.id,
      url: source.url,
      status: busy.status,
      content_changed: false,
      chunks_created: 0,
      error_message: SOURCE_BUSY,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return busy;
  }

  let outcome: SourceResult;
  try {
    // Stored before any external call, so a call that stalls or is stopped
    // still moves the source behind the others in the due queue. If the
    // stamp fails, the crawl does not start and the lease is released below.
    await deps.store.recordAttempt(source.id, attemptedAt);
    const attempt = { now: attemptedAt, token };
    try {
      outcome =
        source.source_kind === 'html' || source.source_kind === undefined
          ? await crawlHtml(source, deps, attempt)
          : await crawlRecords(source, deps, attempt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Crawl failed';
      console.error(`Crawl failed for ${source.url}: ${message}`);
      outcome = { source_id: source.id, status: 'error', error: message };
    }
  } finally {
    // Best effort: an unreleased lease expires on its own.
    await deps.store
      .releaseSource(source.id, token)
      .catch(error =>
        console.error(`Lease release failed for ${source.url}: ${error}`)
      );
  }
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
  attempt: Attempt
): Promise<SourceResult> {
  const { store } = deps;
  const { now } = attempt;
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

  if (
    existing &&
    existing.contentHash === contentHash &&
    (await store.refreshMetadata(source.id, attempt.token, {
      contentHash,
      documentPatch: {
        fetched_at: stamp.fetchedAt,
        published_at: publishedAt(stamp),
        province: stamp.province,
      },
      chunkGroups: [{ metadata: chunkMetadata(stamp), indexes: null }],
    }))
  ) {
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
  attempt: Attempt
): Promise<SourceResult> {
  const { store } = deps;
  const { now } = attempt;
  const records = await loadSourceRecords(
    source,
    deps.fetchPage,
    new Date(now)
  );
  // Only the newsroom can be validly empty: a readable feed with no item in
  // the last 30 days. Its expired items must then leave the knowledge base.
  // The converters throw on a broken file, so the previous content stays.
  if (records.length === 0 && source.source_kind !== 'ircc_newsroom') {
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

  if (
    existing &&
    existing.contentHash === contentHash &&
    (await store.refreshMetadata(source.id, attempt.token, {
      contentHash,
      documentPatch,
      chunkGroups:
        chunks.length === 0
          ? [{ metadata: {}, indexes: [] }]
          : groupByMetadata(chunks.map(chunk => chunk.metadata)),
    }))
  ) {
    return { source_id: source.id, status: 'skipped' };
  }

  return await replaceChunks(deps, {
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
 * Embeds and stages the chunks batch by batch, so at most one batch of
 * embeddings is in memory, then promotes the complete generation in one
 * database transaction. Until then readers see only the previous version, and
 * any failure leaves it whole.
 */
async function replaceChunks(
  deps: IngestDeps,
  { source, attempt, contentHash, document, chunks }: ReplaceInput
): Promise<SourceResult> {
  const { store } = deps;
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await deps.embed(batch.map(chunk => chunk.text));
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding returned ${embeddings.length} of ${batch.length} vectors`
      );
    }
    await store.stageChunks(
      source.id,
      attempt.token,
      batch.map((chunk, offset) => ({
        chunk_index: i + offset,
        chunk_text: chunk.text,
        embedding: embeddings[offset],
        metadata: chunk.metadata,
      })),
      LEASE_SECONDS
    );
  }
  await store.promoteGeneration(source.id, attempt.token, {
    title: document.title,
    metadata: document.metadata,
    contentHash,
    chunkCount: chunks.length,
    updatedAt: attempt.now,
  });
  return {
    source_id: source.id,
    status: 'success',
    chunks_created: chunks.length,
  };
}
