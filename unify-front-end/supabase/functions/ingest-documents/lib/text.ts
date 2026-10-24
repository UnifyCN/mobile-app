// Quality thresholds
export const MIN_CHUNK_WORDS = 30;
const MAX_CHUNK_WORDS = 1500;

// Common boilerplate patterns found on gov sites
const BOILERPLATE_PATTERNS: RegExp[] = [
  /^skip to (main )?content$/i,
  /^(primary|secondary) (menu|navigation)$/i,
  /^(date modified|last updated):\s/i,
  /^report a problem/i,
  /^share this page/i,
  /^is there anything wrong/i,
  /^thank you for your help/i,
  /^government of canada$/i,
  /^breadcrumb$/i,
];

/**
 * Strips HTML tags, scripts, styles, nav elements, and normalizes whitespace.
 * Optimized for government websites (canada.ca, IRCC).
 */
export function htmlToCleanText(html: string): string {
  let text = html;

  // Remove script and style blocks entirely
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Remove nav, header, footer elements (common site chrome)
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert common block elements to newlines for structure
  text = text.replace(
    /<\/?(p|div|br|h[1-6]|li|tr|td|th|blockquote|section|article)[^>]*>/gi,
    '\n'
  );

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, value: string) =>
    String.fromCharCode(parseInt(value, 16))
  );
  text = text.replace(/&#(\d+);/g, (_, value: string) =>
    String.fromCharCode(parseInt(value, 10))
  );

  // Normalize whitespace: collapse multiple spaces/tabs, trim lines
  text = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Returns true if a chunk passes quality checks.
 * Filters out boilerplate, too-short, and too-long chunks.
 */
export function isQualityChunk(text: string): boolean {
  const wordCount = text.split(/\s+/).length;

  // Too short - likely a nav fragment or heading
  if (wordCount < MIN_CHUNK_WORDS) return false;

  // Too long - should have been split further
  if (wordCount > MAX_CHUNK_WORDS) return false;

  // Check for boilerplate patterns
  const firstLine = text.split('\n')[0].trim();
  if (BOILERPLATE_PATTERNS.some(pattern => pattern.test(firstLine))) {
    return false;
  }

  return true;
}

export async function computeContentHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
