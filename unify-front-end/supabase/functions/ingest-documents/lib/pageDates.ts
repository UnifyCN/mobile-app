const PATTERNS: RegExp[] = [
  /<meta[^>]*name=["']dcterms\.modified["'][^>]*content=["']([^"']+)["']/i,
  /<gcds-date-modified[^>]*>\s*([^<\s]+)\s*<\/gcds-date-modified>/i,
  /<time[^>]*property=["']dateModified["'][^>]*>\s*([^<\s]+)\s*<\/time>/i,
];

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Returns the page's "Date modified" as YYYY-MM-DD, or null when absent. */
export function extractDateModified(html: string): string | null {
  for (const pattern of PATTERNS) {
    const value = pattern.exec(html)?.[1]?.trim();
    if (value && isValidIsoDate(value)) return value;
  }
  return null;
}
