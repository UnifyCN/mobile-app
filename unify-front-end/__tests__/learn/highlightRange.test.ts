import { highlightRangeMatches } from '../../utils/highlightRange';
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
import { supabase } from '../../lib/supabase';
import {
  saveHighlight,
  Highlight,
} from '../../services/highlights/highlightService';
const row = {
  id: 'stored',
  user_id: 'user',
  lesson_id: 'lesson',
  page_key: 'page',
  block_key: 'block',
  start_word_index: 0,
  end_word_index: 1,
  selected_text: 'monthly costs',
  created_at: '',
} as Highlight;
test.each([
  [['travel', 'needs.'], 0, 1, 'monthly costs', false],
  [['depends', 'on'], 0, 1, 'Public transit', false],
  [['Tuition', 'costs'], 0, 1, 'Tuition costs', true],
  [['Tuition', 'costs'], 0, 1, 'Tuition\n costs', true],
  [['Tuition'], -1, 0, 'Tuition', false],
  [['Tuition'], 0, 2, 'Tuition', false],
  [['Tuition'], 0.5, 0.5, 'Tuition', false],
  [['Tuition'], 0, 0, '', false],
])(
  'validates saved text and bounds %#',
  (words, start, end, text, expected) => {
    expect(
      highlightRangeMatches(
        words as string[],
        start as number,
        end as number,
        text as string
      )
    ).toBe(expected);
  }
);
beforeEach(() => jest.clearAllMocks());
test('a stale overlapping range stays stored and does not expand a new selection', async () => {
  const insert = jest
    .fn()
    .mockReturnValue({
      select: () => ({ single: async () => ({ data: row, error: null }) }),
    });
  (supabase.from as jest.Mock).mockReturnValue({ insert });
  await saveHighlight(
    'lesson',
    'page',
    'block',
    1,
    1,
    'needs.',
    [row],
    ['travel', 'needs.']
  );
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      start_word_index: 1,
      end_word_index: 1,
      selected_text: 'needs.',
    })
  );
});
test('a matching overlapping range still merges', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: row, error: null });
  await saveHighlight(
    'lesson',
    'page',
    'block',
    1,
    2,
    'costs vary',
    [row],
    ['monthly', 'costs', 'vary']
  );
  expect(supabase.rpc).toHaveBeenCalledWith(
    'merge_highlights',
    expect.objectContaining({
      p_ids_to_delete: ['stored'],
      p_start_word_index: 0,
      p_end_word_index: 2,
      p_selected_text: 'monthly costs vary',
    })
  );
});

test('rejects a changed selection before any database write', async () => {
  await expect(saveHighlight('lesson', 'page', 'block', 0, 1, 'monthly costs', [], ['travel', 'needs.'])).rejects.toThrow('no longer matches');
  expect(supabase.from).not.toHaveBeenCalled();
  expect(supabase.rpc).not.toHaveBeenCalled();
});
