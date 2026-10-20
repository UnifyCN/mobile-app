import { sanityClient } from '@/sanity-custom';
import { getLesson } from '@/services/sanity/lessons';

jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: jest.fn() },
}));

const mockFetchSanity = sanityClient.fetch as jest.Mock;

describe('getLesson', () => {
  beforeEach(() => mockFetchSanity.mockReset());

  it.each([true, false])(
    'keeps Spanish when English section keys change (translated sections: %s)',
    async structured => {
      const text = (value: string) => [
        {
          _key: 'block',
          _type: 'block',
          children: [{ _key: 'span', _type: 'span', text: value }],
        },
      ];
      const spanish = text('Texto en español');
      const translatedSections = [
        { _key: 'page-concept', _type: 'lessonConcept', content: spanish },
      ];
      mockFetchSanity.mockResolvedValue({
        _id: 'lesson',
        _type: 'lesson',
        pages: [
          {
            _key: 'page',
            content: text('English'),
            contentVersion: 2,
            sections: [
              {
                _key: 'new-english-section',
                _type: 'lessonConcept',
                content: text('English'),
              },
            ],
          },
        ],
        i18n: {
          pages: [
            {
              _key: 'page',
              content: spanish,
              ...(structured
                ? { contentVersion: 2, sections: translatedSections }
                : {}),
            },
          ],
        },
      });
      const result = await getLesson('lesson', 'es');
      const page = result!.pages![0];
      expect(page._key).toBe('page');
      expect(page.content).toEqual(spanish);
      if (structured) expect(page.sections).toEqual(translatedSections);
      else {
        expect(page.contentVersion).not.toBe(2);
        expect(page.sections).toBeUndefined();
      }
    }
  );

  it('passes ids as SDK parameters and preserves the base id after translation', async () => {
    mockFetchSanity.mockResolvedValue({
      _id: 'english-lesson-id',
      _type: 'lesson',
      title: 'English',
      i18n: { _id: 'translated-id', title: 'Español' },
    });
    const untrustedId = 'lesson-id"] | *[_type == "secret"';

    await expect(getLesson(untrustedId, 'es')).resolves.toMatchObject({
      _id: 'english-lesson-id',
      title: 'Español',
    });
    const [query, params] = mockFetchSanity.mock.calls[0];
    expect(query).toContain('_id == $lessonId');
    expect(query).not.toContain(untrustedId);
    expect(params).toEqual({ lessonId: untrustedId, lang: 'es' });
  });
});

it('overlays translated blocks before adapting them and preserves base block order', async () => {
  mockFetchSanity.mockResolvedValue({
    _id: 'lesson', _type: 'lesson', title: 'Base',
    content_blocks: [
      { _type: 'lesson_activity', _key: 'q', title: 'Question', instructions: [] },
      { _type: 'lesson_content', _key: 'summary', title: 'Summary', content: [] },
    ],
    i18n: { content_blocks: [
      { _type: 'lesson_content', _key: 'summary', title: 'Resumen', content: [] },
      { _type: 'lesson_activity', _key: 'q', title: 'Pregunta', instructions: [] },
    ] },
  });
  const lesson = await getLesson('lesson', 'es');
  expect(lesson?.pages?.map(page => page.title)).toEqual(['Pregunta', 'Resumen']);
  expect(lesson?.pages?.map(page => page._key)).toEqual(['q', 'summary']);
  expect(lesson?.pages?.[0].activity?._key).toBe('q');
  expect(mockFetchSanity.mock.calls.at(-1)[0]).toContain('content_blocks');
});

it.each([true, false])(
  'applies the translated-sections guard to content blocks (translated sections: %s)',
  async structured => {
    const english = [{ _key: 'new-english-section', _type: 'lessonConcept', content: [] }];
    const spanish = [{ _key: 'page-concept', _type: 'lessonConcept', content: [] }];
    mockFetchSanity.mockResolvedValue({
      _id: 'lesson', _type: 'lesson', title: 'Base',
      content_blocks: [
        { _type: 'lesson_content', _key: 'intro', title: 'Intro', content: [], contentVersion: 2, sections: english, readingMinutes: 3 },
      ],
      i18n: { content_blocks: [
        { _type: 'lesson_content', _key: 'intro', title: 'Introducción', content: [],
          ...(structured ? { contentVersion: 2, sections: spanish, readingMinutes: 4 } : {}) },
      ] },
    });
    const page = (await getLesson('lesson', 'es'))!.pages![0];
    expect(page.title).toBe('Introducción');
    if (structured) {
      expect(page.contentVersion).toBe(2);
      expect(page.sections).toEqual(spanish);
      expect(page.readingMinutes).toBe(4);
    } else {
      expect(page.contentVersion).not.toBe(2);
      expect(page.sections).toBeUndefined();
    }
  }
);

it('keeps structured sections on English content blocks', async () => {
  const sections = [{ _key: 'concept', _type: 'lessonConcept', content: [] }];
  mockFetchSanity.mockResolvedValue({
    _id: 'lesson', _type: 'lesson', title: 'Base',
    content_blocks: [
      { _type: 'lesson_content', _key: 'intro', title: 'Intro', content: [], contentVersion: 2, sections, readingMinutes: 3 },
    ],
  });
  const page = (await getLesson('lesson', 'en'))!.pages![0];
  expect(page).toMatchObject({ _key: 'intro', contentVersion: 2, sections, readingMinutes: 3 });
});
