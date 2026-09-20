import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_ORDER,
  PARTNER_CATEGORY_LABEL_KEYS,
  PARTNER_CATEGORY_DESCRIPTION_KEYS,
  PARTNER_CATEGORY_ICONS,
  PARTNER_CATEGORY_COLORS,
  PARTNER_CATEGORY_TINTS,
  PARTNER_CATEGORY_ICON_TINTS,
  COST_LABEL_KEYS,
  type Cost,
  type PartnerCategory,
} from '@/types/partner';
import en from '@/i18n/locales/en/translation.json';
import { COST_CHIP, RESOURCE_THEME } from '@/constants/ResourceTheme';

/** Walks a dotted i18n key against the EN baseline; undefined when absent. */
function resolveKey(key: string): unknown {
  return key
    .split('.')
    .reduce<any>((node, part) => (node == null ? undefined : node[part]), en);
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map(value => parseInt(value, 16) / 255)
    .map(value =>
      value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe('partner category metadata', () => {
  const maps: Record<string, Record<PartnerCategory, string>> = {
    labelKeys: PARTNER_CATEGORY_LABEL_KEYS,
    descriptionKeys: PARTNER_CATEGORY_DESCRIPTION_KEYS,
    icons: PARTNER_CATEGORY_ICONS,
    colors: PARTNER_CATEGORY_COLORS,
    tints: PARTNER_CATEGORY_TINTS,
    iconTints: PARTNER_CATEGORY_ICON_TINTS,
  };

  it('CATEGORY_ORDER has all 9 categories, no duplicates', () => {
    expect(CATEGORY_ORDER).toHaveLength(9);
    expect(new Set(CATEGORY_ORDER).size).toBe(9);
  });

  it.each(Object.entries(maps))('every category has a %s entry', (_n, map) => {
    for (const cat of CATEGORY_ORDER) expect(map[cat]).toBeTruthy();
  });

  it('every category label + description key resolves in the en locale', () => {
    for (const cat of CATEGORY_ORDER) {
      expect(typeof resolveKey(PARTNER_CATEGORY_LABEL_KEYS[cat])).toBe(
        'string'
      );
      expect(typeof resolveKey(PARTNER_CATEGORY_DESCRIPTION_KEYS[cat])).toBe(
        'string'
      );
    }
  });

  it('color + tint values are 6-digit hex', () => {
    for (const cat of CATEGORY_ORDER) {
      expect(PARTNER_CATEGORY_COLORS[cat]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(PARTNER_CATEGORY_TINTS[cat]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('category accents meet WCAG AA contrast with white tile text', () => {
    for (const category of CATEGORY_ORDER) {
      const contrast = contrastRatio(
        RESOURCE_THEME.surface,
        PARTNER_CATEGORY_COLORS[category]
      );
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('category accents meet WCAG AA contrast on their soft tints', () => {
    for (const category of CATEGORY_ORDER) {
      expect(
        contrastRatio(
          PARTNER_CATEGORY_COLORS[category],
          PARTNER_CATEGORY_TINTS[category]
        )
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['heading on white', RESOURCE_THEME.textHeading, RESOURCE_THEME.surface],
    ['strong text on white', RESOURCE_THEME.textStrong, RESOURCE_THEME.surface],
    ['body text on white', RESOURCE_THEME.textBody, RESOURCE_THEME.surface],
    [
      'secondary text on white',
      RESOURCE_THEME.textSecondary,
      RESOURCE_THEME.surface,
    ],
    ['muted text on white', RESOURCE_THEME.textMuted, RESOURCE_THEME.surface],
    [
      'inactive segment text',
      RESOURCE_THEME.textSegmentInactive,
      RESOURCE_THEME.surfaceSegment,
    ],
    [
      'active segment text',
      RESOURCE_THEME.textSegmentActive,
      RESOURCE_THEME.surface,
    ],
    ['card title on white', RESOURCE_THEME.textCard, RESOURCE_THEME.surface],
    [
      'card org count on white',
      RESOURCE_THEME.textCount,
      RESOURCE_THEME.surface,
    ],
    [
      'search placeholder on the search field',
      RESOURCE_THEME.textPlaceholder,
      RESOURCE_THEME.surfaceSearch,
    ],
    ['inline link on white', RESOURCE_THEME.link, RESOURCE_THEME.surface],
    [
      'page subtitle on white',
      RESOURCE_THEME.textSubtitle,
      RESOURCE_THEME.surface,
    ],
    ['detail label on white', RESOURCE_THEME.textLabel, RESOURCE_THEME.surface],
    ['detail text on white', RESOURCE_THEME.textDetail, RESOURCE_THEME.surface],
    [
      'partner detail body + contact values on white',
      RESOURCE_THEME.textDetailWarm,
      RESOURCE_THEME.surface,
    ],
    [
      'chip label on subtle surface',
      RESOURCE_THEME.textLabel,
      RESOURCE_THEME.surfaceChip,
    ],
    [
      'empty-state text on subtle surface',
      RESOURCE_THEME.textSecondary,
      RESOURCE_THEME.surfaceSubtle,
    ],
    [
      'service-area chip on a partner card',
      RESOURCE_THEME.textSecondary,
      RESOURCE_THEME.surfaceChipNeutral,
    ],
  ])('%s meets WCAG AA contrast', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('every cost has a chip whose pair meets WCAG AA contrast', () => {
    for (const cost of Object.keys(COST_LABEL_KEYS) as Cost[]) {
      const chip = COST_CHIP[cost];
      expect(chip).toBeTruthy();
      expect(chip.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(chip.text).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // Compared as an object so a failure names the offending cost.
      expect({
        cost,
        meetsAA: contrastRatio(chip.text, chip.background) >= 4.5,
      }).toEqual({ cost, meetsAA: true });
    }
  });

  it('detail body copy meets WCAG AA contrast on every category tint', () => {
    for (const category of CATEGORY_ORDER) {
      expect(
        contrastRatio(
          RESOURCE_THEME.textDetail,
          PARTNER_CATEGORY_TINTS[category]
        )
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('category grid icons', () => {
  const ICON_DIR = path.join(__dirname, '../../assets/icons/resources');

  /**
   * Every painted fill in the file — the glyph paths, not the mask.
   *
   * Figma exports each icon as an alpha `<mask>` holding a bounding rect, then
   * the glyph. The mask rect is never painted, so it is dropped by element
   * rather than by position: keying on "the last fill" happened to work only
   * because the exporter emits the mask first, and would silently start
   * checking the wrong colour if that order changed or a glyph gained a second
   * tone.
   */
  function glyphFills(category: PartnerCategory): string[] {
    const svg = fs.readFileSync(path.join(ICON_DIR, `${category}.svg`), 'utf8');
    const painted = svg.replace(/<mask\b[\s\S]*?<\/mask>/g, '');
    const fills = [
      ...new Set(
        [...painted.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1])
      ),
    ];
    expect(fills.length).toBeGreaterThan(0);
    return fills;
  }

  it('ships one SVG per category', () => {
    for (const category of CATEGORY_ORDER) {
      expect(fs.existsSync(path.join(ICON_DIR, `${category}.svg`))).toBe(true);
    }
  });

  it('every glyph meets WCAG AA contrast on its icon-chip tint', () => {
    for (const category of CATEGORY_ORDER) {
      for (const fill of glyphFills(category)) {
        // Compared as an object so a failure names the offending icon and tone.
        expect({
          category,
          fill,
          meetsAA:
            contrastRatio(fill, PARTNER_CATEGORY_ICON_TINTS[category]) >= 4.5,
        }).toEqual({ category, fill, meetsAA: true });
      }
    }
  });
});
