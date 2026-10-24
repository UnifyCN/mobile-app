/** One fact that becomes one chunk. */
export interface SourceRecord {
  text: string;
  /** Date the source gives for this fact (YYYY-MM-DD), or null when it gives none. */
  publishedAt: string | null;
  /** Page of this specific record, when the source has one (newsroom items). */
  sourceUrl?: string;
}
