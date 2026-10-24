const DEFAULT_BOTTOM_SHEET_PADDING = 20;
const DEFAULT_TAB_BAR_PADDING = 12;

export function getBottomSheetPadding(
  bottomInset: number,
  basePadding = DEFAULT_BOTTOM_SHEET_PADDING
): number {
  return basePadding + Math.max(0, bottomInset);
}

export function getTabBarBottomPadding(bottomInset: number): number {
  return DEFAULT_TAB_BAR_PADDING + Math.max(0, bottomInset);
}
