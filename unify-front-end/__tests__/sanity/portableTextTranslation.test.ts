import { mergeI18nOverlay } from '@/services/sanity/i18n';
import { getLesson } from '@/services/sanity/lessons';
import type { SanityBlock } from '@/types/sanity';

const mockFetch = jest.fn();
jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: (...args: unknown[]) => mockFetch(...args) },
}));

const textBlock = (spanKey: string, text: string): SanityBlock => ({
  _type: 'block',
  _key: 'paragraph',
  style: 'normal',
  children: [{ _type: 'span', _key: spanKey, text, marks: [] }],
  markDefs: [],
});

describe('translated Portable Text', () => {
  it('uses a complete translated span tree and its link definitions', () => {
    const base = textBlock('english-span', 'Protect your SIN');
    const translated: SanityBlock = {
      ...textBlock('arabic-span', 'احمِ رقم التأمين الاجتماعي'),
      children: [
        {
          _type: 'span',
          _key: 'arabic-span',
          text: 'احمِ رقم التأمين الاجتماعي',
          marks: ['arabic-link'],
        },
      ],
      markDefs: [
        {
          _key: 'arabic-link',
          _type: 'link',
          href: 'https://www.canada.ca/en/employment-social-development/services/sin/protection.html',
        },
      ],
    };
    const result = mergeI18nOverlay({
      _id: 'english-lesson',
      content: [base],
      i18n: { content: [translated] },
    });
    expect(result._id).toBe('english-lesson');
    expect(result.content[0]._key).toBe('paragraph');
    expect(result.content[0].children).toEqual(translated.children);
    expect(result.content[0].markDefs).toEqual(translated.markDefs);
  });

  it.each([
    {
      children: [
        { _type: 'image', _key: 'bad-span', text: 'Wrong child type' },
      ],
    },
    { children: [{ _type: 'span', _key: 'bad-span', text: 42 }] },
    {
      children: [
        { _type: 'span', _key: 'bad-span', text: 'Bad marks', marks: [42] },
      ],
    },
    { children: [] },
    { markDefs: ['Not an annotation object'] },
  ])(
    'keeps the complete base text when the translated pair is malformed: %j',
    malformed => {
      const base = textBlock('english-span', 'English fallback');
      const translated = {
        ...textBlock('translated-span', 'Texto traducido'),
        ...malformed,
      };
      const result = mergeI18nOverlay<Record<string, unknown>>({
        _id: 'english-lesson',
        content: [base],
        i18n: { content: [translated] },
      });
      expect(result.content).toEqual([base]);
    }
  );

  it('preserves question and option identities around translated text', () => {
    const result = mergeI18nOverlay({
      _id: 'quiz',
      questions: [
        {
          _key: 'question',
          options: [
            {
              _key: 'correct-option',
              value: 'safe',
              is_correct: true,
              text: [textBlock('en', 'Safe answer')],
            },
          ],
        },
      ],
      i18n: {
        questions: [
          {
            _key: 'question',
            options: [
              {
                _key: 'correct-option',
                value: 'safe',
                is_correct: true,
                text: [textBlock('es', 'Respuesta segura')],
              },
            ],
          },
        ],
      },
    });
    expect(result.questions[0]._key).toBe('question');
    expect(result.questions[0].options[0]).toMatchObject({
      _key: 'correct-option',
      value: 'safe',
      is_correct: true,
    });
    expect(result.questions[0].options[0].text[0].children[0].text).toBe(
      'Respuesta segura'
    );
  });

  it('returns localized reading and recap prose from the actual lesson service', async () => {
    const reading = {
      _type: 'lesson_content',
      _key: 'reading',
      title: 'Read',
      content: [textBlock('en-reading', 'Read the lesson')],
    };
    const recap = {
      _type: 'lesson_content',
      _key: 'recap',
      title: 'Review',
      content: [textBlock('en-recap', 'Review your records')],
    };
    mockFetch.mockResolvedValueOnce({
      _id: 'english-lesson',
      _type: 'lesson',
      title: 'English lesson',
      pages: [{ ...reading, _type: 'page', order: 1 }],
      ending_pages: [{ ...recap, _type: 'endingPage', order: 1 }],
      content_blocks: [reading, recap],
      i18n: {
        content_blocks: [
          {
            ...reading,
            title: 'اقرأ',
            content: [textBlock('ar-reading', 'اقرأ الدرس')],
          },
          {
            ...recap,
            title: 'راجع',
            content: [textBlock('ar-recap', 'راجع سجلاتك')],
          },
        ],
      },
    });
    const lesson = await getLesson('english-lesson', 'ar');
    expect(lesson?.pages?.map(page => page._key)).toEqual(['reading', 'recap']);
    expect(
      lesson?.pages?.map(page => {
        const block = page.content[0];
        return block?._type === 'block'
          ? block.children.map(span => span.text).join('')
          : undefined;
      })
    ).toEqual(['اقرأ الدرس', 'راجع سجلاتك']);
  });
});
