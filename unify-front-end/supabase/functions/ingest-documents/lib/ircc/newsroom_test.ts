import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { convertNewsroom } from './newsroom.ts';
import { readFixture } from './testFixtures.ts';

const NOW = new Date('2026-10-24T04:00:00.000Z');
const feed = readFixture('newsroom_shape.json') as {
  feed: { entry: Array<Record<string, string>> };
};

function entry(date: string, title: string, teaser = 'A summary.') {
  return {
    link: `https://example.test/${date}`,
    teaser,
    publishedDate: `${date}T11:00:00-04:00`,
    title,
  };
}

// Falsifier: the stub returns nothing.
Deno.test('an item becomes date, title and summary with its own page', () => {
  const records = convertNewsroom(feed, NOW);

  assertEquals(records[1], {
    text: 'October 16, 2026: Changes to Express Entry for high-wage occupations. On November 3, 2026, changes to Express Entry willintroduce points for eligible Canadian work experience or qualifying job offers in highwage occupations, and remove labour market impact assessment (LMIA) requirements for qualifying job offers used to establish program eligibility and obtain Comprehensive Ranking System (CRS) points.',
    publishedAt: '2026-10-16',
    sourceUrl:
      'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/changes-to-express-entry-for-high-wage-occupations.html',
  });
});

// Falsifier: with no cutoff all 11 sample items are returned.
Deno.test('keeps only items from the last 30 days, newest first', () => {
  const records = convertNewsroom(feed, NOW);

  assertEquals(
    records.map(r => r.publishedAt),
    [
      '2026-10-16',
      '2026-10-16',
      '2026-10-15',
      '2026-10-09',
      '2026-10-08',
      '2026-09-29',
      '2026-09-29',
      '2026-09-25',
    ]
  );
});

// Falsifier: a cutoff of 29 or 31 days drops or keeps the wrong day.
Deno.test('the 30th day back is in and the 31st is out', () => {
  const records = convertNewsroom(
    {
      feed: {
        entry: [
          entry('2026-09-24', 'In'),
          entry('2026-09-23', 'Out'),
          // Published at the run instant (midnight Eastern): the upper bound is
          // inclusive.
          {
            ...entry('2026-10-24', 'Today'),
            publishedDate: '2026-10-24T00:00:00-04:00',
          },
        ],
      },
    },
    NOW
  );

  assertEquals(
    records.map(r => r.text),
    [
      'October 24, 2026: Today. A summary.',
      'September 24, 2026: In. A summary.',
    ]
  );
});

Deno.test('uses the date written in the feed, not the UTC date', () => {
  const records = convertNewsroom(
    {
      feed: {
        entry: [
          {
            ...entry('2026-10-20', 'Late'),
            publishedDate: '2026-10-20T22:30:00-04:00',
          },
        ],
      },
    },
    NOW
  );

  assertEquals(records[0].publishedAt, '2026-10-20');
});

Deno.test(
  'no summary, or a summary equal to the title, gives no second sentence',
  () => {
    const records = convertNewsroom(
      {
        feed: {
          entry: [
            entry('2026-10-20', 'Media advisory', 'Media advisory'),
            entry('2026-10-19', 'Notice?', ''),
            entry('2026-10-18', 'Done!', 'Closed.'),
          ],
        },
      },
      NOW
    );

    assertEquals(
      records.map(r => r.text),
      [
        'October 20, 2026: Media advisory.',
        'October 19, 2026: Notice?',
        'October 18, 2026: Done! Closed.',
      ]
    );
  }
);

Deno.test(
  'an item with no title, no date or an invalid date is skipped',
  () => {
    const records = convertNewsroom(
      {
        feed: {
          entry: [
            { ...entry('2026-10-20', ''), title: '' },
            { link: 'x', teaser: 't', title: 'No date' },
            { ...entry('2026-10-20', 'Bad'), publishedDate: 'yesterday' },
            {
              ...entry('2026-10-20', 'Bad'),
              publishedDate: '2026-13-40T00:00:00Z',
            },
            entry('2026-10-20', 'Good'),
          ],
        },
      },
      NOW
    );

    assertEquals(
      records.map(r => r.text),
      ['October 20, 2026: Good. A summary.']
    );
  }
);

Deno.test('a missing link is allowed, a non-https link is dropped', () => {
  const records = convertNewsroom(
    {
      feed: {
        entry: [
          { ...entry('2026-10-20', 'A'), link: undefined },
          { ...entry('2026-10-19', 'B'), link: 'javascript:alert(1)' },
          { ...entry('2026-10-18', 'C'), link: 'http://example.test/c' },
        ],
      },
    },
    NOW
  );

  assertEquals(
    records.map(r => r.sourceUrl),
    [undefined, undefined, undefined]
  );
});

Deno.test(
  'a feed without an entry list or a readable entry is an error',
  () => {
    for (const bad of [null, {}, { feed: {} }, { feed: { entry: 'x' } }]) {
      let message = '';
      try {
        convertNewsroom(bad, NOW);
      } catch (error) {
        message = (error as Error).message;
      }
      assertEquals(message, 'Newsroom: no entry list');
    }
    // The API always returns its latest items, old or new. A list with no
    // readable item is a broken response, not an empty window.
    for (const bad of [
      { feed: { entry: [] } },
      { feed: { entry: [{ title: 'No date' }] } },
    ]) {
      let message = '';
      try {
        convertNewsroom(bad, NOW);
      } catch (error) {
        message = (error as Error).message;
      }
      assertEquals(message, 'Newsroom: no readable entries');
    }
  }
);

// Falsifier: a filter with only the lower bound keeps the later item.
Deno.test('an item published after the run is left out', () => {
  const records = convertNewsroom(
    {
      feed: {
        entry: [
          entry('2026-10-25', 'Future bulletin'),
          {
            ...entry('2026-10-24', 'Later today'),
            publishedDate: '2026-10-24T00:30:00-04:00',
          },
          {
            ...entry('2026-10-23', 'Just published'),
            publishedDate: '2026-10-23T23:59:00-04:00',
          },
        ],
      },
    },
    NOW
  );

  assertEquals(
    records.map(r => [r.publishedAt, r.text]),
    [['2026-10-23', 'October 23, 2026: Just published. A summary.']]
  );
});

// Falsifier: an error here keeps an expired item searchable forever.
Deno.test('a readable feed with no item in the window gives no records', () => {
  assertEquals(
    convertNewsroom({ feed: { entry: [entry('2026-09-01', 'Old')] } }, NOW),
    []
  );
});
