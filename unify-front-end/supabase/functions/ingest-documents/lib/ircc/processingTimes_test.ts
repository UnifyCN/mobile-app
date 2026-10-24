import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { convertProcessingTimes } from './processingTimes.ts';
import type { SourceRecord } from './types.ts';
import { processingFiles } from './testFixtures.ts';

function find(records: SourceRecord[], prefix: string) {
  return records.filter(r => r.text.startsWith(prefix));
}

// Falsifier: a converter that prints the country code ("AF") or drops the
// country, or uses another sentence shape, fails the literal below.
Deno.test(
  'a country row becomes the agreed sentence with the country name',
  () => {
    const { records } = convertProcessingTimes(processingFiles());

    assertEquals(
      find(
        records,
        'Processing time for Study permit (from outside Canada) (Afghanistan)'
      ),
      [
        {
          text: 'Processing time for Study permit (from outside Canada) (Afghanistan): 3 weeks.',
          publishedAt: '2026-10-21',
        },
      ]
    );
  }
);

// Falsifier: reading CA as a country gives "(Canada)" and the outside-Canada
// label; the official page uses CA for the in-Canada application.
Deno.test('CA in the study and work lists is the in-Canada application', () => {
  const { records } = convertProcessingTimes(processingFiles());

  assertEquals(
    find(records, 'Processing time for Study permit in Canada').map(
      r => r.text
    ),
    ['Processing time for Study permit in Canada: 7 weeks.']
  );
  assertEquals(
    find(records, 'Processing time for Work permit in Canada').map(r => r.text),
    ['Processing time for Work permit in Canada: 16 weeks.']
  );
  assertEquals(
    records.filter(r =>
      /Study permit.*\(Canada\)|Work permit.*\(Canada\)/.test(r.text)
    ),
    []
  );
});

// Guards (green on arrival, covered by mutation checks): unavailable entries
// and nested values.
Deno.test(
  'entries without a time are left out and never become a number',
  () => {
    const { records, skipped } = convertProcessingTimes(processingFiles());

    assertEquals(
      records.filter(r =>
        /No processing time available|Not enough data/i.test(r.text)
      ),
      []
    );
    assertEquals(
      find(
        records,
        'Processing time for Work permit (from outside Canada) (Afghanistan)'
      ),
      []
    );
    assertEquals(skipped.unavailable! > 1000, true);
  }
);

Deno.test('privately sponsored refugee values are read at the leaf', () => {
  const { records } = convertProcessingTimes(processingFiles());
  const texts = (country: string) =>
    find(records, 'Processing time for Privately sponsored refugees')
      .filter(r => r.text.includes(`(${country})`))
      .map(r => r.text);

  assertEquals(texts('India'), [
    'Processing time for Privately sponsored refugees, Step 1 sponsorship application (India): 28 months.',
    'Processing time for Privately sponsored refugees, Step 2 refugee application (India): 17 months.',
  ]);
  // Only one of the two steps has a time.
  assertEquals(texts('Djibouti'), [
    'Processing time for Privately sponsored refugees, Step 2 refugee application (Djibouti): 38 months.',
  ]);
  // Both steps are "Not enough data".
  assertEquals(texts('Afghanistan'), []);
});

Deno.test(
  'a country code with no name keeps its time and shows the code',
  () => {
    const files = processingFiles();
    (files.countryTimes as Record<string, Record<string, unknown>>).work.GL =
      '20 weeks';

    const { records } = convertProcessingTimes(files);

    assertEquals(
      find(
        records,
        'Processing time for Work permit (from outside Canada) (country code GL)'
      ).map(r => r.text),
      [
        'Processing time for Work permit (from outside Canada) (country code GL): 20 weeks.',
      ]
    );
  }
);

Deno.test(
  'a non-object value where steps are expected is skipped, not guessed',
  () => {
    const files = processingFiles();
    (
      files.countryTimes as Record<string, Record<string, unknown>>
    ).refugees_private.IN = '10 months';

    const { records, skipped } = convertProcessingTimes(files);

    assertEquals(
      find(records, 'Processing time for Privately sponsored refugees').filter(
        r => r.text.includes('(India)')
      ),
      []
    );
    assertEquals(skipped.malformed! >= 2, true);
  }
);

// Falsifier: the stub returns no non-country records.
Deno.test(
  'non-country rows use the page labels and the file last-updated date',
  () => {
    const { records } = convertProcessingTimes(processingFiles());
    const expected = [
      'Processing time for Visitor visa (from inside Canada): 12 days.',
      'Processing time for Visitor extension (Visitor record): 341 days.',
      'Processing time for International Experience Canada (current season): 6 weeks.',
      'Processing time for Electronic Travel Authorization (eTA): 5 minutes.',
      'Processing time for Renunciation of citizenship: 4 months.',
      'Processing time for Search of citizenship records: 19 months.',
      'Processing time for Citizenship for adopted persons (Part 1): 4 months.',
      'Processing time for New permanent resident card: 30 days.',
      'Processing time for Renewing or replacing a permanent resident card: 40 days.',
      'Processing time for Verification of status: 16 weeks.',
      'Processing time for Replacement of valid temporary resident documents: 11 weeks.',
      'Processing time for Amendments of immigration documents: 13 weeks.',
      'Processing time for Amendments of valid temporary resident documents: 9 weeks.',
      'Processing time for Seasonal Agricultural Worker Program (SAWP): 95 days.',
    ];

    for (const text of expected) {
      assertEquals(
        records.filter(r => r.text === text),
        [{ text, publishedAt: '2026-10-21' }],
        text
      );
    }
  }
);

// The page does not show these two keys. It shows 8 and 12 weeks from the
// extension queue file for the same applications, so they would contradict it.
Deno.test('study_extension and work_extension are not emitted', () => {
  const { records, skipped } = convertProcessingTimes(processingFiles());

  assertEquals(
    records.filter(r => /extension in Canada: (121|56) days/.test(r.text)),
    []
  );
  assertEquals(skipped.notShownOnPage, 2);
});

Deno.test('a key the converter has no label for is skipped and counted', () => {
  const files = processingFiles();
  (
    files.nonCountryTimes as Record<string, Record<string, string>>
  ).sawp.new_key = '3 days';

  const { records, skipped } = convertProcessingTimes(files);

  assertEquals(
    records.filter(r => /: 3 days\.$/.test(r.text)),
    []
  );
  // 4 refugee keys in flpt-en.json are unlabelled already; this key is one more.
  assertEquals(skipped.unlabelled, 5);
});

// Falsifier: the stub has no flpt rows.
Deno.test(
  'current-flpt durations keep their qualifiers and the flpt update date',
  () => {
    const { records } = convertProcessingTimes(processingFiles());
    const expected = [
      'Processing time for Canadian Experience Class (online via Express Entry): About 6 months.',
      'Processing time for Provincial nominees (not through Express Entry): About 13 months.',
      'Processing time for Humanitarian and compassionate cases (outside Quebec): More than 10 years.',
      'Processing time for Skilled workers (Quebec): 11 months.',
      'Processing time for Citizenship certificate (proof of citizenship): About 34 months.',
    ];

    for (const text of expected) {
      assertEquals(
        records.filter(r => r.text === text),
        [{ text, publishedAt: '2026-10-09' }],
        text
      );
    }
  }
);

// Falsifier: reading total-people or the monthly history as a duration writes
// "About 53,900 people waiting" or "Less than 100 people ahead of you" as a time.
Deno.test(
  'queue counts and queue history are never written as durations',
  () => {
    const { records } = convertProcessingTimes(processingFiles());

    assertEquals(
      records.filter(r =>
        /people waiting|people ahead|We need more time|53,900|200,100/.test(
          r.text
        )
      ),
      []
    );
  }
);

Deno.test(
  'extension queue durations come from the extension queue file',
  () => {
    const { records } = convertProcessingTimes(processingFiles());

    assertEquals(
      records.filter(r => r.text.includes('extension in Canada')),
      [
        {
          text: 'Processing time for Study permit extension in Canada: 8 weeks.',
          publishedAt: '2026-10-17',
        },
        {
          text: 'Processing time for Work permit extension in Canada: 12 weeks.',
          publishedAt: '2026-10-17',
        },
      ]
    );
  }
);

Deno.test(
  'refugee flpt keys the page never shows are skipped and counted',
  () => {
    const { skipped } = convertProcessingTimes(processingFiles());

    assertEquals(skipped.unlabelled, 4);
  }
);

Deno.test('the fixture files give 465 records, none from PGWP wording', () => {
  const { records, skipped } = convertProcessingTimes(processingFiles());

  assertEquals(records.length, 425 + 14 + 24 + 2);
  assertEquals(
    records.filter(r => /PGWP|post-graduation/i.test(r.text)),
    []
  );
  assertEquals(skipped, {
    unavailable: skipped.unavailable,
    notShownOnPage: 2,
    unlabelled: 4,
  });
});

// Falsifier: a converter that keeps file order changes the hash when IRCC
// reorders keys.
Deno.test('record order does not depend on the key order of the files', () => {
  const reverseKeys = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reverseKeys)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([k, v]) => [k, reverseKeys(v)])
          )
        : value;
  const files = processingFiles();

  const normal = convertProcessingTimes(files).records;
  const reversed = convertProcessingTimes({
    countryTimes: reverseKeys(files.countryTimes),
    nonCountryTimes: reverseKeys(files.nonCountryTimes),
    countryNames: reverseKeys(files.countryNames),
    flpt: reverseKeys(files.flpt),
    flptByWeek: reverseKeys(files.flptByWeek),
  }).records;

  assertEquals(reversed, normal);
});

Deno.test('a missing section is an error so old content stays', () => {
  const cases: Array<
    [string, (f: ReturnType<typeof processingFiles>) => void, string]
  > = [
    [
      'country names',
      f => {
        f.countryNames = {};
      },
      'Processing times: no country names',
    ],
    [
      'category',
      f => {
        delete (f.countryTimes as Json).work;
      },
      'Processing times: no work section',
    ],
    [
      'flpt',
      f => {
        delete (f.flpt as Json)['current-flpt'];
      },
      'Processing times: no current-flpt section',
    ],
    [
      'by week',
      f => {
        delete (f.flptByWeek as Json)['current-flpt'];
      },
      'Processing times: no extension queue section',
    ],
    [
      'non-country',
      f => {
        f.nonCountryTimes = null;
      },
      'Processing times: no non-country file',
    ],
  ];
  for (const [name, mutate, message] of cases) {
    const files = processingFiles();
    mutate(files);
    let actual = '';
    try {
      convertProcessingTimes(files);
    } catch (error) {
      actual = (error as Error).message;
    }
    assertEquals(actual, message, name);
  }
});

type Json = Record<string, unknown>;
