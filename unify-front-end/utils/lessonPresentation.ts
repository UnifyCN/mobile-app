import type { LessonSection, LessonRichContent } from '@/types/lessonSections';

/** Move retained legacy examples and citations into their new sections without changing stored keys. */
export function lessonPresentation(sections: LessonSection[]): {
  sections: LessonSection[];
  citationContent: LessonRichContent;
} {
  const example = sections.find(section => section._type === 'lessonExample');
  const citations = sections.find(
    section => section._type === 'lessonCitations'
  );
  const examples: LessonRichContent = [];
  const citationContent: LessonRichContent = [];
  const movedUrls = new Set<string>();
  const result = sections
    .map(section => {
      if (section._type !== 'lessonConcept') return section;
      const content = section.content.filter(block => {
        if (
          example &&
          block._type === 'example_box' &&
          Array.isArray(block.content)
        ) {
          examples.push(...block.content);
          return false;
        }
        if (citations && block._type === 'block') {
          const text = (block.children || [])
            .map((span: any) => span.text || '')
            .join('')
            .trim();
          const links = (block.markDefs || []).filter(
            (mark: any) => mark._type === 'link' && mark.href
          );
          if (/^citations?\s*:/i.test(text) && links.length) {
            citationContent.push(block);
            links.forEach((link: any) => movedUrls.add(link.href));
            return false;
          }
        }
        return true;
      });
      return { ...section, content };
    })
    .map(section => {
      if (section === example && section._type === 'lessonExample') {
        return { ...section, practice: [...examples, ...section.practice] };
      }
      if (section === citations && section._type === 'lessonCitations') {
        return {
          ...section,
          sources: section.sources.filter(source => !movedUrls.has(source.url)),
        };
      }
      return section;
    });
  return { sections: result, citationContent };
}
