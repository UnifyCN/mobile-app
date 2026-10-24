import { parseLongDate } from './ircc/dates.ts';

// Each pattern captures a YYYY-MM-DD date, except where a reader is given.
const PATTERNS: Array<{
  pattern: RegExp;
  read?: (value: string) => string | null;
}> = [
  // canada.ca
  {
    pattern:
      /<meta[^>]*name=["']dcterms\.modified["'][^>]*content=["']([^"']+)["']/i,
  },
  {
    pattern: /<gcds-date-modified[^>]*>\s*([^<\s]+)\s*<\/gcds-date-modified>/i,
  },
  {
    pattern:
      /<time[^>]*property=["']dateModified["'][^>]*>\s*([^<\s]+)\s*<\/time>/i,
  },
  // ontario.ca: the date part of article:modified_time, which may be a full
  // timestamp, then the page data, then the visible "Updated:" line.
  {
    pattern:
      /<meta[^>]*property=["']article:modified_time["'][^>]*content=["'](\d{4}-\d{2}-\d{2})(?:T[^"']*)?["']/i,
  },
  { pattern: /"lastUpdatedDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/ },
  {
    pattern: /Updated:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/,
    read: parseLongDate,
  },
];

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Returns the page's "Date modified" as YYYY-MM-DD, or null when absent. */
export function extractDateModified(html: string): string | null {
  for (const { pattern, read } of PATTERNS) {
    const raw = pattern.exec(html)?.[1]?.trim();
    const value = raw && read ? read(raw) : raw;
    if (value && isValidIsoDate(value)) return value;
  }
  return null;
}
