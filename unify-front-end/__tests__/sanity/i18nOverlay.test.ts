import {
  mergeI18nOverlay,
  normalizeSanityLanguage,
} from '@/services/sanity/i18n';

describe('Sanity language overlays', () => {
  it('keeps the English document id while replacing translated content', () => {
    type LessonStub = {
      _id: string;
      title: string;
      description: string;
    };
    expect(
      mergeI18nOverlay<LessonStub>({
        _id: 'lesson-english-id',
        title: 'English title',
        description: 'English fallback',
        i18n: {
          _id: 'lesson-translated-id',
          title: 'Titre français',
          description: null,
        },
      })
    ).toEqual({
      _id: 'lesson-english-id',
      title: 'Titre français',
      description: 'English fallback',
    });
  });

  it('merges keyed rich content without changing progress identities or structure', () => {
    const result = mergeI18nOverlay<any>({
      _id: 'lesson-base',
      pages: [
        {
          _key: 'page-1',
          title: 'Base page',
          questions: [
            {
              _key: 'question-1',
              prompt: 'Base prompt',
              options: [
                { _key: 'option-a', text: 'Base A', is_correct: true },
                { _key: 'option-b', text: 'Base B', is_correct: false },
              ],
            },
          ],
        },
        { _key: 'page-2', title: 'Untouched page' },
      ],
      i18n: {
        _id: 'lesson-translation',
        pages: [
          {
            _key: 'page-1',
            title: 'Página traducida',
            questions: [
              {
                _key: 'question-1',
                prompt: 'Pregunta traducida',
                options: [
                  { _key: 'option-a', text: 'Opción A' },
                  { _key: 'option-extra', text: 'Must not alter structure' },
                ],
              },
            ],
          },
          { _key: 'page-extra', title: 'Must not alter progress pages' },
        ],
      },
    });

    expect(result._id).toBe('lesson-base');
    expect(result.pages.map((page: any) => page._key)).toEqual([
      'page-1',
      'page-2',
    ]);
    expect(result.pages[0].questions[0]._key).toBe('question-1');
    expect(
      result.pages[0].questions[0].options.map((option: any) => option._key)
    ).toEqual(['option-a', 'option-b']);
    expect(result.pages[0].title).toBe('Página traducida');
    expect(result.pages[0].questions[0].prompt).toBe('Pregunta traducida');
    expect(result.pages[0].questions[0].options).toEqual([
      { _key: 'option-a', text: 'Opción A', is_correct: true },
      { _key: 'option-b', text: 'Base B', is_correct: false },
    ]);
    expect(result.pages[1].title).toBe('Untouched page');
  });

  it('retains base rich content when a translation changes the field shape', () => {
    expect(
      mergeI18nOverlay<any>({
        _id: 'lesson-base',
        pages: [{ _key: 'page-1', title: 'Safe base page' }],
        i18n: { pages: 'malformed translation payload' },
      }).pages
    ).toEqual([{ _key: 'page-1', title: 'Safe base page' }]);
  });

  it.each([
    ['en', 'en'],
    ['vi-VN', 'vi'],
    ['es-MX', 'es'],
    ['hi-IN', 'hi'],
    ['ar-CA', 'ar'],
    ['fr', 'fr-CA'],
    ['fr-CA', 'fr-CA'],
    ['pa-IN', 'pa'],
    ['pa', 'pa'],
    ['unknown', 'en'],
  ] as const)(
    'normalizes %s to the available Sanity language %s',
    (input, expected) => {
      expect(normalizeSanityLanguage(input)).toBe(expected);
    }
  );
});
