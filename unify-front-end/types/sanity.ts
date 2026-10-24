// Sanity.io types based on the provided schemas

// Base Sanity document structure
export interface SanityDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
}

// Sanity block content (for rich text)
export interface SanityBlock {
  _type: 'block';
  _key: string;
  style: string;
  children: SanitySpan[];
  markDefs: any[];
}

export interface SanitySpan {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];
}

// Sanity image
export interface SanityImage {
  _type: 'image';
  _key: string;
  asset: {
    _ref: string;
    _type: 'reference';
  };
  alt?: string;
}

// Module type
export interface SanityModule extends SanityDocument {
  _type: 'module';
  title: string;
  description?: string;
  colorTheme?: {
    hex: string;
  };
  icon?: string;
  /** One of the 13 province names for a province-only module; empty is national. */
  province?: string | null;
}

// Submodule type
export interface SanitySubmodule extends SanityDocument {
  _type: 'submodule';
  title: string;
  description?: string;
  module: {
    _ref: string;
    _type: 'reference';
  };
  intro_pages?: SanityIntroPage[];
  order: number;
}

export interface SanityIntroPage {
  _key: string;
  title: string;
  order: number;
  content: (SanityBlock | SanityImage | SanityChecklistCheckbox)[];
  markDefs?: any[];
}

// Lesson type
export interface SanityLesson extends SanityDocument {
  _type: 'lesson';
  title: string;
  slug: {
    current: string;
    _type: 'slug';
  };
  description?: string;
  submodule: {
    _ref: string;
    _type: 'reference';
  };
  pages?: SanityLessonPage[];
  activity_pages?: SanityActivityPage[];
  ending_pages?: SanityEndingPage[];
  lesson_page_count?: number;
  activity_page_count?: number;
  ending_page_count?: number;
  quiz_question_count?: number;
  order: number;
}

export interface SanityLessonPage {
  _key: string;
  title: string;
  order: number;
  content: (
    | SanityBlock
    | SanityImage
    | SanityDropdown
    | SanityExampleBox
    | SanityTipBox
    | SanityNoteBox
    | SanityChecklistCheckbox
  )[];
  markDefs?: any[];
}

export interface SanityDropdown {
  _type: 'dropdown';
  _key: string;
  label: string;
  content: string;
}

export interface SanityExampleBox {
  _type: 'example_box';
  _key: string;
  content: SanityBlock[];
}

export interface SanityTipBox {
  _type: 'tip_box';
  _key: string;
  content: SanityBlock[];
}

export interface SanityNoteBox {
  _type: 'note_box';
  _key: string;
  content: SanityBlock[];
}

export interface SanityChecklistCheckbox {
  _type: 'checklist_checkbox';
  _key: string;
  label: string;
  defaultChecked?: boolean;
}

export interface SanityActivityPage {
  _key: string;
  title: string;
  order: number;
  instructions: (
    | SanityBlock
    | SanityLargeInputBox
    | SanityMidInputBox
    | SanitySmallInputBox
    | SanityMultipleChoiceSingle
    | SanityMultipleChoiceMultiple
    | SanityTwoOptionsQuestion
    | SanityMatchingQuestion
    | SanityChecklistCheckbox
  )[];
  instructionsMarkDefs?: any[];
  answer_box?: SanityAnswerBox;
}

export interface SanityEndingPage {
  _key: string;
  title: string;
  order: number;
  content: (
    | SanityBlock
    | SanityImage
    | SanityDropdown
    | SanityExampleBox
    | SanityTipBox
    | SanityNoteBox
    | SanityChecklistCheckbox
  )[];
  markDefs?: any[];
}

export interface SanityLargeInputBox {
  _type: 'large_input_box';
  _key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface SanityMidInputBox {
  _type: 'mid_input_box';
  _key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface SanitySmallInputBox {
  _type: 'small_input_box';
  _key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface SanityMultipleChoiceSingle {
  _type: 'multiple_choice_single';
  _key: string;
  question_text: SanityBlock[];
  options: SanityActivityOption[];
}

export interface SanityMultipleChoiceMultiple {
  _type: 'multiple_choice_multiple';
  _key: string;
  question_text: SanityBlock[];
  options: SanityActivityOption[];
}

export interface SanityTwoOptionsQuestion {
  _type: 'two_options_question';
  _key: string;
  question_text: SanityBlock[];
  options: SanityActivityOption[];
}

export interface SanityMatchingQuestion {
  _type: 'matching_question';
  _key: string;
  question_text: SanityBlock[];
  matching_pairs: SanityMatchingPair[];
}

export interface SanityActivityOption {
  _key: string;
  text: SanityBlock[];
  textMarkDefs?: any[];
  value: string;
  is_correct: boolean;
  explanation?: SanityBlock[];
}

export interface SanityAnswerBox {
  title?: string;
  content: (SanityBlock | SanityChecklistCheckbox)[];
  markDefs?: any[];
  showAfterSubmit: boolean;
}

// Quiz type
export interface SanityQuiz extends SanityDocument {
  _type: 'quiz';
  lesson: {
    _ref: string;
    _type: 'reference';
  };
  title: string;
  description?: string;
  order_number: number;
  questions: SanityQuizQuestion[];
  question_count?: number;
}

export interface SanityQuizQuestion {
  _key: string;
  question_type:
    | 'multiple_choice_single'
    | 'multiple_choice_multiple'
    | 'true_false'
    | 'fill_blank'
    | 'short_answer'
    | 'matching'
    | 'long_answer';
  question_text: SanityBlock[];
  questionMarkDefs?: any[];
  options?: SanityQuizOption[];
  matching_pairs?: SanityMatchingPair[];
  correct_answer?: SanityCorrectAnswer;
  order_number: number;
  answer_box?: SanityAnswerBox;
}

export interface SanityQuizOption {
  _key: string;
  text: SanityBlock[];
  textMarkDefs?: any[];
  value: string;
  is_correct: boolean;
  explanation?: SanityBlock[];
}

export interface SanityMatchingPair {
  _key: string;
  left_item: string;
  right_item: string;
  explanation?: SanityBlock[];
}

export interface SanityCorrectAnswer {
  value: string[];
  explanation: SanityBlock[];
  points: number;
}

// Expanded types with references resolved
export interface SanityModuleWithSubmodules extends SanityModule {
  submodules?: SanitySubmoduleWithLessons[];
}

export interface SanitySubmoduleWithLessons extends SanitySubmodule {
  lessons?: SanityLessonWithQuizzes[];
}

export interface SanityLessonWithQuizzes extends SanityLesson {
  quizzes?: SanityQuiz[];
}

// Practice (submodule-level; replaces lesson quizzes + lesson activities for new content)
export interface SanityPractice extends SanityDocument {
  _type: 'practice';
  submodule: { _ref: string; _type: 'reference' };
  title: string;
  description?: string;
  practice_type: 'quiz' | 'activity';
  order_number: number;
  questions?: SanityQuizQuestion[];
  pages?: SanityPracticeActivityPage[];
}

export interface SanityPracticeActivityPage {
  _key: string;
  title: string;
  order: number;
  instructions: (
    | SanityBlock
    | SanityLargeInputBox
    | SanityMidInputBox
    | SanitySmallInputBox
    | SanityMultipleChoiceSingle
    | SanityMultipleChoiceMultiple
    | SanityTwoOptionsQuestion
    | SanityMatchingQuestion
    | SanityChecklistCheckbox
  )[];
  answer_box?: SanityAnswerBox;
}

// Task (submodule-level single-page content; same content blocks as lesson page)
export interface SanityTask extends SanityDocument {
  _type: 'task';
  title: string;
  submodule: { _ref: string; _type: 'reference' };
  ordering: number;
  content?: (
    | SanityBlock
    | SanityImage
    | SanityDropdown
    | SanityExampleBox
    | SanityTipBox
    | SanityNoteBox
    | SanityChecklistCheckbox
  )[];
  markDefs?: any[];
}
