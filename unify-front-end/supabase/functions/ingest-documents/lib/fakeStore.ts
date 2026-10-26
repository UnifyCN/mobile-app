// In-memory IngestStore for tests. Not imported by production code.
//
// It follows the database contract of the ingest_refresh_generations
// migration: one token per claimed source, staging per token, and promotion as
// one step, and the embedding model guards: writes name the serving model and
// stop while writers are paused. The SQL itself is tested in supabase/tests/,
// not here.
import { EMBEDDING_MODEL } from '../../_shared/embeddings.ts';
import type { CrawlSource } from './pickDueSources.ts';
import type {
  ChunkMetadataGroup,
  CrawlLogEntry,
  IngestStore,
  Metadata,
  StagedChunk,
  StoredDocument,
} from './types.ts';

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
  writersPaused = false;
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
  refreshMetadata(
    sourceId: number,
    token: string,
    input: {
      contentHash: string;
      documentPatch: Metadata;
      chunkGroups: ChunkMetadataGroup[];
      embeddingModel: string;
    }
  ) {
    try {
      this.guardWrite(input.embeddingModel);
      this.owns(sourceId, token);
    } catch (error) {
      return Promise.reject(error);
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
}
