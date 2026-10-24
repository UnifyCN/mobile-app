import type { CrawlSource } from './pickDueSources.ts';

export type Metadata = Record<string, unknown>;

export interface StoredDocument {
  id: number;
  contentHash: string | null;
}

export interface ChunkRow {
  document_id: number;
  chunk_index: number;
  chunk_text: string;
  embedding: number[];
  updated_at: string;
  metadata: Metadata;
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

/** Database boundary. The Supabase implementation lives in index.ts. */
export interface IngestStore {
  listCrawlSources(): Promise<CrawlSource[]>;
  getCrawlSource(id: number | string): Promise<CrawlSource | null>;
  /** Only an enabled source may match. */
  findEnabledCrawlSourceByUrl(url: string): Promise<CrawlSource | null>;
  findDocument(url: string): Promise<StoredDocument | null>;
  /** Inserts when `id` is null, updates otherwise. Returns the document id. */
  saveDocument(input: {
    id: number | null;
    url: string;
    title: string;
    updatedAt: string;
    metadata: Metadata;
  }): Promise<number>;
  insertChunks(rows: ChunkRow[]): Promise<void>;
  setContentHash(documentId: number, hash: string): Promise<void>;
  /** Removes chunks of the document whose updated_at is before `before`. */
  deleteChunksBefore(documentId: number, before: string): Promise<void>;
  /** Removes chunks of the document written at exactly `at`. */
  deleteChunksAt(documentId: number, at: string): Promise<void>;
  /** Merges `documentPatch` into the document metadata and replaces every chunk's metadata. */
  refreshMetadata(
    documentId: number,
    input: { documentPatch: Metadata; chunkMetadata: Metadata }
  ): Promise<void>;
  /** Stamps the source's last attempt, whatever its outcome. */
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
