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

function errorOf(json: unknown): string {
  try {
    convertExpressEntryRounds(json);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

// Falsifier: the reviewed converter silently drops a malformed current draw
// and returns fewer or older draws, which then replace the complete set.
Deno.test('a malformed draw among the ten newest fails the source', () => {
  const cases: Array<[number, Record<string, unknown>, string]> = [
    [0, { drawCRS: '' }, '450'],
    [1, { drawSize: null }, '449'],
    [2, { drawDate: 'not a date' }, '448'],
    [9, { drawNumber: '441b' }, '441b'],
  ];
  for (const [index, patch, number] of cases) {
    const rounds = sample.rounds.map((row: object, i: number) =>
      i === index ? { ...row, ...patch } : row
    );
    assertEquals(
      errorOf({ rounds }),
      `Express Entry rounds: malformed draw ${number}`,
      JSON.stringify(patch)
    );
  }
  // A draw with no number cannot be placed, so it may be current.
  assertEquals(
    errorOf({
      rounds: [
        { ...sample.rounds[0], drawNumber: undefined },
        ...sample.rounds,
      ],
    }),
    'Express Entry rounds: malformed draw undefined'
  );
});

// Falsifier: rejecting every malformed row would fail the official file,
// whose historical draws 91a and 91b carry a letter.
Deno.test(
  'a malformed historical draw outside the ten newest is ignored',
  () => {
    const records = convertExpressEntryRounds({
      rounds: [
        ...sample.rounds,
        { ...sample.rounds[12], drawNumber: '91b', drawDate: '2018-05-30' },
        { ...sample.rounds[12], drawNumber: '90', drawSize: '' },
      ],
    });

    assertEquals(
      records.map(r => r.text.match(/#(\d+)/)![1]),
      ['450', '449', '448', '447', '446', '445', '444', '443', '442', '441']
    );
  }
);

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
