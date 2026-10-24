import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { extractDateModified } from './pageDates.ts';

// Markup copied from live canada.ca pages (2026-10-23 download).
const META = `<meta name="dcterms.issued" title="W3CDTF" content="2024-12-13"/>
<meta name="dcterms.modified" title="W3CDTF" content="2026-10-16"/>`;
const GCDS = `<gcds-date-modified>
	2026-10-13
</gcds-date-modified>`;
const LEGACY = `<dl id="wb-dtmd"><dt>Date modified:</dt><dd><time property="dateModified">2026-09-28</time></dd></dl>`;

// Falsifier: returning the dcterms.issued date (2024-12-13) or null fails this.
Deno.test('reads the dcterms.modified meta tag, not the issued date', () => {
  assertEquals(extractDateModified(`<head>${META}</head>`), '2026-10-16');
});

Deno.test(
  'reads the gcds-date-modified element when the meta tag is missing',
  () => {
    assertEquals(extractDateModified(`<main>${GCDS}</main>`), '2026-10-13');
  }
);

Deno.test('reads the legacy wb-dtmd time element', () => {
  assertEquals(extractDateModified(`<footer>${LEGACY}</footer>`), '2026-09-28');
});

// Falsifier: accepting any text would return "yesterday" or an impossible date.
Deno.test('returns null when no valid ISO date is present', () => {
  assertEquals(extractDateModified('<html><body>no dates</body></html>'), null);
  assertEquals(
    extractDateModified('<meta name="dcterms.modified" content="yesterday"/>'),
    null
  );
  assertEquals(
    extractDateModified('<meta name="dcterms.modified" content="2026-13-45"/>'),
    null
  );
});
