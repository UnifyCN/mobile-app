import {
  getLessonExitDestination,
  withLearnOrigin,
} from '@/utils/learnOriginNavigation';

describe('Learn navigation origin', () => {
  it('returns to Checklist when a lesson was opened from Checklist', () => {
    expect(
      getLessonExitDestination(
        'checklist',
        '/(tabs)/Learn/modules/module/submodule'
      )
    ).toBe('/(tabs)/Checklist');
  });

  it('keeps the normal Learn destination without a Checklist origin', () => {
    const fallback = '/(tabs)/Learn/modules/module/submodule';

    expect(getLessonExitDestination(undefined, fallback)).toBe(fallback);
  });

  it('carries the Checklist origin into a lesson URL', () => {
    expect(withLearnOrigin('/lesson/1', 'checklist')).toBe(
      '/lesson/1?origin=checklist'
    );
  });
});
