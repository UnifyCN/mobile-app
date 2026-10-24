import { sanityQueryKeys } from '@/hooks/sanity/sanityQueryKeys';
import { checklistTasksQueryKey } from '@/hooks/checklist/checklistQueryKeys';
import { buildChecklistCacheStorageKey } from '@/utils/checklistTaskCache';

const ctx = (
  language: 'en' | 'ar',
  province: string | null | undefined = null
) => ({
  userId: 'user-1',
  stage: 2,
  personaSlug: 'worker',
  stageChanged: false,
  language,
  province,
});

describe('language-aware content cache keys', () => {
  it('separates Sanity lesson data by language', () => {
    expect(sanityQueryKeys.lesson('lesson-1', 'en')).not.toEqual(
      sanityQueryKeys.lesson('lesson-1', 'fr-CA')
    );
  });

  it('separates checklist React Query and disk caches by language', () => {
    expect(checklistTasksQueryKey(ctx('en'))).not.toEqual(
      checklistTasksQueryKey(ctx('ar'))
    );
    expect(buildChecklistCacheStorageKey(ctx('en'))).not.toEqual(
      buildChecklistCacheStorageKey(ctx('ar'))
    );
  });

  describe('checklist province isolation', () => {
    const queryKey = (province: string | null | undefined) =>
      checklistTasksQueryKey(ctx('en', province));
    const storageKey = (province: string | null | undefined) =>
      buildChecklistCacheStorageKey(ctx('en', province));

    it('separates the React Query cache by province', () => {
      expect(queryKey('Ontario')).not.toEqual(queryKey('British Columbia'));
      expect(queryKey('Ontario')).not.toEqual(queryKey(null));
    });

    it('separates the disk and memory cache by province', () => {
      expect(storageKey('Ontario')).not.toEqual(storageKey('British Columbia'));
      expect(storageKey('Ontario')).not.toEqual(storageKey(null));
    });

    it('uses `none` for no province and for unmatched free text', () => {
      expect(queryKey(null)).toContain('none');
      expect(queryKey('Somewhere Else')).toEqual(queryKey(null));
      expect(queryKey('')).toEqual(queryKey(undefined));
      expect(storageKey('Somewhere Else')).toEqual(storageKey(null));
      expect(storageKey(null).endsWith(':none')).toBe(true);
    });

    it('shares a key between spellings of the same province', () => {
      expect(queryKey('ON')).toEqual(queryKey('Ontario'));
      expect(storageKey('ON')).toEqual(storageKey('Ontario'));
    });
  });
});
