import type { Cost } from '@/types/partner';

/**
 * Shared semantic colors for the Resources directory.
 *
 * Keep text colors here so every foreground/background pair can be covered by
 * the contrast regression suite instead of drifting inside component styles.
 *
 * Values come from the Resources redesign (Figma 8129:32045). Three of them are
 * darkened a step from the Figma swatch so they clear WCAG AA on their own
 * background — each is marked below with the Figma value it replaces.
 */
export const RESOURCE_THEME = {
  // --- Surfaces
  surface: '#FFFFFF',
  surfaceSubtle: '#F8F9FA',
  /** Segmented-control track. */
  surfaceSegment: '#F1EFEB',
  /** Search field fill. */
  surfaceSearch: '#F4F2EE',
  surfaceChip: '#F3F4F6',
  /** Service-area chip on a partner card. */
  surfaceChipNeutral: '#F4F2EE',
  /** Hairline around a category card on white. */
  cardBorder: '#E7E4DE',
  /** Divider above the pinned action bar on the partner detail screen. */
  actionBarBorder: '#ECEAE6',
  /** Outline on a secondary action button. */
  buttonOutline: '#D8D5CD',

  // --- Text
  textHeading: '#1A1815',
  /** Category-card title. */
  textCard: '#23211D',
  textStrong: '#1F2937',
  textBody: '#3A3A3A',
  textDetail: '#374151',
  /**
   * About copy and contact values on the partner detail screen. The warm
   * counterpart to textDetail, which is a blue-grey and reads cold beside the
   * warm greys the rest of the directory uses.
   */
  textDetailWarm: '#3F3C36',
  textSecondary: '#6F6C64',
  /** Page subtitle. Same value as the Lessons subtitle in the Learn tab. */
  textSubtitle: '#000000',
  textMuted: '#626269',
  /** Card org count. Figma #8B8880 → 3.54:1 on white, below AA. */
  textCount: '#79766F',
  /** Search placeholder + leading icon. Figma #747474 → 4.18:1, below AA. */
  textPlaceholder: '#6E6E6E',
  textSegmentActive: '#1C1A17',
  /** Inactive segment label. Figma #7A776F → 3.89:1 on the track, below AA. */
  textSegmentInactive: '#6F6D65',
  textLabel: '#5F6672',

  // --- Accents
  /** Inline link ("How we choose these"). */
  link: '#0F766E',
} as const;

/**
 * Cost chip on a partner card (Figma 8132:33073 / 8132:33078 / 8132:33130).
 *
 * Cost is the field a newcomer scans a directory row for, so free and mixed
 * carry colour. Paid takes the same neutral as the service-area chip beside it,
 * which leaves "Free" as the only chip in the row that draws the eye.
 *
 * Figma specifies free and mixed only; paid is ours. All three pairs clear
 * WCAG AA unaltered and are covered by the contrast regression suite.
 */
export const COST_CHIP: Record<Cost, { background: string; text: string }> = {
  free: { background: '#E6F7F4', text: RESOURCE_THEME.link },
  mixed: { background: '#FDF1E2', text: '#9A6318' },
  paid: {
    background: RESOURCE_THEME.surfaceChipNeutral,
    text: RESOURCE_THEME.textSecondary,
  },
};
