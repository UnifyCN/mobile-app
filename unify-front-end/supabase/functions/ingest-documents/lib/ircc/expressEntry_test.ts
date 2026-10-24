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

const BAD_SIZES = [
  'NaN',
  'Infinity',
  '-5',
  '-1,000',
  '1e3',
  '5.0',
  '1,00',
  '1,0000',
  ',100',
  '1,,000',
  '1,000,',
  '12,34',
  '1 000',
  '5,000 invitations',
  '0x10',
];
const BAD_CRS = [
  'NaN',
  'Infinity',
  '-435',
  '4e2',
  '435.5',
  '4,35',
  '1,000',
  '435 points',
  '0x1B3',
];

// Falsifier: the reviewed converter accepts any nonempty text, so "NaN"
// invitations or CRS reach the stored sentence.
Deno.test('malformed current invitation counts fail the source', () => {
  for (const drawSize of BAD_SIZES) {
    const rounds = sample.rounds.map((row: object, i: number) =>
      i === 0 ? { ...row, drawSize } : row
    );
    assertEquals(
      errorOf({ rounds }),
      'Express Entry rounds: malformed draw 450',
      drawSize
    );
  }
});

Deno.test('malformed current CRS scores fail the source', () => {
  for (const drawCRS of BAD_CRS) {
    const rounds = sample.rounds.map((row: object, i: number) =>
      i === 0 ? { ...row, drawCRS } : row
    );
    assertEquals(
      errorOf({ rounds }),
      'Express Entry rounds: malformed draw 450',
      drawCRS
    );
  }
});

// Falsifier: a stricter pattern that drops the comma groups or padding the
// official feed carries rejects real draws.
Deno.test('official comma-grouped and plain counts stay valid', () => {
  for (const [drawSize, shown] of [
    ['5,000', '5,000'],
    ['752', '752'],
    ['1,234,567', '1,234,567'],
    ['5000', '5000'],
    [' 2,500 ', '2,500'],
  ]) {
    const rounds = sample.rounds.map((row: object, i: number) =>
      i === 0 ? { ...row, drawSize, drawCRS: '99' } : row
    );
    assertEquals(
      convertExpressEntryRounds({ rounds })[0].text,
      `Express Entry draw #450 on October 16, 2026: French-Language proficiency 2026-Version 2, ${shown} invitations, minimum CRS 99.`
    );
  }
});

// Falsifier: validating every row would fail the historical draw below.
Deno.test(
  'a malformed historical size or CRS outside the ten is ignored',
  () => {
    const records = convertExpressEntryRounds({
      rounds: [
        ...sample.rounds,
        { ...sample.rounds[12], drawNumber: '91b', drawSize: 'NaN' },
        { ...sample.rounds[12], drawNumber: '90', drawCRS: '-1' },
      ],
    });
    assertEquals(records.length, 10);
  }
);

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
