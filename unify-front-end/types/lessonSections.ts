import type { SanityLessonPage, SanityImage } from './sanity';

export type LessonRichContent = SanityLessonPage['content'];
export type LessonSection =
  | {
      _type: 'lessonConcept';
      _key: string;
      title?: string;
      content: LessonRichContent;
    }
  | {
      _type: 'lessonExample';
      _key: string;
      title?: string;
      theory: LessonRichContent;
      practice: LessonRichContent;
    }
  | {
      _type: 'lessonVisual';
      _key: string;
      title?: string;
      image: SanityImage;
      caption?: string;
      content?: LessonRichContent;
    }
  | {
      _type: 'lessonQuickCheck';
      _key: string;
      title?: string;
      question: string;
      options: { _key: string; text: string; correct: boolean }[];
      explanation: string;
    }
  | {
      _type: 'lessonFaq';
      _key: string;
      title?: string;
      items: { _key: string; question: string; answer: LessonRichContent }[];
    }
  | {
      _type: 'lessonCitations';
      _key: string;
      title?: string;
      sources: {
        _key: string;
        title: string;
        publisher?: string;
        year?: string;
        url: string;
      }[];
    };
