import { getChecklistWithUserProgress } from '@/services/checklist/getChecklistWithUserProgress';
import { getChecklistByPersonaAndStage } from '@/services/sanity/checklist';
import { getUserTasks } from '@/services/checklist/getUserTasks';
import { getCustomChecklistTasks } from '@/services/checklist/customChecklistTasks';
import type { SanityChecklistItem } from '@/types/checklist';

jest.mock('@/services/sanity/checklist', () => ({
  getChecklistByPersonaAndStage: jest.fn(),
}));
jest.mock('@/services/checklist/getUserTasks', () => ({
  getUserTasks: jest.fn(),
}));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn(),
}));
const content = jest.mocked(getChecklistByPersonaAndStage);
const progress = jest.mocked(getUserTasks);
const custom = jest.mocked(getCustomChecklistTasks);
const item: SanityChecklistItem = {
  _id: 'national',
  _type: 'checklist',
  title: 'National task',
  class: 'do_now',
  class_order: 1,
  personas: ['other'],
  stage: 'not_arrived',
};

beforeEach(() => {
  jest.resetAllMocks();
  content.mockResolvedValue([item]);
  progress.mockResolvedValue([]);
  custom.mockResolvedValue([]);
});

test('starts custom tasks while content is pending and preserves the merged result', async () => {
  let release!: (value: SanityChecklistItem[]) => void;
  content.mockReturnValue(
    new Promise(resolve => {
      release = resolve;
    })
  );
  const result = getChecklistWithUserProgress(
    'user-a',
    'other',
    'not_arrived',
    { province: 'Ontario', language: 'es' }
  );
  try {
    expect(custom).toHaveBeenCalledWith('user-a');
    expect(progress).not.toHaveBeenCalled();
  } finally {
    release([item]);
  }
  expect(await result).toMatchObject([
    { sanity_checklist_id: 'national', completed: false },
  ]);
  expect(content).toHaveBeenCalledWith('other', 'not_arrived', {
    skipCache: true,
    language: 'es',
    province: 'Ontario',
  });
});

test('skips saved suggestion reads when content is empty', async () => {
  content.mockResolvedValue([]);
  await expect(
    getChecklistWithUserProgress('user-a', 'other', 'not_arrived', {})
  ).resolves.toEqual([]);
  expect(progress).not.toHaveBeenCalled();
  expect(custom).toHaveBeenCalledWith('user-a');
});

test.each(['content', 'progress', 'custom'])(
  'propagates a %s failure without replacing cached tasks with an empty success',
  async source => {
    const error = new Error(`${source} offline`);
    ({ content, progress, custom })[
      source as 'content' | 'progress' | 'custom'
    ].mockRejectedValueOnce(error);
    await expect(
      getChecklistWithUserProgress('user-a', 'other', 'not_arrived', {})
    ).rejects.toBe(error);
  }
);
