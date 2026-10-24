import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { extractDateModified } from './pageDates.ts';

// Markup copied from live canada.ca pages (2026-10-23 download).
const META = `<meta name="dcterms.issued" title="W3CDTF" content="2024-12-13"/>
<meta name="dcterms.modified" title="W3CDTF" content="2026-10-16"/>`;
const GCDS = `<gcds-date-modified>
	2026-10-13
</gcds-date-modified>`;
const LEGACY = `<dl id="wb-dtmd"><dt>Date modified:</dt><dd><time property="dateModified">2026-09-28</time></dd></dl>`;

// Markup from the live official OINP page on ontario.ca (2026-10-24 download,
// HTTP 200, 99,233 bytes), one piece at a time.
const ONTARIO_META = `<meta property="article:published_time" content="2019-01-14" />
<meta property="article:modified_time" content="2026-10-20" />`;
const ONTARIO_DATA = `"archived":"unarchived","firstPublishedDate":"2019-01-14","lastUpdatedDate":"2026-10-20","pageTitle":"Ontario Immigrant Nominee Program"`;
const ONTARIO_TEXT = `        <small>Updated: October 20, 2026</small>`;

// Falsifier: the reviewed parser returns null for this page, so the fetch
// date was shown; returning the published_time (2019-01-14) also fails.
Deno.test('reads the Ontario page update date', () => {
  assertEquals(
    extractDateModified(`<head>${ONTARIO_META}</head>`),
    '2026-10-20'
  );
  assertEquals(
    extractDateModified(`<script>{${ONTARIO_DATA}}</script>`),
    '2026-10-20'
  );
  assertEquals(
    extractDateModified(`<main>${ONTARIO_TEXT}</main>`),
    '2026-10-20'
  );
  assertEquals(
    extractDateModified(
      '<meta property="article:modified_time" content="2026-10-20T09:15:00-04:00" />'
    ),
    '2026-10-20'
  );
  assertEquals(
    extractDateModified(
      Deno.readTextFileSync(
        new URL('./fixtures/ontario_oinp_dates.html', import.meta.url)
      )
    ),
    '2026-10-20'
  );
});

// Falsifier: the Ontario patterns must not turn an invalid value into a date.
Deno.test('an invalid Ontario date is not a date', () => {
  for (const html of [
    '<meta property="article:modified_time" content="2026-02-30" />',
    '"lastUpdatedDate":"2026-13-01"',
    '<small>Updated: Octember 20, 2026</small>',
    '<meta property="article:published_time" content="2019-01-14" />',
  ]) {
    assertEquals(extractDateModified(html), null, html);
  }
});

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
