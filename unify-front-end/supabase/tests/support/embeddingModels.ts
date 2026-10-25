// Seed and control helpers for the embedding-model migration tests. Test
// support only, not production code.
import { embedding, rows, type Db } from './sharedDb.ts';

export const LEGACY = 'openai/text-embedding-3-small';
export const QWEN = 'qwen/qwen3-embedding-8b';

/** One document with one chunk. The vector is the same for every model. */
export async function seedChunk(
  db: Db,
  o: {
    url: string;
    text: string;
    model?: string;
    weight?: number;
    metadata?: Record<string, unknown>;
    documentModel?: string;
    updatedAt?: string;
  }
): Promise<{ documentId: number; chunkId: number }> {
  const [doc] = await rows<{ id: number }>(
    db,
    `insert into public.knowledge_documents
       (title, storage_path, source_url, embedding_model, updated_at)
     values ($1, '', $2, $3, $4) returning id::int as id`,
    [
      o.url,
      o.url,
      o.documentModel ?? o.model ?? LEGACY,
      o.updatedAt ?? '2026-10-01T00:00:00Z',
    ]
  );
  const [chunk] = await rows<{ id: number }>(
    db,
    `insert into public.knowledge_chunks
       (document_id, chunk_index, chunk_text, embedding, metadata, embedding_model, updated_at)
     values ($1, 0, $2, $3::vector, $4::jsonb, $5, $6) returning id::int as id`,
    [
      doc.id,
      o.text,
      embedding(o.weight ?? 0.9),
      JSON.stringify(o.metadata ?? {}),
      o.model ?? LEGACY,
      o.updatedAt ?? '2026-10-01T00:00:00Z',
    ]
  );
  return { documentId: doc.id, chunkId: chunk.id };
}

export async function setControl(
  db: Db,
  phase: string,
  serving: string,
  extra = ''
) {
  await db.query(
    `update public.knowledge_embedding_cutover
        set phase = $1, serving_model = $2 ${extra}`,
    [phase, serving]
  );
}

export const CONTRACT = 'qwen3-8b-prefix1536-l2-v1';

/** A 1536-coordinate vector literal for the new model: weight on dimension 2. */
export function qwenVector(weight: number): string {
  const values = new Array<number>(1536).fill(0);
  values[2] = weight;
  values[3] = Math.sqrt(Math.max(0, 1 - weight * weight));
  return `[${values.join(',')}]`;
}

/**
 * A stub's vectors with the receipt the real adapter gives a canonical answer.
 * Only for tests of the call sequence: the receipt itself is tested through
 * the served handler with the real adapter (index_rebuild_test.ts).
 */
export const withReceipt =
  (embed: (texts: string[]) => Promise<number[][]>) =>
  async (texts: string[]) => {
    const vectors = await embed(texts);
    return {
      vectors,
      receipt: {
        model: QWEN,
        contract: CONTRACT,
        identity: 'canonical' as const,
        checked: vectors.length,
        native_dimensions: 4096,
        stored_dimensions: 1536,
      },
    };
  };

export const sha256Hex = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    ),
  ]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

/** The rebuild functions, by name, returning their first column. */
export async function call<T = unknown>(
  db: Db,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const result = await db.query<{ result: T }>(
    `select ${sql} as result`,
    params
  );
  return result.rows[0].result;
}

export interface Batch {
  remaining: number;
  rows: { chunk_id: number; text: string }[];
}

/** Embeds the next batch with a stand-in model: weight from the chunk id. */
export async function runBatch(
  db: Db,
  run: string,
  token: string,
  limit = 20
): Promise<{ staged: number; remaining: number; sent: number }> {
  const batch = await call<Batch>(
    db,
    `public.knowledge_embedding_next_batch($1::uuid, $2::uuid, $3, 300)`,
    [run, token, limit]
  );
  if (batch.rows.length === 0) return { staged: 0, remaining: 0, sent: 0 };
  const rows = await Promise.all(
    batch.rows.map(async r => ({
      chunk_id: r.chunk_id,
      text_sha256: await sha256Hex(r.text),
      embedding: JSON.parse(qwenVector(0.5 + (r.chunk_id % 7) / 20)),
    }))
  );
  const staged = await call<{ staged: number; remaining: number }>(
    db,
    `public.knowledge_embedding_stage_batch($1::uuid, $2::uuid, $3, $4, $5::jsonb, 300)`,
    [run, token, QWEN, CONTRACT, JSON.stringify(rows)]
  );
  return { ...staged, sent: rows.length };
}

/**
 * The stated production corpus: 351 chunks in 33 documents. 13 documents hold
 * one chunk each and are linked to a crawl source; 20 uploaded documents hold
 * the other 338 chunks (18 documents of 17 chunks and 2 of 16).
 */
export async function seedStatedCorpus(db: Db): Promise<void> {
  const urls = await rows<{ url: string }>(
    db,
    `select url from public.crawl_sources order by id limit 13`
  );
  for (const [i, u] of urls.entries()) {
    await seedChunk(db, {
      url: u.url,
      text: `linked ${i}`,
      metadata: {
        province: i % 2 === 0 ? null : 'Ontario',
        fetched_at: `2026-10-0${(i % 9) + 1}T00:00:00Z`,
      },
      updatedAt: `2026-09-${10 + i}T00:00:00Z`,
    });
  }
  for (let d = 0; d < 20; d++) {
    const { documentId } = await seedChunk(db, {
      url: `https://upload.test/${d}`,
      text: `upload ${d} chunk 0`,
      updatedAt: `2026-08-${10 + d}T00:00:00Z`,
    });
    const count = d < 18 ? 17 : 16;
    await db.query(
      `insert into public.knowledge_chunks (document_id, chunk_index, chunk_text, embedding, updated_at)
       select $1::bigint, g, 'upload ' || $1::text || ' chunk ' || g, $2::vector, '2026-08-01T00:00:00Z' from generate_series(1, $3::int) g`,
      [documentId, embedding(0.8), count - 1]
    );
  }
}
