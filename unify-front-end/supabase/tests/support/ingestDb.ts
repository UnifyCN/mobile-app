// The shared database with every ingestion migration, in release order. Test
// support only, not production code.
import { applyMigration, openBaselineDb, type Db } from './sharedDb.ts';

/** Migration slugs in the documented release order (see the migration headers). */
export const INGEST_RELEASE_ORDER = [
  'crawl_sources_province',
  'match_chunks_province_filter',
  'crawl_sources_record_sources',
  'match_chunks_chunk_source_url',
  'ingest_refresh_generations',
  'seed_province_crawl_sources',
  'seed_ircc_record_sources',
];

export async function openIngestDb(
  order: string[] = INGEST_RELEASE_ORDER
): Promise<Db> {
  const db = await openBaselineDb();
  // crawl_logs is created by the ingestion migration, outside the baseline slice.
  const ingestion = await Deno.readTextFile(
    new URL(
      '../../migrations/20260320_rag_ingestion_pipeline.sql',
      import.meta.url
    )
  );
  await db.exec(
    ingestion.match(
      /create table if not exists public\.crawl_logs \([\s\S]*?\);/
    )![0]
  );
  for (const slug of order) await applyMigration(db, slug);
  return db;
}
