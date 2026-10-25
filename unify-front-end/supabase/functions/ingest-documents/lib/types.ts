import type { CrawlSource } from './pickDueSources.ts';

export type Metadata = Record<string, unknown>;

export interface StoredDocument {
  id: number;
  contentHash: string | null;
  /** The model that made the document's vectors. */
  embeddingModel: string;
}

/** One chunk of a new generation, staged before the generation is promoted. */
export interface StagedChunk {
  chunk_index: number;
  chunk_text: string;
  embedding: number[];
  metadata: Metadata;
}

/** Chunks that get the same metadata. `indexes: null` means every chunk. */
export interface ChunkMetadataGroup {
  metadata: Metadata;
  indexes: number[] | null;
}

export interface CrawlLogEntry {
  crawl_source_id: number | null;
  url: string;
  status: 'success' | 'skipped' | 'error';
  content_changed?: boolean;
  chunks_created?: number;
  error_message?: string;
  duration_ms: number;
}

/**
 * Database boundary. The Supabase implementation is supabaseStore.ts.
 *
 * A refresh writes nothing visible until it promotes. It first claims the
 * source and gets a token. Each embedding batch is staged with that token, and
 * one promotion replaces the document and all its chunks in one transaction.
 * Every write with a token fails once a newer claim has replaced it, so a
 * stalled call can never overwrite a newer one.
 */
export interface IngestStore {
  listCrawlSources(): Promise<CrawlSource[]>;
  getCrawlSource(id: number | string): Promise<CrawlSource | null>;
  /** Only an enabled source may match. */
  findEnabledCrawlSourceByUrl(url: string): Promise<CrawlSource | null>;
  findDocument(url: string): Promise<StoredDocument | null>;
  /**
   * A token for this refresh, or null while another call holds the source,
   * writers are paused or `embeddingModel` is not the model being served.
   */
  claimSource(
    sourceId: number,
    leaseSeconds: number,
    embeddingModel: string
  ): Promise<string | null>;
  /**
   * Stores one batch of at most 20 chunks and renews the lease. Throws when
   * writers are paused or `embeddingModel` is not the model being served.
   */
  stageChunks(
    sourceId: number,
    token: string,
    chunks: StagedChunk[],
    leaseSeconds: number,
    embeddingModel: string
  ): Promise<void>;
  /**
   * Replaces the document (title, metadata, hash) and all its chunks with the
   * staged generation, in one transaction. Throws and changes nothing when the
   * token is no longer the owner or the staged chunks are incomplete.
   */
  promoteGeneration(
    sourceId: number,
    token: string,
    input: {
      title: string;
      metadata: Metadata;
      contentHash: string;
      chunkCount: number;
      updatedAt: string;
      embeddingModel: string;
    }
  ): Promise<void>;
  /**
   * For an unchanged document: merges `documentPatch` into its metadata and
   * sets each group's chunk metadata. Returns false, and changes nothing, when
   * the stored chunks are not exactly one generation with `contentHash`, or the
   * document or any chunk has another model than `embeddingModel` or no vector;
   * the caller then replaces them.
   */
  refreshMetadata(
    sourceId: number,
    token: string,
    input: {
      contentHash: string;
      documentPatch: Metadata;
      chunkGroups: ChunkMetadataGroup[];
      embeddingModel: string;
    }
  ): Promise<boolean>;
  /** Ends the lease and drops staged chunks of this token only. */
  releaseSource(sourceId: number, token: string): Promise<void>;
  /** Stamps the source's last attempt, whatever its outcome. Never moves it back. */
  recordAttempt(sourceId: number, at: string): Promise<void>;
  logCrawl(entry: CrawlLogEntry): Promise<void>;
}

export interface IngestDeps {
  store: IngestStore;
  now: () => Date;
  /** Returns the page body. Throws on any fetch failure. */
  fetchPage: (url: string) => Promise<string>;
  embed: (texts: string[]) => Promise<number[][]>;
}

export interface SourceResult {
  source_id: number;
  status: 'success' | 'skipped' | 'error';
  chunks_created?: number;
  error?: string;
}
