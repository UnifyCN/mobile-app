import {
  getOrderedLegacyPageNumber,
  withOrderedLessonBlocks,
} from '@/utils/lessonContentBlocks';
import {
  activityResponseKeys,
  canSubmitLessonActivity,
} from '@/utils/lessonActivity';
import {
  getLessonTotalPages,
  calculateLessonProgress,
} from '@/utils/submoduleProgress';
import type {
  SanityBlock,
  SanityLesson,
  SanityLessonContentBlock,
  SanitySubmoduleWithLessons,
} from '@/types/sanity';

const text = {
  _type: 'block',
  _key: 'paragraph',
  style: 'normal',
  children: [
    { _type: 'span', _key: 'span', text: 'Compare your options.', marks: [] },
  ],
  markDefs: [],
} satisfies SanityBlock;

const blocks: SanityLessonContentBlock[] = [
  {
    _type: 'lesson_content',
    _key: 'overview',
    title: 'Compare options',
    content: [text],
  },
  {
    _type: 'lesson_activity',
    _key: 'check',
    title: 'Try it',
    instructions: [
      {
        _type: 'multiple_choice_single',
        _key: 'q',
        question_text: [text],
        options: [
          { _key: 'a', value: 'a', text: [text], is_correct: true },
          { _key: 'b', value: 'b', text: [text], is_correct: false },
        ],
      },
    ],
    answer_box: { content: [text], showAfterSubmit: true },
  },
  {
    _type: 'lesson_content',
    _key: 'summary',
    title: 'Next steps',
    content: [text],
  },
];

const lesson: SanityLesson = {
  _id: 'lesson',
  _type: 'lesson',
  _rev: 'rev',
  _createdAt: '2026-10-20T00:00:00Z',
  _updatedAt: '2026-10-20T00:00:00Z',
  title: 'Compare options',
  slug: { _type: 'slug', current: 'compare-options' },
  submodule: { _type: 'reference', _ref: 'module' },
  order: 1,
  content_blocks: blocks,
  pages: [{ _key: 'legacy', title: 'Legacy page', order: 1, content: [text] }],
  activity_pages: [
    { _key: 'old-activity', title: 'Old activity', order: 1, instructions: [] },
  ],
  ending_pages: [
    { _key: 'old-ending', title: 'Old ending', order: 1, content: [] },
  ],
};

describe('ordered lesson content', () => {
  it('plays a complete explanation, activity, summary lesson in author order', () => {
    const adapted = withOrderedLessonBlocks(lesson);
    expect(adapted.pages?.map(page => page._key)).toEqual([
      'overview',
      'check',
      'summary',
    ]);
    expect(adapted.pages?.[0].content).toEqual([text]);
    expect(adapted.pages?.[1].activity?.instructions).toEqual(
      blocks[1]._type === 'lesson_activity' ? blocks[1].instructions : []
    );
    expect(adapted.pages?.[2].title).toBe('Next steps');
    expect(adapted.activity_pages).toEqual([]);
    expect(adapted.ending_pages).toEqual([]);
    expect(getLessonTotalPages(adapted)).toBe(3);
    expect(lesson.pages?.[0]._key).toBe('legacy');
    expect(lesson.activity_pages).toHaveLength(1);
  });

  it('supports an activity as the first block and keeps response identities on reorder', () => {
    const adapted = withOrderedLessonBlocks({
      ...lesson,
      content_blocks: [blocks[1], blocks[0]],
    });
    expect(adapted.pages?.[0].activity?._key).toBe('check');
    expect(adapted.pages?.map(page => page._key)).toEqual([
      'check',
      'overview',
    ]);
  });

  it('keeps legacy resume identities when adapting cached lesson data twice', () => {
    const migrated = {
      ...lesson,
      activity_pages: [
        { _key: 'check', title: 'Saved exercise', order: 0, instructions: [] },
      ],
      ending_pages: [
        { _key: 'summary', title: 'Saved summary', order: 0, content: [] },
      ],
    };
    const adapted = withOrderedLessonBlocks(withOrderedLessonBlocks(migrated));
    expect(
      getOrderedLegacyPageNumber({
        lesson: adapted,
        pageType: 'activity',
        pageNumber: 1,
      })
    ).toBe(2);
    expect(
      getOrderedLegacyPageNumber({
        lesson: adapted,
        pageType: 'ending',
        pageNumber: 1,
      })
    ).toBe(3);
    expect(getLessonTotalPages(adapted)).toBe(3);
  });

  it('resolves ending numbers in their original sorted order after steps move', () => {
    const migrated: SanityLesson = {
      ...lesson,
      ending_pages: [
        { _key: 'overview', title: 'Second ending', order: 2, content: [] },
        { _key: 'summary', title: 'First ending', order: 1, content: [] },
      ],
    };
    const adapted = withOrderedLessonBlocks(migrated);
    expect(
      getOrderedLegacyPageNumber({
        lesson: adapted,
        pageType: 'ending',
        pageNumber: 1,
      })
    ).toBe(3);
    expect(
      getOrderedLegacyPageNumber({
        lesson: adapted,
        pageType: 'ending',
        pageNumber: 2,
      })
    ).toBe(1);
  });

  it.each([0, -1, 1.5, NaN, 20])(
    'does not guess a target for invalid legacy page %s',
    pageNumber => {
      expect(
        getOrderedLegacyPageNumber({
          lesson: withOrderedLessonBlocks(lesson),
          pageType: 'ending',
          pageNumber,
        })
      ).toBeUndefined();
    }
  );

  it('preserves legacy lessons when no new blocks have been authored', () => {
    for (const content_blocks of [undefined, []]) {
      const legacy = { ...lesson, content_blocks };
      expect(withOrderedLessonBlocks(legacy)).toBe(legacy);
      expect(getLessonTotalPages(legacy)).toBe(3);
    }
  });

  it('keeps module progress aligned with the compact content-block count', () => {
    const submodule: SanitySubmoduleWithLessons = {
      _id: 'module',
      _type: 'submodule',
      _rev: 'rev',
      _createdAt: '',
      _updatedAt: '',
      title: 'Module',
      module: { _type: 'reference', _ref: 'course' },
      order: 1,
      lessons: [
        {
          ...lesson,
          pages: undefined,
          activity_pages: undefined,
          ending_pages: undefined,
          lesson_page_count: 3,
          activity_page_count: 0,
          ending_page_count: 0,
        },
      ],
    };
    expect(calculateLessonProgress(submodule, 'lesson', 2)).toEqual({
      currentPage: 2,
      totalPages: 3,
      progressPercentage: (2 / 3) * 100,
    });
  });

  it('requires an answer before submitting a knowledge check', () => {
    const activity = blocks[1];
    if (activity._type !== 'lesson_activity')
      throw new Error('Expected activity fixture');
    expect(canSubmitLessonActivity(activity.instructions, {}, {})).toBe(false);
    expect(canSubmitLessonActivity(activity.instructions, {}, { q: 'b' })).toBe(
      true
    );
    expect(
      canSubmitLessonActivity(activity.instructions, {}, { q: 'unknown' })
    ).toBe(false);
  });

  it('requires mandatory text and all matching pairs without requiring a correct quiz answer', () => {
    const instructions: import('@/types/sanity').SanityActivityPage['instructions'] =
      [
        {
          _type: 'small_input_box',
          _key: 'reflection',
          label: 'Your next step',
          placeholder: '',
          required: true,
        },
        {
          _type: 'matching_question',
          _key: 'matching',
          question_text: [],
          matching_pairs: [
            { _key: 'first', left_item: 'A', right_item: '1' },
            { _key: 'second', left_item: 'B', right_item: '2' },
          ],
        },
      ];
    expect(
      canSubmitLessonActivity(
        instructions,
        { reflection: '  ' },
        { matching: ['first', 'second'] }
      )
    ).toBe(false);
    expect(
      canSubmitLessonActivity(
        instructions,
        { reflection: 'Check options' },
        { matching: ['first'] }
      )
    ).toBe(false);
    expect(
      canSubmitLessonActivity(
        instructions,
        { reflection: 'Check options' },
        { matching: ['first', 'second'] }
      )
    ).toBe(true);
  });
});

it('lists every response key, with required text and every question marked required', () => {
  const instructions = [
    {
      _type: 'small_input_box',
      _key: 'required-note',
      label: '',
      placeholder: '',
      required: true,
    },
    {
      _type: 'large_input_box',
      _key: 'optional-note',
      label: '',
      placeholder: '',
    },
    {
      _type: 'two_options_question',
      _key: 'pick',
      question_text: [],
      options: [],
    },
    {
      _type: 'matching_question',
      _key: 'match',
      question_text: [],
      matching_pairs: [],
    },
  ] as never;
  expect(activityResponseKeys(instructions, 'question:')).toEqual([
    { key: 'required-note', required: true },
    { key: 'optional-note', required: false },
    { key: 'question:pick', required: true },
    { key: 'question:match', required: true },
  ]);
});
