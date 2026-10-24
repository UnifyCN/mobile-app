jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: jest.fn() },
}));
jest.mock('@/services/checklist/getUserTasks', () => ({
  getUserTasks: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/checklist/customChecklistTasks', () => ({
  getCustomChecklistTasks: jest.fn().mockResolvedValue([]),
}));

import { sanityClient } from '@/sanity-custom';
import { getUserTasks } from '@/services/checklist/getUserTasks';
import { getChecklistWithUserProgress } from '@/services/checklist/getChecklistWithUserProgress';

const BC = 'British Columbia';

// National checklist items whose "Learn how" target is a module. The module
// tag arrives in the item's projection.
const item = (id: string, extra: Record<string, unknown>) => ({
  _id: id,
  _type: 'checklist',
  title: id,
  class: 'do_now',
  class_order: 1,
  ...extra,
});
const documents = [
  item('to-bc-module', { module: { _id: 'sfu', title: 'SFU', province: BC } }),
  item('to-bc-submodule', {
    submodule: {
      _id: 'sfu-housing',
      title: 'Housing',
      moduleId: 'sfu',
      moduleProvince: BC,
    },
  }),
  item('to-national-module', {
    module: { _id: 'banking', title: 'Banking', province: null },
  }),
  item('to-national-submodule', {
    submodule: {
      _id: 'banking-cards',
      title: 'Cards',
      moduleId: 'banking',
      moduleProvince: null,
    },
  }),
  item('to-bc-module-via-tab', {
    link_tab: 'learn',
    module: { _id: 'sfu', title: 'SFU', province: BC },
  }),
  item('no-link', {}),
];

const tasksFor = async (province: string | null) => {
  const tasks = await getChecklistWithUserProgress(
    'user-1',
    'international_student',
    'not_arrived',
    { province }
  );
  return new Map(tasks.map(t => [t.sanity_checklist_id, t]));
};

describe('checklist "Learn how" links for a user in a province', () => {
  beforeEach(() => {
    (sanityClient.fetch as jest.Mock).mockResolvedValue(documents);
    (getUserTasks as jest.Mock).mockResolvedValue([
      {
        user_task_id: 7,
        user_id: 'user-1',
        task_id: null,
        sanity_checklist_id: 'to-bc-module',
        completed: true,
        completed_at: '2026-10-01T00:00:00Z',
        dismissed_at: null,
      },
    ]);
  });

  it('keeps every national task for an Ontario user', async () => {
    const tasks = await tasksFor('Ontario');
    expect([...tasks.keys()]).toEqual(documents.map(d => d._id));
  });

  it('drops the link to a BC module for an Ontario user, task and saved progress intact', async () => {
    const tasks = await tasksFor('Ontario');
    const task = tasks.get('to-bc-module')!;
    expect(task.task.linkModuleId).toBeUndefined();
    expect(task.task.linkSubmoduleId).toBeUndefined();
    expect(task.task.task_name).toBe('to-bc-module');
    expect(task.completed).toBe(true);
    expect(task.user_task_id).toBe(7);
  });

  it('drops the link to a submodule of a BC module for an Ontario user', async () => {
    const task = (await tasksFor('Ontario')).get('to-bc-submodule')!;
    expect(task.task.linkModuleId).toBeUndefined();
    expect(task.task.linkSubmoduleId).toBeUndefined();
  });

  it('drops the link to a BC module for a user with no province', async () => {
    const task = (await tasksFor(null)).get('to-bc-module')!;
    expect(task.task.linkModuleId).toBeUndefined();
  });

  it('keeps links to national modules for an Ontario user', async () => {
    const tasks = await tasksFor('Ontario');
    expect(tasks.get('to-national-module')!.task.linkModuleId).toBe('banking');
    expect(tasks.get('to-national-submodule')!.task).toMatchObject({
      linkModuleId: 'banking',
      linkSubmoduleId: 'banking-cards',
    });
  });

  it('keeps the links to BC modules for a BC user', async () => {
    const tasks = await tasksFor('BC');
    expect(tasks.get('to-bc-module')!.task.linkModuleId).toBe('sfu');
    expect(tasks.get('to-bc-submodule')!.task).toMatchObject({
      linkModuleId: 'sfu',
      linkSubmoduleId: 'sfu-housing',
    });
  });

  it('still opens the Learn tab for a task whose link_tab is learn', async () => {
    const task = (await tasksFor('Ontario')).get('to-bc-module-via-tab')!;
    expect(task.task.linkTab).toBe('learn');
  });
});
