jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: jest.fn() },
}));

import { sanityClient } from '@/sanity-custom';
import { getLesson } from '@/services/sanity/lessons';

const mockFetchSanity = sanityClient.fetch as jest.Mock;

describe('getLesson', () => {
  beforeEach(() => mockFetchSanity.mockReset());

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
