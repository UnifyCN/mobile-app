import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decodeHtmlEntities } from './htmlEntities.ts';

Deno.test('named, decimal and hex references are decoded', () => {
  assertEquals(decodeHtmlEntities('d&rsquo;Ivoire'), 'd’Ivoire');
  assertEquals(
    decodeHtmlEntities('C&ocirc;te &amp; Cura&ccedil;ao'),
    'Côte & Curaçao'
  );
  assertEquals(decodeHtmlEntities('&#8217;&#x2019;&#X2019;'), '’’’');
});

// Falsifier: a decoder that throws on, or rewrites, a reference it cannot read
// would lose official text.
Deno.test(
  'unknown or invalid references and other text are left as written',
  () => {
    const kept = '&unknown; &#0; &#xD800; &#1114112; & < <b>Côte</b> 日本 &amp';
    assertEquals(decodeHtmlEntities(kept), kept);
  }
);

Deno.test('a reference is decoded once', () => {
  assertEquals(decodeHtmlEntities('&amp;rsquo; &amp;#39;'), '&rsquo; &#39;');
});

// Falsifier: a lookup that reads inherited object properties turns these
// names into JavaScript function text instead of leaving them as written.
Deno.test(
  'names inherited from Object are not entities and stay as written',
  () => {
    for (const name of [
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
      '__proto__',
    ]) {
      assertEquals(decodeHtmlEntities(`a &${name}; b`), `a &${name}; b`);
    }
  }
);

Deno.test('the dash references still decode to their characters', () => {
  assertEquals(decodeHtmlEntities('&mdash;&ndash;'), '\u2014–');
});
