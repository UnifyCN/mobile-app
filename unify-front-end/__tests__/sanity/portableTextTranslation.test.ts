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
  it.each([
    { definitions: 'markDefs', content: 'content' },
    { definitions: 'instructionsMarkDefs', content: 'instructions' },
    { definitions: 'textMarkDefs', content: 'text' },
    { definitions: 'explanationMarkDefs', content: 'explanation' },
    { definitions: 'questionMarkDefs', content: 'question_text' },
  ])(
    'retains localized and fallback annotations in $definitions',
    ({ definitions, content }) => {
      const baseLink = {
        _key: 'en-link',
        _type: 'link',
        href: 'https://www.canada.ca/en.html',
      };
      const localizedLink = {
        _key: 'es-link',
        _type: 'link',
        href: 'https://www.canada.ca/fr.html',
      };
      const base = {
        ...textBlock('en-span', 'Read the source'),
        children: [
          {
            _key: 'en-span',
            _type: 'span',
            text: 'Read the source',
            marks: ['en-link'],
          },
        ],
      };
      const translated = {
        ...textBlock('es-span', 'Consulte la fuente'),
        children: [
          {
            _key: 'es-span',
            _type: 'span',
            text: 'Consulte la fuente',
            marks: ['es-link'],
          },
        ],
      };
      const fallback = { ...base, _key: 'fallback' };
      const result = mergeI18nOverlay<Record<string, unknown>>({
        _id: 'lesson',
        [content]: [base, fallback],
        [definitions]: [baseLink],
        i18n: { [content]: [translated], [definitions]: [localizedLink] },
      });
      expect(result).toMatchObject({
        [content]: [translated, fallback],
        [definitions]: expect.arrayContaining([baseLink, localizedLink]),
      });
    }
  );

  it.each(['block', undefined, 'image'])(
    'retains the entire base paragraph when invalid text supplies different formatting with type %s',
    translatedType => {
      const base = textBlock('en-span', 'English fallback');
      const result = mergeI18nOverlay<Record<string, unknown>>({
        content: [base],
        i18n: {
          content: [
            {
              ...base,
              _type: translatedType,
              children: [],
              style: 'h1',
              listItem: 'number',
              level: 3,
            },
          ],
        },
      });
      expect(result.content).toEqual([base]);
    }
  );

  it.each([
    { definitions: [] },
    {
      definitions: [
        {
          _key: 'unrelated',
          _type: 'link',
          href: 'https://www.canada.ca/fr.html',
        },
      ],
    },
    {
      definitions: [{ _key: 'es-link', href: 'https://www.canada.ca/fr.html' }],
    },
  ])(
    'keeps working base prose when localized links cannot resolve: %j',
    ({ definitions }) => {
      const baseLink = {
        _key: 'en-link',
        _type: 'link',
        href: 'https://www.canada.ca/en.html',
      };
      const base = {
        ...textBlock('en-span', 'Read the source'),
        children: [
          {
            _key: 'en-span',
            _type: 'span',
            text: 'Read the source',
            marks: ['en-link'],
          },
        ],
      };
      const translated = {
        ...textBlock('es-span', 'Consulte la fuente'),
        children: [
          {
            _key: 'es-span',
            _type: 'span',
            text: 'Consulte la fuente',
            marks: ['es-link'],
          },
        ],
      };
      const result = mergeI18nOverlay<Record<string, unknown>>({
        content: [base],
        markDefs: [baseLink],
        i18n: { content: [translated], markDefs: definitions },
      });
      expect(result.content).toEqual([base]);
    }
  );

  it('keeps page-level localized source links through the actual lesson service', async () => {
    const baseLink = {
      _key: 'en-link',
      _type: 'link',
      href: 'https://www.canada.ca/en.html',
    };
    const localizedLink = {
      _key: 'es-link',
      _type: 'link',
      href: 'https://www.canada.ca/fr.html',
    };
    const base = {
      ...textBlock('en-span', 'Read the source'),
      children: [
        {
          _key: 'en-span',
          _type: 'span',
          text: 'Read the source',
          marks: ['en-link'],
        },
      ],
    };
    const translated = {
      ...textBlock('es-span', 'Consulte la fuente'),
      children: [
        {
          _key: 'es-span',
          _type: 'span',
          text: 'Consulte la fuente',
          marks: ['es-link'],
        },
      ],
    };
    mockFetch.mockResolvedValueOnce({
      _id: 'lesson',
      _type: 'lesson',
      content_blocks: [
        {
          _key: 'reading',
          _type: 'lesson_content',
          content: [base],
          markDefs: [baseLink],
        },
      ],
      i18n: {
        content_blocks: [
          {
            _key: 'reading',
            _type: 'lesson_content',
            content: [translated],
            markDefs: [localizedLink],
          },
        ],
      },
    });
    const lesson = await getLesson('lesson', 'es');
    expect(lesson?.pages?.[0].content).toEqual([translated]);
    expect(lesson?.pages?.[0].markDefs).toEqual(
      expect.arrayContaining([localizedLink])
    );
  });

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
