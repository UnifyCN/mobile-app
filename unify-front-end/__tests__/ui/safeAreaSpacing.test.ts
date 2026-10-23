import {
  getBottomSheetPadding,
  getTabBarBottomPadding,
} from '@/utils/safeAreaSpacing';

describe('safe area spacing', () => {
  it('adds the Android system navigation inset below bottom sheet content', () => {
    expect(getBottomSheetPadding(24)).toBe(44);
  });

  it('keeps the normal bottom sheet padding when there is no inset', () => {
    expect(getBottomSheetPadding(0)).toBe(20);
  });

  it('keeps tab controls above both gesture and three-button navigation', () => {
    expect(getTabBarBottomPadding(0)).toBe(12);
    expect(getTabBarBottomPadding(24)).toBe(36);
  });
});
