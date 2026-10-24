import type { SanityActivityPage } from '../types/sanity';

export function canSubmitLessonActivity(
  instructions: SanityActivityPage['instructions'],
  inputs: Record<string, string>,
  answers: Record<string, string | string[]>
): boolean {
  return instructions.every(block => {
    switch (block._type) {
      case 'large_input_box':
      case 'mid_input_box':
      case 'small_input_box':
        return !block.required || Boolean(inputs[block._key]?.trim());
      case 'multiple_choice_single':
      case 'two_options_question': {
        const answer = answers[block._key];
        return typeof answer === 'string' && block.options.some(option => option.value === answer);
      }
      case 'multiple_choice_multiple': {
        const answer = answers[block._key];
        return Array.isArray(answer) && answer.length > 0 &&
          answer.every(value => block.options.some(option => option.value === value));
      }
      case 'matching_question': {
        const answer = answers[block._key];
        return Array.isArray(answer) &&
          block.matching_pairs.every(pair => answer.includes(pair._key));
      }
      default:
        return true;
    }
  });
}

/** Stored field keys that must be submitted before an activity counts as done. */
export function requiredResponseKeys(
  instructions: SanityActivityPage['instructions'],
  questionPrefix: string
): string[] {
  return instructions.flatMap(block => {
    switch (block._type) {
      case 'large_input_box':
      case 'mid_input_box':
      case 'small_input_box':
        return block.required ? [block._key] : [];
      case 'multiple_choice_single':
      case 'two_options_question':
      case 'multiple_choice_multiple':
      case 'matching_question':
        return [questionPrefix + block._key];
      default:
        return [];
    }
  });
}
