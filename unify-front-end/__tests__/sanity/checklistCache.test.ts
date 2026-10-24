import {
  buildChecklistCacheStorageKey,
  getChecklistMemoryCache,
  loadChecklistFromDisk,
  saveChecklistToDisk,
  setChecklistMemoryCache,
} from '@/utils/checklistTaskCache';

const tasks = [{ sanity_checklist_id: 'task-1' }] as any;

describe('checklist translation cache freshness', () => {
  afterEach(() => jest.restoreAllMocks());

  it('expires memory and persisted content so newly published translations revalidate', async () => {
    const now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const key = buildChecklistCacheStorageKey(
      'cache-test-user',
      1,
      'skilled_worker',
      false,
      'es',
      null
    );

    setChecklistMemoryCache(key, tasks);
    await saveChecklistToDisk(key, tasks);
    expect(getChecklistMemoryCache(key)).toEqual(tasks);
    expect(await loadChecklistFromDisk(key)).toEqual(tasks);

    nowSpy.mockReturnValue(now + 11 * 60 * 1000);
    expect(getChecklistMemoryCache(key)).toBeUndefined();
    await expect(loadChecklistFromDisk(key)).resolves.toBeNull();
  });
});
