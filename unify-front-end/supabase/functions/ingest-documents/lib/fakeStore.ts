// In-memory IngestStore for tests. Not imported by production code.
import type { CrawlSource } from './pickDueSources.ts';
import type {
  ChunkRow,
  CrawlLogEntry,
  IngestStore,
  Metadata,
  StoredDocument,
} from './types.ts';

export interface FakeDocument {
  id: number;
  url: string;
  title: string;
  contentHash: string | null;
  updatedAt: string;
  metadata: Metadata;
}

export class FakeStore implements IngestStore {
  sources: CrawlSource[];
  documents: FakeDocument[] = [];
  chunks: ChunkRow[] = [];
  logs: CrawlLogEntry[] = [];
  events: string[] = [];
  failOnInsertChunksCall: number | null = null;
  failRecordAttemptFor = new Set<number>();
  private nextDocId = 1;
  private insertCalls = 0;

  constructor(sources: CrawlSource[] = []) {
    this.sources = sources;
  }

  chunksOf(documentId: number): ChunkRow[] {
    return this.chunks
      .filter(c => c.document_id === documentId)
      .sort((a, b) => a.chunk_index - b.chunk_index);
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
    return Promise.resolve(d ? { id: d.id, contentHash: d.contentHash } : null);
  }
  saveDocument(input: {
    id: number | null;
    url: string;
    title: string;
    updatedAt: string;
    metadata: Metadata;
  }) {
    this.events.push(`saveDocument:${input.url}`);
    if (input.id === null) {
      const id = this.nextDocId++;
      this.documents.push({
        id,
        url: input.url,
        title: input.title,
        contentHash: null,
        updatedAt: input.updatedAt,
        metadata: input.metadata,
      });
      return Promise.resolve(id);
    }
    const d = this.documents.find(x => x.id === input.id)!;
    d.title = input.title;
    d.updatedAt = input.updatedAt;
    d.metadata = input.metadata;
    return Promise.resolve(d.id);
  }
  insertChunks(rows: ChunkRow[]) {
    this.insertCalls += 1;
    if (this.failOnInsertChunksCall === this.insertCalls) {
      return Promise.reject(new Error('chunk insert failed'));
    }
    this.chunks.push(...rows);
    return Promise.resolve();
  }
  setContentHash(documentId: number, hash: string) {
    this.documents.find(x => x.id === documentId)!.contentHash = hash;
    return Promise.resolve();
  }
  deleteChunksBefore(documentId: number, before: string) {
    this.chunks = this.chunks.filter(
      c => !(c.document_id === documentId && c.updated_at < before)
    );
    return Promise.resolve();
  }
  deleteChunksAt(documentId: number, at: string) {
    this.chunks = this.chunks.filter(
      c => !(c.document_id === documentId && c.updated_at === at)
    );
    return Promise.resolve();
  }
  refreshMetadata(
    documentId: number,
    input: { documentPatch: Metadata; chunkMetadata: Metadata }
  ) {
    const d = this.documents.find(x => x.id === documentId)!;
    d.metadata = { ...d.metadata, ...input.documentPatch };
    for (const c of this.chunks) {
      if (c.document_id === documentId) c.metadata = { ...input.chunkMetadata };
    }
    return Promise.resolve();
  }
  recordAttempt(sourceId: number, at: string) {
    if (this.failRecordAttemptFor.has(sourceId)) {
      return Promise.reject(new Error('database unavailable'));
    }
    this.events.push(`recordAttempt:${sourceId}`);
    this.sources.find(x => x.id === sourceId)!.last_crawled_at = at;
    return Promise.resolve();
  }
  logCrawl(entry: CrawlLogEntry) {
    this.logs.push(entry);
    return Promise.resolve();
  }
}
