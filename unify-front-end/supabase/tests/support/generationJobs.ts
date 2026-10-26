// Helpers for the generation-job migration tests. Test support only, not
// production code. Every expected value a test compares against is built here
// from literals or from the database row, never by calling the code under test.
import { CONTRACT, QWEN, sha256Hex } from './embeddingModels.ts';
import { rows, type Db } from './sharedDb.ts';

export const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface SourceConfig {
  url: string;
  data_urls: string[];
  source_kind: string;
  province: string | null;
  enabled: boolean;
  label: string | null;
  crawl_frequency_hours: number;
}

/** The configuration a caller fetched with, read from the stored row. */
export async function configOf(db: Db, sourceId: number): Promise<SourceConfig> {
  const [row] = await rows<{
    url: string;
    data_urls: string[] | null;
    source_kind: string;
    province: string | null;
    enabled: boolean;
    label: string | null;
    crawl_frequency_hours: number;
  }>(
    db,
    `select url, data_urls, source_kind, province, enabled, label,
            crawl_frequency_hours
       from public.crawl_sources where id = $1`,
    [sourceId]
  );
  return { ...row, data_urls: row.data_urls ?? [] };
}

export async function sourceId(db: Db, kind: string): Promise<number> {
  const [row] = await rows<{ id: number }>(
    db,
    `select id::int as id from public.crawl_sources
      where source_kind = $1 and enabled order by id limit 1`,
    [kind]
  );
  return row.id;
}

export async function claim(db: Db, id: number, seconds = 300): Promise<string> {
  const [row] = await rows<{ token: string | null }>(
    db,
    `select public.claim_crawl_source($1, $2, $3)::text as token`,
    [id, seconds, QWEN]
  );
  if (!row.token) throw new Error(`source ${id} is busy`);
  return row.token;
}

/** Calls one jsonb function and returns its value. */
export async function call<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const result = await db.query<{ result: T }>(`select ${sql} as result`, params);
  return result.rows[0].result;
}

export interface ChunkRow {
  chunk_index: number;
  chunk_text: string;
  metadata: Record<string, unknown>;
}

export function chunkRows(count: number, seed = 'a'): ChunkRow[] {
  return Array.from({ length: count }, (_, i) => ({
    chunk_index: i,
    chunk_text: `Processing time for permit ${seed}-${i}: ${i + 1} weeks.`,
    metadata: { published_at: '2026-10-20', fetched_at: '2026-10-25T00:00:00.000Z' },
  }));
}

export interface OpenInput {
  operation?: string;
  source: number;
  token: string;
  config: SourceConfig;
  rows: ChunkRow[];
  model?: string;
  contract?: string;
  contentHash?: string;
  title?: string;
  documentMetadata?: Record<string, unknown>;
  fetchedAt?: string;
}

export function open(db: Db, o: OpenInput) {
  return call<Record<string, unknown>>(
    db,
    `public.ingest_generation_open(
       p_operation_id => $1::uuid, p_source_id => $2, p_token => $3::uuid,
       p_source_config => $4::jsonb, p_embedding_model => $5,
       p_contract => $6, p_content_hash => $7, p_title => $8,
       p_document_metadata => $9::jsonb, p_fetched_at => $10::timestamptz,
       p_rows => $11::jsonb, p_lease_seconds => 300)`,
    [
      o.operation ?? crypto.randomUUID(),
      o.source,
      o.token,
      JSON.stringify(o.config),
      o.model ?? QWEN,
      o.contract ?? CONTRACT,
      o.contentHash ?? 'content-hash',
      o.title ?? 'Title',
      JSON.stringify(o.documentMetadata ?? { source: 'crawler' }),
      o.fetchedAt ?? '2026-10-25T00:00:00.000Z',
      JSON.stringify(o.rows),
    ]
  );
}

/** sha256 of the comma-joined text hashes in index order. */
export async function fingerprintOf(texts: string[]): Promise<string> {
  const hashes = await Promise.all(texts.map(sha256Hex));
  return await sha256Hex(hashes.join(','));
}

export function reserve(
  db: Db,
  o: { request?: string; job: unknown; token: string; model?: string; contract?: string }
) {
  return call<Record<string, unknown> & { rows: Array<Record<string, unknown>> }>(
    db,
    `public.ingest_generation_reserve(
       p_request_id => $1::uuid, p_job_id => $2::uuid, p_token => $3::uuid,
       p_embedding_model => $4, p_contract => $5, p_lease_seconds => 300)`,
    [
      o.request ?? crypto.randomUUID(),
      o.job,
      o.token,
      o.model ?? QWEN,
      o.contract ?? CONTRACT,
    ]
  );
}

export async function crawlLogs(db: Db, sourceId: number) {
  return await rows<{
    status: string;
    error_message: string | null;
    chunks_created: number | null;
    content_changed: boolean | null;
  }>(
    db,
    `select status, error_message, chunks_created, content_changed
       from public.crawl_logs where crawl_source_id = $1 order by id`,
    [sourceId]
  );
}

/** Lets the lease run out, then claims the source as a new owner. */
export async function replaceOwner(db: Db, id: number): Promise<string> {
  await db.query(
    `update public.crawl_source_leases set expires_at = now() - interval '1 second'
      where crawl_source_id = $1`,
    [id]
  );
  return await claim(db, id);
}

export const RECEIPT = {
  model: QWEN,
  contract: CONTRACT,
  identity: 'canonical',
  checked: 0,
  native_dimensions: 4096,
  stored_dimensions: 1536,
};

/** A unit vector with `weight` on dimension `axis` and the rest on dimension 1535. */
export function unitVector(weight = 0.6, axis = 0): number[] {
  const values = new Array<number>(1536).fill(0);
  values[axis] = weight;
  values[1535] = Math.sqrt(1 - weight * weight);
  return values;
}

/** The stage payload for reserved rows, one vector each. */
export function stageRows(
  reserved: Array<Record<string, unknown>>,
  vector: (index: number) => number[] = () => unitVector()
) {
  return reserved.map(r => ({
    chunk_index: r.chunk_index as number,
    text_sha256: r.text_sha256 as string,
    embedding: vector(r.chunk_index as number),
  }));
}

export function stage(
  db: Db,
  o: {
    request: unknown;
    job: unknown;
    token: string;
    rows: Array<{ chunk_index: number; text_sha256: string; embedding: number[] }>;
    receipt?: Record<string, unknown>;
  }
) {
  return call<Record<string, unknown>>(
    db,
    `public.ingest_generation_stage(
       p_request_id => $1::uuid, p_job_id => $2::uuid, p_token => $3::uuid,
       p_embedding_model => $4, p_contract => $5, p_receipt => $6::jsonb,
       p_rows => $7::jsonb, p_lease_seconds => 300)`,
    [
      o.request,
      o.job,
      o.token,
      QWEN,
      CONTRACT,
      JSON.stringify(o.receipt ?? { ...RECEIPT, checked: o.rows.length }),
      JSON.stringify(o.rows),
    ]
  );
}

/** Reserves and stages every missing row of a job. */
export async function stageAll(db: Db, job: unknown, token: string) {
  for (;;) {
    const r = await reserve(db, { job, token });
    if (r.rows.length === 0) return r;
    await stage(db, { request: r.request_id, job, token, rows: stageRows(r.rows) });
  }
}

export function promote(db: Db, o: { job: unknown; token: string; model?: string }) {
  return call<Record<string, unknown>>(
    db,
    `public.ingest_generation_promote(
       p_job_id => $1::uuid, p_token => $2::uuid, p_embedding_model => $3,
       p_contract => $4, p_duration_ms => 1234, p_lease_seconds => 300)`,
    [o.job, o.token, o.model ?? QWEN, CONTRACT]
  );
}

/** The live document of a url and its chunks, for byte-equal comparisons. */
export async function live(db: Db, url: string) {
  const documents = await rows<Record<string, unknown>>(
    db,
    `select id::int as id, title, metadata, content_hash, embedding_model,
            (updated_at at time zone 'UTC')::text as updated_at
       from public.knowledge_documents where source_url = $1`,
    [url]
  );
  const chunks = await rows<Record<string, unknown>>(
    db,
    `select kc.chunk_index, kc.chunk_text, kc.metadata, kc.embedding_model,
            (kc.updated_at at time zone 'UTC')::text as updated_at, kc.embedding::text as embedding
       from public.knowledge_chunks kc
       join public.knowledge_documents kd on kd.id = kc.document_id
      where kd.source_url = $1 order by kc.chunk_index, kc.id`,
    [url]
  );
  return { documents, chunks };
}

/** The job row, its checked rows and its reservations, for byte-equal comparisons. */
export async function privateState(db: Db, job: unknown) {
  return {
    job: await rows(
      db,
      `select status, terminal_reason, closed_at is null as open, requests_reserved,
              request_cap, operation_ids::text as operation_ids, generation_fingerprint
         from public.knowledge_generation_jobs where id = $1`,
      [job]
    ),
    rows: await rows(
      db,
      `select chunk_index, text_sha256, embedding::text as embedding, receipt_identity,
              staged_by::text as staged_by
         from public.knowledge_generation_rows where job_id = $1 order by chunk_index`,
      [job]
    ),
    reservations: await rows(
      db,
      `select request_id::text as request_id, issuer_token::text as issuer_token,
              chunk_indexes::text as chunk_indexes, outcome
         from public.knowledge_generation_reservations where job_id = $1
        order by created_at, request_id`,
      [job]
    ),
  };
}

/** Every bound configuration field, changed one at a time on a record source. */
export const CONFIG_CHANGES: Array<[string, string]> = [
  ['url', `url = url || '?moved'`],
  ['data_urls', `data_urls = data_urls || array['https://www.canada.ca/extra.json']`],
  ['source_kind', `source_kind = 'ircc_express_entry_rounds'`],
  ['province', `province = 'Alberta'`],
  ['enabled', `enabled = false`],
  ['label', `label = coalesce(label, '') || ' changed'`],
  ['crawl_frequency_hours', `crawl_frequency_hours = crawl_frequency_hours + 1`],
];
