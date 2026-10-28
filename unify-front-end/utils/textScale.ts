import { getTabBarBottomPadding } from '@/utils/safeAreaSpacing';

export const BAR_LABEL_MAX_SCALE = 1.35;

export function getTabBarHeight(bottomInset: number, _fontScale: number): number {
  return 56 + getTabBarBottomPadding(bottomInset);
}
