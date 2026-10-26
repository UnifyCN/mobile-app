/**
 * Resource limits for one source. A limit failure stops the source with a
 * fixed error before any job, provider request or live change; records are
 * never truncated to fit. The measured current IRCC processing-times feed
 * (2026-10-26): five files, 610120 bytes in all, the largest 496261 bytes;
 * 1950 records, the longest 225 bytes of text.
 */
const KIB = 1024;
const MIB = 1024 * KIB;

/** Decoded bytes of one fetched file (an HTML page or one JSON file). */
export const MAX_SOURCE_FILE_BYTES = 2 * MIB;
/** Decoded bytes of all of one source's files together. */
export const MAX_SOURCE_TOTAL_BYTES = 8 * MIB;
/** Data addresses one source may list; a longer list is refused before any fetch. */
export const MAX_SOURCE_DATA_URLS = 8;
/** Records or chunks in one generation. */
export const MAX_GENERATION_CHUNKS = 5000;
/** UTF-8 bytes of one chunk's text. */
export const MAX_CHUNK_TEXT_BYTES = 8 * KIB;
/** UTF-8 bytes of one chunk's (or the document's) serialized metadata. */
export const MAX_CHUNK_METADATA_BYTES = 16 * KIB;
/** UTF-8 bytes of a generation's serialized rows, sent in one call. */
export const MAX_JOB_PAYLOAD_BYTES = 8 * MIB;
/** Decoded bytes of one embedding answer (20 inputs of 4096 values). */
export const MAX_EMBEDDING_RESPONSE_BYTES = 4 * MIB;

/** A fixed-class limit failure. The message never holds a body. */
export class ResourceLimitError extends Error {
  constructor(readonly limit: string) {
    super(`Source input exceeds the ${limit} limit`);
    this.name = 'ResourceLimitError';
  }
}
