import type {
  CheckedEmbeddings,
  EmbeddingReceipt,
  EmbeddingRequestOptions,
} from '../../_shared/embeddings.ts';
import type { Timers } from './budget.ts';
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
 * Every field of a source that decides what is fetched and what the stored
 * chunks say. A generation job binds the configuration its input came from.
 */
export interface SourceConfig {
  url: string;
  data_urls: string[];
  source_kind: string;
  province: string | null;
  enabled: boolean;
  label: string | null;
  crawl_frequency_hours: number;
}

export type JobStatus = 'open' | 'promoted' | 'superseded' | 'failed';

/** The database's account of a generation job. Unknown counts are null. */
export interface JobSummary {
  job_id: string;
  operation_id: string | null;
  crawl_source_id: number;
  status: JobStatus;
  terminal_reason: string | null;
  fingerprint: string;
  content_hash: string;
  total: number;
  staged: number | null;
  remaining: number | null;
  reserved: number;
  cap: number;
  created_at: string;
  last_service_at: string | null;
  fetched_at: string;
  closed_at: string | null;
  promoted_document_id: number | null;
  promoted_at: string | null;
}

export interface OpenedJob extends JobSummary {
  replayed: boolean;
  resumed: boolean;
}

export interface ReservedRow {
  chunk_index: number;
  chunk_text: string;
  text_sha256: string;
}

export interface ReservedBatch extends JobSummary {
  request_id: string | null;
  reservation_outcome: 'reserved' | 'staged' | 'abandoned' | null;
  replayed: boolean;
  /** The rows to embed now; empty when nothing may be sent. */
  rows: ReservedRow[];
}

export interface StagedBatch extends JobSummary {
  staged_now: number;
  replayed: boolean;
}

export interface PromotedJob extends JobSummary {
  /** True when this reads back an earlier promotion. */
  historical: boolean;
  document_id: number | null;
}

/** An open job, as the scheduler sees it. */
export interface OpenJob {
  job_id: string;
  crawl_source_id: number;
  created_at: string;
  last_service_at: string | null;
  fetched_at: string;
  fingerprint: string;
  total: number;
  staged: number;
  reserved: number;
  cap: number;
  /** The job's model and contract are the serving ones. */
  compatible: boolean;
  /** The source still has the configuration the input was fetched with. */
  config_matches: boolean;
  source_enabled: boolean;
  crawl_frequency_hours: number | null;
}

export type GenerationStatus = Partial<JobSummary> & {
  found: boolean;
  reservation: {
    request_id: string;
    job_id: string;
    outcome: 'reserved' | 'staged' | 'abandoned';
    chunk_indexes: number[];
  } | null;
};

/** How long a caller waits for one database call. */
export interface CallOptions {
  signal?: AbortSignal;
}

interface JobWrite {
  token: string;
  embeddingModel: string;
  contract: string;
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
  listCrawlSources(call?: CallOptions): Promise<CrawlSource[]>;
  getCrawlSource(id: number | string, call?: CallOptions): Promise<CrawlSource | null>;
  /** Only an enabled source may match. */
  findEnabledCrawlSourceByUrl(
    url: string,
    call?: CallOptions
  ): Promise<CrawlSource | null>;
  findDocument(url: string, call?: CallOptions): Promise<StoredDocument | null>;
  /**
   * A token for this refresh, or null while another call holds the source,
   * writers are paused or `embeddingModel` is not the model being served.
   */
  claimSource(
    sourceId: number,
    leaseSeconds: number,
    embeddingModel: string,
    call?: CallOptions
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
    },
    call?: CallOptions
  ): Promise<boolean>;
  /** Ends the lease and drops staged chunks of this token only. */
  releaseSource(sourceId: number, token: string, call?: CallOptions): Promise<void>;
  /** Stamps the source's last attempt, whatever its outcome. Never moves it back. */
  recordAttempt(sourceId: number, at: string, call?: CallOptions): Promise<void>;
  logCrawl(entry: CrawlLogEntry, call?: CallOptions): Promise<void>;

  /**
   * The resumable generation path (migration ingest_generation_jobs). Every
   * write names the live lease token, the serving model and contract. A call
   * that fails without a database answer throws StoreCallError with
   * `unknown: true`: it may still have committed.
   */
  openGeneration(
    input: JobWrite & {
      operationId: string;
      sourceId: number;
      sourceConfig: SourceConfig;
      contentHash: string;
      title: string;
      documentMetadata: Metadata;
      fetchedAt: string;
      rows: Array<{ chunk_index: number; chunk_text: string; metadata: Metadata }>;
    },
    call?: CallOptions
  ): Promise<OpenedJob>;
  beginService(
    input: JobWrite & { jobId: string },
    call?: CallOptions
  ): Promise<JobSummary & { serviced: boolean }>;
  reserveBatch(
    input: JobWrite & { requestId: string; jobId: string },
    call?: CallOptions
  ): Promise<ReservedBatch>;
  stageBatch(
    input: JobWrite & {
      requestId: string;
      jobId: string;
      receipt: EmbeddingReceipt;
      rows: Array<{ chunk_index: number; text_sha256: string; embedding: number[] }>;
    },
    call?: CallOptions
  ): Promise<StagedBatch>;
  promoteJob(
    input: JobWrite & { jobId: string; durationMs: number },
    call?: CallOptions
  ): Promise<PromotedJob>;
  rejectBatch(
    input: JobWrite & { jobId: string; requestId: string; error: string; durationMs: number },
    call?: CallOptions
  ): Promise<JobSummary>;
  supersedeOpenJob(
    input: JobWrite & { sourceId: number },
    call?: CallOptions
  ): Promise<{ superseded: boolean }>;
  /** Service-only cleanup of a job that can never promote. No lease. */
  retireJob(jobId: string, call?: CallOptions): Promise<{ retired: boolean }>;
  listOpenJobs(call?: CallOptions): Promise<OpenJob[]>;
  generationStatus(
    key: { jobId?: string; operationId?: string; requestId?: string },
    call?: CallOptions
  ): Promise<GenerationStatus>;
}

export interface FetchOptions {
  signal?: AbortSignal;
  /** Decoded bytes accepted; the read stops past it. */
  maxBytes?: number;
}

export interface IngestDeps {
  store: IngestStore;
  now: () => Date;
  /** The invocation's monotonic clock and timers; real ones by default. */
  timers?: Timers;
  /**
   * Returns the page body. Throws on any fetch failure, when `signal` aborts
   * (the body read included), or when the body passes `maxBytes`.
   */
  fetchPage: (url: string, options?: FetchOptions) => Promise<string>;
  /** One provider request: the vectors and the receipt of the checked answer. */
  embedChecked: (
    texts: string[],
    options?: EmbeddingRequestOptions
  ) => Promise<CheckedEmbeddings>;
}

/** Why a source's work stopped with its job still open. */
export type StopReason =
  | 'work_deadline'
  | 'source_budget'
  | 'send_limit'
  | 'provider_error'
  | 'unknown_outcome'
  | 'store_error'
  | 'response_backstop';

/**
 * One started source's outcome. Success means a durable promotion; skipped
 * means verified unchanged content or another call holding the source;
 * pending means an open job with the work left, where every value the
 * caller cannot know is null.
 */
export interface SourceResult {
  source_id: number;
  status: 'success' | 'skipped' | 'error' | 'pending';
  chunks_created?: number;
  error?: string;
  job_id?: string | null;
  operation_id?: string | null;
  fingerprint?: string | null;
  total?: number | null;
  staged?: number | null;
  remaining?: number | null;
  reserved?: number | null;
  cap?: number | null;
  stop_reason?: StopReason;
  /** A database call's outcome is not known: it may still commit. */
  unknown_outcome?: boolean;
}
