export type DescriptionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; url: string };

// Only http and https are linked. Other schemes (javascript:, mailto:, tel:,
// file:, intent:) stay plain text so a content record cannot open an app.
const WEB_URL = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

export function splitDescriptionLinks(text: string): DescriptionSegment[] {
  const segments: DescriptionSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WEB_URL)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    if (/^https?:\/\/$/.test(url)) continue;
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, start) });
    }
    segments.push({ kind: 'link', text: url, url });
    cursor = start + url.length;
  }

  if (cursor < text.length || segments.length === 0) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }
  return segments;
}
