import { lessonPresentation } from '@/utils/lessonPresentation';
import type { LessonSection } from '@/types/lessonSections';

const paragraph = (key: string, text: string) => ({
  _type: 'block' as const, _key: key, style: 'normal' as const,
  children: [{ _type: 'span' as const, _key: `${key}-span`, text, marks: [] }], markDefs: [],
});

test('moves retained content without changing source data or saved block identities', () => {
  const teaching = paragraph('teaching', 'Keep the teaching text.');
  const example = paragraph('saved-example', 'An existing example.');
  const citation = { ...paragraph('saved-citation', 'Citation: Official source'),
    markDefs: [{ _type: 'link' as const, _key: 'link', href: 'https://example.com/source' }] };
  const sections: LessonSection[] = [
    { _type: 'lessonConcept', _key: 'concept', content: [teaching,
      { _type: 'example_box', _key: 'box', content: [example] }, citation] },
    { _type: 'lessonExample', _key: 'example', theory: [], practice: [paragraph('new-example', 'Another example.')] },
    { _type: 'lessonCitations', _key: 'citations', sources: [
      { _key: 'duplicate', title: 'Official source', url: 'https://example.com/source' },
      { _key: 'additional', title: 'Additional source', url: 'https://example.com/other' },
    ] },
  ];
  const before = JSON.stringify(sections);
  const result = lessonPresentation(sections);
  expect(JSON.stringify(sections)).toBe(before);
  expect(result.sections[0]).toMatchObject({ content: [teaching] });
  expect(result.sections[1]).toMatchObject({ practice: [example, paragraph('new-example', 'Another example.')] });
  expect(result.citationContent).toEqual([citation]);
  expect(result.sections[2]).toMatchObject({ sources: [{ _key: 'additional' }] });
});

test('retains examples and citations when no destination section exists', () => {
  const content = [{ _type: 'example_box' as const, _key: 'box', content: [paragraph('example', 'Example')] }];
  const sections: LessonSection[] = [{ _type: 'lessonConcept', _key: 'concept', content }];
  expect(lessonPresentation(sections)).toEqual({ sections, citationContent: [] });
});
