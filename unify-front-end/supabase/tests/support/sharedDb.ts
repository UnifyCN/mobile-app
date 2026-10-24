// Local Postgres (PGlite with pgvector) for migration tests. Not production code.
//
// The harness builds the shared database as it was before the province work
// (fixtures/shared_db_before_province.sql), seeds crawl_sources from the real
// ingestion migration, and applies the real migration files by name. A test
// therefore runs the SQL that ships, never a copy of its conditions.
import { PGlite } from 'npm:@electric-sql/pglite@0.4.6';
import { vector } from 'npm:@electric-sql/pglite@0.4.6/vector';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
export const EMBEDDING_DIMENSIONS = 1536;

export type Db = PGlite;

export async function openBaselineDb(): Promise<Db> {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(
    await Deno.readTextFile(
      new URL('../fixtures/shared_db_before_province.sql', import.meta.url)
    )
  );
  // The 25 national sources that exist before the province work.
  const ingestion = await Deno.readTextFile(
    new URL('20260320_rag_ingestion_pipeline.sql', MIGRATIONS_DIR)
  );
  const seedAt = ingestion.indexOf('INSERT INTO public.crawl_sources');
  if (seedAt < 0) throw new Error('crawl_sources seed not found');
  await db.exec(ingestion.slice(seedAt));
  return db;
}

/** Applies the migration whose file name ends with `_<slug>.sql`. */
export async function applyMigration(db: Db, slug: string): Promise<void> {
  const matches: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.name.endsWith(`_${slug}.sql`)) matches.push(entry.name);
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one migration for ${slug}, found ${matches}`);
  }
  await db.exec(await Deno.readTextFile(new URL(matches[0], MIGRATIONS_DIR)));
}

/** A 1536-dimension vector literal: `weight` on dimension 0, the rest on dimension 1. */
export function embedding(weight: number): string {
  const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  values[0] = weight;
  values[1] = Math.sqrt(Math.max(0, 1 - weight * weight));
  return `[${values.join(',')}]`;
}

export async function rows<T = Record<string, unknown>>(
  db: Db,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

// The mobile app's own list is the source of truth for the 13 names. Since
// #347 constants/LocationData.ts re-exports it from the shared module.
export async function canadianProvinces(): Promise<string[]> {
  const { PROVINCES } = await import('../../functions/_shared/province.ts');
  return [...PROVINCES];
}
