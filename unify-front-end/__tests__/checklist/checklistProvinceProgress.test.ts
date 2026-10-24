jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: jest.fn() },
}));
jest.mock('@/services/checklist/getUserTasks', () => ({
  getUserTasks: jest.fn(),
}));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn().mockResolvedValue([]),
}));

import { sanityClient } from '@/sanity-custom';
import { getUserTasks } from '@/services/checklist/getUserTasks';
import { getChecklistWithUserProgress } from '@/services/checklist/getChecklistWithUserProgress';

// Fixture documents stand in for Sanity. The fake fetch applies the rule the
// query states: no province is national, otherwise the province must match.
const documents = [
  { _id: 'national', title: 'Get a SIN', province: undefined },
  { _id: 'national-empty', title: 'Open a bank account', province: '' },
  { _id: 'bc-only', title: 'Apply for BC PNP', province: 'British Columbia' },
  { _id: 'ontario-only', title: 'Apply for OHIP', province: 'Ontario' },
].map(doc => ({
  ...doc,
  _type: 'checklist',
  class: 'do_now',
  class_order: 1,
}));

const savedProgress = (sanityId: string, completed: boolean) =>
  ({
    user_task_id: 1,
    user_id: 'user-1',
    task_id: null,
    sanity_checklist_id: sanityId,
    completed,
    completed_at: completed ? '2026-10-01T00:00:00Z' : null,
    dismissed_at: null,
  }) as any;

const checklistFor = async (province: string | null) => {
  const tasks = await getChecklistWithUserProgress(
    'user-1',
    'other',
    'not_arrived',
    { province }
  );
  return tasks.map(t => t.sanity_checklist_id);
};

describe('checklist for a user in a province', () => {
  beforeEach(() => {
    (sanityClient.fetch as jest.Mock).mockImplementation(
      async (_query: string, params: { province: string }) =>
        documents.filter(
          doc => !doc.province || doc.province === params.province
        )
    );
    (getUserTasks as jest.Mock).mockResolvedValue([
      savedProgress('national', true),
      savedProgress('bc-only', true),
    ]);
  });

  it('shows an Ontario user national and Ontario items only', async () => {
    expect(await checklistFor('Ontario')).toEqual([
      'national',
      'national-empty',
      'ontario-only',
    ]);
  });

  it('shows a BC user the BC item with its saved progress', async () => {
    const tasks = await getChecklistWithUserProgress(
      'user-1',
      'other',
      'not_arrived',
      { province: 'BC' }
    );
    expect(tasks.map(t => t.sanity_checklist_id)).toEqual([
      'national',
      'national-empty',
      'bc-only',
    ]);
    expect(
      tasks.find(t => t.sanity_checklist_id === 'bc-only')?.completed
    ).toBe(true);
  });

  it('keeps saved progress on national items when the user changes province', async () => {
    const tasks = await getChecklistWithUserProgress(
      'user-1',
      'other',
      'not_arrived',
      { province: 'Ontario' }
    );
    expect(
      tasks.find(t => t.sanity_checklist_id === 'national')?.completed
    ).toBe(true);
  });

  it.each([
    ['no province', null],
    ['unmatched free text', 'Somewhere Else'],
  ])('shows national items only for %s', async (_label, province) => {
    expect(await checklistFor(province)).toEqual([
      'national',
      'national-empty',
    ]);
  });
});
