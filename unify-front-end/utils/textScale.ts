import { typography } from '@/constants/Typography';
import { getTabBarBottomPadding } from '@/utils/safeAreaSpacing';

/**
 * System text size at which a screen switches to its large-text layout: side-by-side
 * and fixed-width content stacks into one vertical scroll. iOS reports 1.353 for the
 * largest standard size (XXXL) and 1.786 for the first accessibility size; Android's
 * large steps start at 1.5. Text itself keeps scaling: this only changes the layout.
 */
export const LARGE_TEXT_SCALE = 1.5;

export const isLargeText = (fontScale: number) => fontScale >= LARGE_TEXT_SCALE;

/**
 * Bar chrome (the tab labels and a screen title in the top bar) stops growing at about
 * the largest standard size, as UIKit's bars do. On iOS a long press on a tab shows its
 * label in the Large Content Viewer. Content and controls in a screen keep full scaling.
 */
export const BAR_LABEL_MAX_SCALE = 1.35;

const TAB_BAR_BASE_HEIGHT = 56;

/** Tab bar height for the bottom inset and the label's scaled line height. */
export function getTabBarHeight(
  bottomInset: number,
  fontScale: number
): number {
  const labelScale = Math.min(Math.max(fontScale, 1), BAR_LABEL_MAX_SCALE);
  const lineHeight = typography.tab.lineHeight;
  const labelGrowth = Math.ceil(lineHeight * labelScale) - lineHeight;
  return (
    TAB_BAR_BASE_HEIGHT + labelGrowth + getTabBarBottomPadding(bottomInset)
  );
}
