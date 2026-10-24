import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { convertExpressEntryRounds } from './expressEntry.ts';

const sample = JSON.parse(
  Deno.readTextFileSync(
    new URL('../fixtures/ircc/ee_rounds_sample.json', import.meta.url)
  )
);

// Falsifier: a converter that returns [] or uses another sentence shape fails.
Deno.test('newest draw becomes the agreed sentence with its own date', () => {
  const records = convertExpressEntryRounds(sample);

  assertEquals(records[0], {
    text: 'Express Entry draw #450 on October 16, 2026: French-Language proficiency 2026-Version 2, 5,000 invitations, minimum CRS 435.',
    publishedAt: '2026-10-16',
  });
});

// Falsifier: with no limit the 13 sample rows give 13 records, not 10.
Deno.test('keeps only the ten most recent draws, newest first', () => {
  const records = convertExpressEntryRounds(sample);

  assertEquals(records.length, 10);
  assertEquals(
    records.map(r => r.text.match(/#(\d+)/)![1]),
    ['450', '449', '448', '447', '446', '445', '444', '443', '442', '441']
  );
});

// Falsifier: trusting file order keeps the shuffled-in old draw #1 first.
Deno.test('orders by draw date, not by file order', () => {
  const shuffled = {
    rounds: [...sample.rounds].reverse(),
  };

  const records = convertExpressEntryRounds(shuffled);

  assertEquals(records[0].publishedAt, '2026-10-16');
  assertEquals(records[9].publishedAt, '2026-09-04');
});

// Falsifier: a converter that does not check fields writes "undefined" or
// "minimum CRS " into a chunk.
Deno.test('skips a malformed draw and still returns ten valid ones', () => {
  const broken = {
    rounds: [
      { ...sample.rounds[0], drawCRS: '' },
      { ...sample.rounds[1], drawDate: 'not a date' },
      { ...sample.rounds[2], drawNumber: undefined },
      ...sample.rounds.slice(3),
    ],
  };

  const records = convertExpressEntryRounds(broken);

  assertEquals(records.length, 10);
  assertEquals(
    records.map(r => r.text.match(/#(\d+)/)![1]),
    ['447', '446', '445', '444', '443', '442', '441', '440', '439', '1']
  );
  assertEquals(
    records.filter(r => /undefined|CRS \.|null/.test(r.text)).length,
    0
  );
});

Deno.test(
  'a file without a rounds list is an error, not an empty source',
  () => {
    for (const bad of [null, {}, { rounds: 'x' }, [], 'text']) {
      let message = '';
      try {
        convertExpressEntryRounds(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      assertEquals(message, 'Express Entry rounds: no rounds list');
    }
  }
);
