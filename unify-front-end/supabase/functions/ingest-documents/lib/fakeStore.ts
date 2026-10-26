// In-memory IngestStore for tests. Not imported by production code.
//
// It follows the database contract of the ingest_refresh_generations
// migration: one token per claimed source, staging per token, and promotion as
// one step, and the embedding model guards: writes name the serving model and
// stop while writers are paused. The SQL itself is tested in supabase/tests/,
// not here.
import {
  EMBEDDING_CONTRACT,
  EMBEDDING_MODEL,
  type EmbeddingReceipt,
} from '../../_shared/embeddings.ts';
import type { CrawlSource } from './pickDueSources.ts';
import { sourceConfig } from './supabaseStore.ts';
import type {
  CrawlLogEntry,
  IngestStore,
  JobStatus,
  JobSummary,
  Metadata,
  OpenJob,
  SourceConfig,
  StagedChunk,
  StoredDocument,
} from './types.ts';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

interface FakeJobRow {
  text: string;
  hash: string;
  metadata: Metadata;
  embedding: number[] | null;
}

/** An in-memory generation job, after migration ingest_generation_jobs. */
export interface FakeJob {
  id: string;
  operationIds: string[];
  sourceId: number;
  status: JobStatus;
  terminalReason: string | null;
  model: string;
  contract: string;
  config: SourceConfig;
  contentHash: string;
  fingerprint: string;
  title: string;
  documentMetadata: Metadata;
  fetchedAt: string;
  total: number;
  cap: number;
  reserved: number;
  created: number;
  lastService: number | null;
  promotedDocumentId: number | null;
  rows: Map<number, FakeJobRow>;
  reservations: Map<
    string,
    { token: string; indexes: number[]; outcome: 'reserved' | 'staged' | 'abandoned' }
  >;
}

export interface FakeDocument {
  id: number;
  url: string;
  title: string;
  contentHash: string | null;
  updatedAt: string;
  metadata: Metadata;
  embeddingModel: string;
}

export interface FakeChunk {
  document_id: number;
  chunk_index: number;
  chunk_text: string;
  embedding: number[];
  updated_at: string;
  metadata: Metadata;
  embeddingModel: string;
}

export class FakeStore implements IngestStore {
  sources: CrawlSource[];
  documents: FakeDocument[] = [];
  chunks: FakeChunk[] = [];
  logs: CrawlLogEntry[] = [];
  events: string[] = [];
  failRecordAttemptFor = new Set<number>();
  /** Live claims: source id to token. */
  leases = new Map<number, string>();
  staged = new Map<string, StagedChunk[]>();
  /** The model the database serves, and whether writers are paused. */
  servingModel = EMBEDDING_MODEL;
  servingContract = EMBEDDING_CONTRACT;
  writersPaused = false;
  jobs: FakeJob[] = [];
  private tick = 0;
  private stagedModel = new Map<string, Set<string>>();
  private nextDocId = 1;
  private nextToken = 1;

  constructor(sources: CrawlSource[] = []) {
    this.sources = sources;
  }

  chunksOf(documentId: number): FakeChunk[] {
    return this.chunks
      .filter(c => c.document_id === documentId)
      .sort((a, b) => a.chunk_index - b.chunk_index);
  }

  private owns(sourceId: number, token: string) {
    if (this.leases.get(sourceId) !== token) {
      throw new Error('Crawl source lease lost');
    }
  }

  listCrawlSources() {
    return Promise.resolve(this.sources.map(s => ({ ...s })));
  }
  getCrawlSource(id: number | string) {
    const s = this.sources.find(x => String(x.id) === String(id));
    return Promise.resolve(s ? { ...s } : null);
  }
  findEnabledCrawlSourceByUrl(url: string) {
    const s = this.sources.find(x => x.url === url && x.enabled);
    return Promise.resolve(s ? { ...s } : null);
  }
  findDocument(url: string): Promise<StoredDocument | null> {
    const d = this.documents.find(x => x.url === url);
    return Promise.resolve(
      d
        ? {
            id: d.id,
            contentHash: d.contentHash,
            embeddingModel: d.embeddingModel,
          }
        : null
    );
  }
  claimSource(sourceId: number, _leaseSeconds: number, model: string) {
    if (
      this.writersPaused ||
      model !== this.servingModel ||
      this.leases.has(sourceId)
    ) {
      return Promise.resolve(null);
    }
    const token = `token-${this.nextToken++}`;
    this.leases.set(sourceId, token);
    return Promise.resolve(token);
  }
  private guardWrite(model: string) {
    if (this.writersPaused) throw new Error('Knowledge writes are paused');
    if (model !== this.servingModel) {
      throw new Error(`Embedding model ${model} is not the serving model`);
    }
  }
  stageChunks(
    sourceId: number,
    token: string,
    chunks: StagedChunk[],
    _leaseSeconds: number,
    embeddingModel: string
  ) {
    try {
      this.guardWrite(embeddingModel);
      this.owns(sourceId, token);
    } catch (error) {
      return Promise.reject(error);
    }
    this.stagedModel.set(
      token,
      (this.stagedModel.get(token) ?? new Set()).add(embeddingModel)
    );
    this.events.push(`stage:${chunks.length}`);
    this.staged.set(token, [...(this.staged.get(token) ?? []), ...chunks]);
    return Promise.resolve();
  }
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
  ) {
    try {
      this.guardWrite(input.embeddingModel);
      this.owns(sourceId, token);
    } catch (error) {
      return Promise.reject(error);
    }
    const staged = this.staged.get(token) ?? [];
    if (staged.length !== input.chunkCount) {
      return Promise.reject(new Error('Staged chunks are incomplete'));
    }
    if (
      [...(this.stagedModel.get(token) ?? [])].some(
        m => m !== input.embeddingModel
      )
    ) {
      return Promise.reject(
        new Error('Staged chunks use another embedding model')
      );
    }
    const url = this.sources.find(s => s.id === sourceId)!.url;
    this.events.push(`promote:${url}`);
    let doc = this.documents.find(d => d.url === url);
    if (!doc) {
      doc = {
        id: this.nextDocId++,
        url,
        title: input.title,
        contentHash: null,
        updatedAt: input.updatedAt,
        metadata: {},
        embeddingModel: input.embeddingModel,
      };
      this.documents.push(doc);
    }
    Object.assign(doc, {
      title: input.title,
      contentHash: input.contentHash,
      updatedAt: input.updatedAt,
      metadata: input.metadata,
      embeddingModel: input.embeddingModel,
    });
    const id = doc.id;
    this.chunks = this.chunks.filter(c => c.document_id !== id);
    this.chunks.push(
      ...staged.map(c => ({
        document_id: id,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        embedding: c.embedding,
        updated_at: input.updatedAt,
        metadata: c.metadata,
        embeddingModel: input.embeddingModel,
      }))
    );
    this.staged.delete(token);
    this.stagedModel.delete(token);
    return Promise.resolve();
  }
  refreshUnchanged(input: Parameters<IngestStore['refreshUnchanged']>[0]) {
    const { sourceId } = input;
    try {
      this.guardJobWrite(sourceId, input.token, input.embeddingModel, input.contract);
      const current = this.currentConfig(sourceId);
      if (current === null || JSON.stringify(current) !== JSON.stringify(input.sourceConfig)) {
        throw new Error('Source configuration changed');
      }
      if (!current.enabled) throw new Error('Source is disabled');
    } catch (error) {
      return Promise.reject(error);
    }
    const open = this.jobs.find(j => j.sourceId === sourceId && j.status === 'open');
    if (open) {
      this.close(open, 'superseded', 'superseded', null);
      open.rows.clear();
    }
    const url = this.sources.find(s => s.id === sourceId)!.url;
    const d = this.documents.find(x => x.url === url);
    if (!d || d.contentHash !== input.contentHash)
      return Promise.resolve(false);
    if (
      d.embeddingModel !== input.embeddingModel ||
      this.chunksOf(d.id).some(
        c =>
          c.embeddingModel !== input.embeddingModel || c.embedding.length === 0
      )
    ) {
      return Promise.resolve(false);
    }
    d.metadata = { ...d.metadata, ...input.documentPatch };
    for (const { metadata, indexes } of input.chunkGroups) {
      for (const c of this.chunksOf(d.id)) {
        if (indexes === null || indexes.includes(c.chunk_index)) {
          c.metadata = { ...metadata };
        }
      }
    }
    return Promise.resolve(true);
  }
  releaseSource(sourceId: number, token: string) {
    this.staged.delete(token);
    this.stagedModel.delete(token);
    if (this.leases.get(sourceId) === token) this.leases.delete(sourceId);
    return Promise.resolve();
  }
  recordAttempt(sourceId: number, at: string) {
    if (this.failRecordAttemptFor.has(sourceId)) {
      return Promise.reject(new Error('database unavailable'));
    }
    this.events.push(`recordAttempt:${sourceId}`);
    const source = this.sources.find(x => x.id === sourceId)!;
    if (source.last_crawled_at === null || source.last_crawled_at < at) {
      source.last_crawled_at = at;
    }
    return Promise.resolve();
  }
  logCrawl(entry: CrawlLogEntry) {
    this.logs.push(entry);
    return Promise.resolve();
  }

  // The generation-job path. It follows ingest_generation_jobs closely enough
  // for the ingestion tests; the SQL itself is tested in supabase/tests/.
  private guardJobWrite(sourceId: number, token: string, model: string, contract: string) {
    this.guardWrite(model);
    if (contract !== this.servingContract) {
      throw new Error('Embedding contract is not the serving contract');
    }
    this.owns(sourceId, token);
  }
  private currentConfig(sourceId: number): SourceConfig | null {
    const source = this.sources.find(s => s.id === sourceId);
    return source ? sourceConfig(source) : null;
  }
  private summary(job: FakeJob): JobSummary {
    const rows = [...job.rows.values()];
    const staged = rows.filter(r => r.embedding !== null).length;
    return {
      job_id: job.id,
      operation_id: job.operationIds.at(-1) ?? null,
      crawl_source_id: job.sourceId,
      status: job.status,
      terminal_reason: job.terminalReason,
      fingerprint: job.fingerprint,
      content_hash: job.contentHash,
      total: job.total,
      staged: job.status === 'open' ? staged : job.status === 'promoted' ? job.total : null,
      remaining: job.status === 'open' ? rows.length - staged : job.status === 'promoted' ? 0 : null,
      reserved: job.reserved,
      cap: job.cap,
      created_at: String(job.created),
      last_service_at: job.lastService === null ? null : String(job.lastService),
      fetched_at: job.fetchedAt,
      closed_at: job.status === 'open' ? null : 'closed',
      promoted_document_id: job.promotedDocumentId,
      promoted_at: job.status === 'promoted' ? 'promoted' : null,
    };
  }
  private close(job: FakeJob, status: JobStatus, reason: string, error: string | null) {
    job.status = status;
    job.terminalReason = reason;
    job.reservations.clear();
    if (error !== null) {
      this.logs.push({
        crawl_source_id: job.sourceId,
        url: job.config.url,
        status: 'error',
        content_changed: false,
        chunks_created: 0,
        error_message: error,
        duration_ms: 0,
      });
    }
  }
  /** Locks the job for a write: false when it is not open or its source changed. */
  private lockJob(job: FakeJob | undefined, model: string, contract: string): job is FakeJob {
    if (!job) throw new Error('Generation job not found');
    if (job.status !== 'open') return false;
    if (job.model !== model || job.contract !== contract) {
      throw new Error('The generation job has another model or contract');
    }
    const current = this.currentConfig(job.sourceId);
    if (current === null || JSON.stringify(current) !== JSON.stringify(job.config) || !current.enabled) {
      this.close(job, 'failed', 'configuration_changed', 'Source configuration changed');
      return false;
    }
    return true;
  }
  private job(id: string) {
    return this.jobs.find(j => j.id === id);
  }
  async openGeneration(input: Parameters<IngestStore['openGeneration']>[0]) {
    const replay = this.jobs.find(j => j.operationIds.includes(input.operationId));
    if (replay) return { ...this.summary(replay), replayed: true, resumed: false };
    this.guardJobWrite(input.sourceId, input.token, input.embeddingModel, input.contract);
    const current = this.currentConfig(input.sourceId);
    if (current === null || JSON.stringify(current) !== JSON.stringify(input.sourceConfig)) {
      throw new Error('Source configuration changed');
    }
    if (!current.enabled) throw new Error('Source is disabled');
    if (input.rows.length === 0 && current.source_kind !== 'ircc_newsroom') {
      throw new Error('Only the newsroom can have an empty generation');
    }
    const hashes = await Promise.all(input.rows.map(r => sha256(r.chunk_text)));
    const fingerprint = await sha256(hashes.join(','));
    this.events.push(`open:${input.rows.length}`);
    const open = this.jobs.find(j => j.sourceId === input.sourceId && j.status === 'open');
    if (open) {
      if (
        open.model === input.embeddingModel &&
        open.contract === input.contract &&
        JSON.stringify(open.config) === JSON.stringify(current) &&
        open.contentHash === input.contentHash &&
        open.rows.size === input.rows.length &&
        open.fingerprint === fingerprint
      ) {
        open.operationIds.push(input.operationId);
        Object.assign(open, {
          title: input.title,
          documentMetadata: input.documentMetadata,
          fetchedAt: input.fetchedAt,
          lastService: ++this.tick,
        });
        for (const r of input.rows) open.rows.get(r.chunk_index)!.metadata = r.metadata;
        return { ...this.summary(open), replayed: false, resumed: true };
      }
      this.close(open, 'superseded', 'superseded', null);
      open.rows.clear();
    }
    const job: FakeJob = {
      id: crypto.randomUUID(),
      operationIds: [input.operationId],
      sourceId: input.sourceId,
      status: 'open',
      terminalReason: null,
      model: input.embeddingModel,
      contract: input.contract,
      config: current,
      contentHash: input.contentHash,
      fingerprint,
      title: input.title,
      documentMetadata: input.documentMetadata,
      fetchedAt: input.fetchedAt,
      total: input.rows.length,
      cap: 2 * Math.ceil(input.rows.length / 20) + 5,
      reserved: 0,
      created: ++this.tick,
      lastService: this.tick,
      promotedDocumentId: null,
      rows: new Map(
        input.rows.map((r, i) => [
          r.chunk_index,
          { text: r.chunk_text, hash: hashes[i], metadata: r.metadata, embedding: null },
        ])
      ),
      reservations: new Map(),
    };
    this.jobs.push(job);
    return { ...this.summary(job), replayed: false, resumed: false };
  }
  beginService(input: Parameters<IngestStore['beginService']>[0]) {
    try {
      const job = this.job(input.jobId);
      if (!job) throw new Error('Generation job not found');
      this.guardJobWrite(job.sourceId, input.token, input.embeddingModel, input.contract);
      if (!this.lockJob(job, input.embeddingModel, input.contract)) {
        return Promise.resolve({ ...this.summary(job), serviced: false });
      }
      job.lastService = ++this.tick;
      return Promise.resolve({ ...this.summary(job), serviced: true });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  reserveBatch(input: Parameters<IngestStore['reserveBatch']>[0]) {
    try {
      const job = this.job(input.jobId);
      if (!job) throw new Error('Generation job not found');
      this.guardJobWrite(job.sourceId, input.token, input.embeddingModel, input.contract);
      const none = { request_id: null, reservation_outcome: null, replayed: false, rows: [] };
      const prior = job.reservations.get(input.requestId);
      const open = this.lockJob(job, input.embeddingModel, input.contract);
      const rowsOf = (indexes: number[]) =>
        indexes.map(i => ({
          chunk_index: i,
          chunk_text: job.rows.get(i)!.text,
          text_sha256: job.rows.get(i)!.hash,
        }));
      if (prior) {
        return Promise.resolve({
          ...this.summary(job),
          request_id: input.requestId,
          reservation_outcome: prior.outcome,
          replayed: true,
          rows:
            open && prior.outcome === 'reserved' && prior.token === input.token
              ? rowsOf(prior.indexes)
              : [],
        });
      }
      if (!open) return Promise.resolve({ ...this.summary(job), ...none });
      const missing = [...job.rows.entries()]
        .filter(([, r]) => r.embedding === null)
        .map(([i]) => i)
        .sort((a, b) => a - b)
        .slice(0, 20);
      if (missing.length === 0) return Promise.resolve({ ...this.summary(job), ...none });
      if (job.reserved >= job.cap) {
        this.close(job, 'failed', 'request_cap', 'Embedding request cap reached');
        job.rows.clear();
        return Promise.resolve({ ...this.summary(job), ...none });
      }
      for (const r of job.reservations.values()) {
        if (r.outcome === 'reserved') r.outcome = 'abandoned';
      }
      job.reservations.set(input.requestId, {
        token: input.token,
        indexes: missing,
        outcome: 'reserved',
      });
      job.reserved++;
      this.events.push(`reserve:${missing.length}`);
      return Promise.resolve({
        ...this.summary(job),
        request_id: input.requestId,
        reservation_outcome: 'reserved' as const,
        replayed: false,
        rows: rowsOf(missing),
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  stageBatch(input: Parameters<IngestStore['stageBatch']>[0]) {
    try {
      const job = this.job(input.jobId);
      if (!job) throw new Error('Generation job not found');
      this.guardJobWrite(job.sourceId, input.token, input.embeddingModel, input.contract);
      const reservation = job.reservations.get(input.requestId);
      if (!reservation && job.status === 'open') {
        throw new Error('The reservation is not part of this job');
      }
      if (reservation && reservation.token !== input.token) {
        throw new Error('The reservation belongs to another owner');
      }
      if (!this.lockJob(job, input.embeddingModel, input.contract)) {
        return Promise.resolve({ ...this.summary(job), staged_now: 0, replayed: false });
      }
      if (reservation!.outcome === 'abandoned') throw new Error('The reservation was abandoned');
      checkReceipt(input.receipt, input.rows.length, job);
      const indexes = input.rows.map(r => r.chunk_index);
      if (
        JSON.stringify([...indexes].sort((a, b) => a - b)) !==
          JSON.stringify(reservation!.indexes) ||
        input.rows.some(r => job.rows.get(r.chunk_index)?.hash !== r.text_sha256)
      ) {
        throw new Error('Stage exactly the reserved rows and hashes');
      }
      if (reservation!.outcome === 'staged') {
        return Promise.resolve({ ...this.summary(job), staged_now: 0, replayed: true });
      }
      for (const r of input.rows) job.rows.get(r.chunk_index)!.embedding = r.embedding;
      reservation!.outcome = 'staged';
      this.events.push(`stage:${input.rows.length}`);
      return Promise.resolve({
        ...this.summary(job),
        staged_now: input.rows.length,
        replayed: false,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  promoteJob(input: Parameters<IngestStore['promoteJob']>[0]) {
    try {
      const job = this.job(input.jobId);
      if (!job) throw new Error('Generation job not found');
      if (job.status === 'promoted') {
        return Promise.resolve({
          ...this.summary(job),
          historical: true,
          document_id: job.promotedDocumentId,
        });
      }
      const closed = { historical: false, document_id: null };
      if (job.status !== 'open') return Promise.resolve({ ...this.summary(job), ...closed });
      this.guardJobWrite(job.sourceId, input.token, input.embeddingModel, input.contract);
      if (!this.lockJob(job, input.embeddingModel, input.contract)) {
        return Promise.resolve({ ...this.summary(job), ...closed });
      }
      const ordered = [...job.rows.entries()].sort(([a], [b]) => a - b);
      if (ordered.some(([, r]) => r.embedding === null)) {
        throw new Error('Staged chunks are incomplete');
      }
      const url = job.config.url;
      let doc = this.documents.find(d => d.url === url);
      if (doc && doc.updatedAt > job.fetchedAt) {
        this.close(job, 'superseded', 'newer_generation', null);
        return Promise.resolve({ ...this.summary(job), ...closed });
      }
      this.events.push(`promote:${url}`);
      if (!doc) {
        doc = {
          id: this.nextDocId++,
          url,
          title: job.title,
          contentHash: null,
          updatedAt: job.fetchedAt,
          metadata: {},
          embeddingModel: job.model,
        };
        this.documents.push(doc);
      }
      Object.assign(doc, {
        title: job.title,
        contentHash: job.contentHash,
        updatedAt: job.fetchedAt,
        metadata: job.documentMetadata,
        embeddingModel: job.model,
      });
      const id = doc.id;
      this.chunks = this.chunks.filter(c => c.document_id !== id);
      this.chunks.push(
        ...ordered.map(([index, r]) => ({
          document_id: id,
          chunk_index: index,
          chunk_text: r.text,
          embedding: r.embedding!,
          updated_at: job.fetchedAt,
          metadata: r.metadata,
          embeddingModel: job.model,
        }))
      );
      job.status = 'promoted';
      job.terminalReason = 'promoted';
      job.promotedDocumentId = id;
      job.reservations.clear();
      this.logs.push({
        crawl_source_id: job.sourceId,
        url,
        status: 'success',
        content_changed: true,
        chunks_created: ordered.length,
        duration_ms: input.durationMs,
      });
      return Promise.resolve({ ...this.summary(job), historical: false, document_id: id });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  rejectBatch(input: Parameters<IngestStore['rejectBatch']>[0]) {
    try {
      const job = this.job(input.jobId);
      if (!job) throw new Error('Generation job not found');
      this.guardJobWrite(job.sourceId, input.token, input.embeddingModel, input.contract);
      if (job.reservations.get(input.requestId)?.token !== input.token) {
        throw new Error("The reservation is not this owner's");
      }
      if (this.lockJob(job, input.embeddingModel, input.contract)) {
        this.close(job, 'failed', 'contract_rejected', input.error);
        job.rows.clear();
      }
      return Promise.resolve(this.summary(job));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  retireJob(jobId: string) {
    const job = this.job(jobId);
    if (!job || job.status !== 'open') return Promise.resolve({ retired: false });
    const current = this.currentConfig(job.sourceId);
    let reason: string | null = null;
    if (job.model !== this.servingModel || job.contract !== this.servingContract) {
      reason = 'model_changed';
    } else if (
      current === null ||
      JSON.stringify(current) !== JSON.stringify(job.config) ||
      !current.enabled
    ) {
      reason = 'configuration_changed';
    }
    if (reason === null) return Promise.resolve({ retired: false });
    this.close(job, 'failed', reason, null);
    job.rows.clear();
    return Promise.resolve({ retired: true });
  }
  listOpenJobs(): Promise<OpenJob[]> {
    return Promise.resolve(
      this.jobs
        .filter(j => j.status === 'open')
        .sort(
          (a, b) =>
            (a.lastService ?? -1) - (b.lastService ?? -1) || a.created - b.created
        )
        .map(j => {
          const source = this.sources.find(s => s.id === j.sourceId);
          const current = this.currentConfig(j.sourceId);
          return {
            job_id: j.id,
            crawl_source_id: j.sourceId,
            created_at: String(j.created),
            last_service_at: j.lastService === null ? null : String(j.lastService),
            fetched_at: j.fetchedAt,
            fingerprint: j.fingerprint,
            total: j.total,
            staged: [...j.rows.values()].filter(r => r.embedding !== null).length,
            reserved: j.reserved,
            cap: j.cap,
            compatible: j.model === this.servingModel && j.contract === this.servingContract,
            config_matches: JSON.stringify(current) === JSON.stringify(j.config),
            source_enabled: source?.enabled ?? false,
            crawl_frequency_hours: source?.crawl_frequency_hours ?? null,
          };
        })
    );
  }
  generationStatus(key: { jobId?: string; operationId?: string; requestId?: string }) {
    const job = this.jobs.find(
      j =>
        j.id === key.jobId ||
        (key.operationId !== undefined && j.operationIds.includes(key.operationId)) ||
        (key.requestId !== undefined && j.reservations.has(key.requestId))
    );
    if (!job) return Promise.resolve({ found: false, reservation: null });
    const reservation = key.requestId ? job.reservations.get(key.requestId) : undefined;
    return Promise.resolve({
      ...this.summary(job),
      found: true,
      reservation: reservation
        ? {
            request_id: key.requestId!,
            job_id: job.id,
            outcome: reservation.outcome,
            chunk_indexes: reservation.indexes,
          }
        : null,
    });
  }
}

function checkReceipt(receipt: EmbeddingReceipt, count: number, job: FakeJob) {
  if (
    receipt.model !== job.model ||
    receipt.contract !== job.contract ||
    !['canonical', 'catalog_hf'].includes(receipt.identity) ||
    receipt.checked !== count ||
    receipt.native_dimensions !== 4096 ||
    receipt.stored_dimensions !== 1536
  ) {
    throw new Error('The receipt does not match the reserved batch');
  }
}
