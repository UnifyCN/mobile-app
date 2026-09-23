import type { ImageSourcePropType } from 'react-native';

export type PartnerCategory =
  | 'gettingSettled'
  | 'findWork'
  | 'immigrationHelp'
  | 'librariesLearning'
  | 'communityBelonging'
  | 'networksPlanning'
  | 'internationalStudents'
  | 'insurance'
  | 'money';

export type PartnershipType = 'resource' | 'referral';

export type ResourceLinkTarget =
  | 'partner_website'
  | 'program'
  | 'phone'
  | 'email'
  | 'directions';

export type ResourceLinkFailureReason = 'invalid_url' | 'launch_failed';

/** Fixed display order for the category grid. */
export const CATEGORY_ORDER: PartnerCategory[] = [
  'gettingSettled',
  'findWork',
  'immigrationHelp',
  'librariesLearning',
  'communityBelonging',
  'networksPlanning',
  'internationalStudents',
  'insurance',
  'money',
];

/** i18n keys — resolve with `t()` at render time, never render these directly. */
export const PARTNER_CATEGORY_LABEL_KEYS: Record<PartnerCategory, string> = {
  gettingSettled: 'learn.resources.category.gettingSettled.label',
  findWork: 'learn.resources.category.findWork.label',
  immigrationHelp: 'learn.resources.category.immigrationHelp.label',
  librariesLearning: 'learn.resources.category.librariesLearning.label',
  communityBelonging: 'learn.resources.category.communityBelonging.label',
  networksPlanning: 'learn.resources.category.networksPlanning.label',
  internationalStudents: 'learn.resources.category.internationalStudents.label',
  insurance: 'learn.resources.category.insurance.label',
  money: 'learn.resources.category.money.label',
};

/** i18n keys — resolve with `t()` at render time, never render these directly. */
export const PARTNER_CATEGORY_DESCRIPTION_KEYS: Record<
  PartnerCategory,
  string
> = {
  gettingSettled: 'learn.resources.category.gettingSettled.description',
  findWork: 'learn.resources.category.findWork.description',
  immigrationHelp: 'learn.resources.category.immigrationHelp.description',
  librariesLearning: 'learn.resources.category.librariesLearning.description',
  communityBelonging: 'learn.resources.category.communityBelonging.description',
  networksPlanning: 'learn.resources.category.networksPlanning.description',
  internationalStudents:
    'learn.resources.category.internationalStudents.description',
  insurance: 'learn.resources.category.insurance.description',
  money: 'learn.resources.category.money.description',
};

/** MaterialCommunityIcons names. */
export const PARTNER_CATEGORY_ICONS: Record<PartnerCategory, string> = {
  gettingSettled: 'account-group',
  findWork: 'briefcase-outline',
  immigrationHelp: 'passport',
  librariesLearning: 'book-open-variant',
  communityBelonging: 'hand-heart-outline',
  networksPlanning: 'sitemap',
  internationalStudents: 'school-outline',
  insurance: 'shield-check-outline',
  money: 'bank-outline',
};

/**
 * Accent color per category (tiles, monograms, pills, highlight checks).
 * The first five carry over from the previous taxonomy. Networks & Planning
 * Tables takes a muted slate — it coordinates services rather than delivering
 * them, so it reads as distinct from the direct-service categories. The
 * remaining three take hues not already in use so no two tiles read as a pair.
 */
export const PARTNER_CATEGORY_COLORS: Record<PartnerCategory, string> = {
  gettingSettled: '#167A69',
  findWork: '#2563A5',
  immigrationHelp: '#B8463B',
  librariesLearning: '#6352B5',
  communityBelonging: '#A64F00',
  networksPlanning: '#465570',
  internationalStudents: '#963F6D',
  insurance: '#287447',
  money: '#7D5A0B',
};

/** Soft tint per category (pill backgrounds, gradient fallback). */
export const PARTNER_CATEGORY_TINTS: Record<PartnerCategory, string> = {
  gettingSettled: '#EAF7F0',
  findWork: '#EAF1FA',
  immigrationHelp: '#FCEDEB',
  librariesLearning: '#EFEDFB',
  communityBelonging: '#FDF1E4',
  networksPlanning: '#EDEFF4',
  internationalStudents: '#FAEDF3',
  insurance: '#EAF6EF',
  money: '#FBF3E3',
};

/**
 * Icon-chip fill behind a category glyph on the Resources grid (Figma
 * 8129:32045). Pairs with `assets/icons/resources/<category>.svg`, whose glyph
 * fill is a darker tone of the same hue; the contrast suite reads that fill
 * straight out of the SVG so the pair cannot drift apart silently.
 *
 * Distinct from PARTNER_CATEGORY_TINTS, which backs body copy on the partner
 * detail screen and therefore has to stay light enough for #374151 text.
 */
export const PARTNER_CATEGORY_ICON_TINTS: Record<PartnerCategory, string> = {
  gettingSettled: '#B4E3D4',
  findWork: '#B5D9EC',
  immigrationHelp: '#F8CEC8',
  librariesLearning: '#D1C5EF',
  communityBelonging: '#F1D4BD',
  networksPlanning: '#CBD9ED',
  internationalStudents: '#EDC6DA',
  insurance: '#EEDEBD',
  money: '#B4E3B5',
};

/** What a service costs the person using it. */
export type Cost = 'free' | 'paid' | 'mixed';

/** i18n keys — resolve with `t()` at render time, never render these directly. */
export const COST_LABEL_KEYS: Record<Cost, string> = {
  free: 'learn.resources.cost.free',
  paid: 'learn.resources.cost.paid',
  mixed: 'learn.resources.cost.mixed',
};

/**
 * A program a partner runs — a first-class record, not free text, so the
 * directory can later be re-cut by program instead of by org.
 *
 * Structure only; its name, summary and eligibility copy live in the locale
 * files. Every field beyond `id` is optional: partner sites vary in what they
 * publish, and an unknown value must stay absent rather than be guessed.
 */
export interface PartnerProgram {
  /**
   * Immutable analytics identifier; never derive this from localized display
   * copy. Also the i18n key segment: the part after the partner's slug indexes
   * `learn.resources.partners.<slug>.programs.<key>`.
   */
  id: string;
  cost?: Cost;
  /**
   * Which category this program belongs to, independent of its parent org.
   * A large agency runs programs across several categories, so the org's own
   * category is a poor proxy. Unset for now — this is the hook that lets the
   * grid be re-cut by program later without re-modelling the data.
   */
  category?: PartnerCategory;
  /** Link opened in an in-app browser. */
  url?: string;
  /**
   * ISO date (YYYY-MM-DD). Set ONLY when a human confirmed this record by
   * phone or email — never from web research. Not surfaced in the UI yet.
   */
  lastVerified?: string;
}

export interface Partner {
  /**
   * Stable kebab-case id (also used in routes + analytics). Also the i18n key
   * segment: every string this partner displays lives under
   * `learn.resources.partners.<slug>`.
   */
  slug: string;
  /** The organization's own name. A proper noun — never translated. */
  name: string;
  category: PartnerCategory;
  /** 'resource' = informational; 'referral' = future commercial relationship. */
  partnershipType: PartnershipType;

  // --- "How to get help" — every field optional; render only when populated.
  // An absent value means "the partner does not publish this", NOT "free" or
  // "open to everyone". Never infer these.

  cost?: Cost;
  phone?: string;
  email?: string;
  address?: string;
  /** Public website; opened in an in-app browser. Button hidden if absent. */
  website?: string;
  /**
   * i18n key for the primary button, when "Visit website" understates what the
   * partner actually wants you to do ("Get a quote", "Apply online").
   * Defaults to `learn.resources.visitWebsite`. Resolve with `t()`.
   */
  ctaLabelKey?:
    | 'learn.resources.cta.applyOnline'
    | 'learn.resources.cta.bookAdvising'
    | 'learn.resources.cta.bookIntroMeeting'
    | 'learn.resources.cta.getQuote'
    | 'learn.resources.cta.joinLibrary'
    | 'learn.resources.cta.visitWelcomeCentre';
  /** Optional brand logo; falls back to a monogram avatar when absent. */
  logo?: ImageSourcePropType;
  /** Programs this partner runs, shown on the detail screen. */
  programs?: PartnerProgram[];
  /**
   * The primary `website` button is the only outbound link on the detail
   * screen: program cards are not tappable, and phone, email and address show
   * as plain text with no call, email or directions action. For referral
   * partners who attribute referrals through a tracked link.
   */
  ctaOnly?: boolean;
  /**
   * Promoted outside the directory: the Companion banner, the Resources
   * landing row, and the help rows on immigration Checklist items and Learn
   * modules. At most one active partner carries it; `getSpotlightPartner`
   * returns the first.
   */
  spotlight?: boolean;
  /**
   * ISO date (YYYY-MM-DD). Set ONLY when a human confirmed this record by
   * phone or email — never from web research. Not surfaced in the UI yet;
   * the "Last verified" badge is deliberately deferred.
   */
  lastVerified?: string;
  /** Lower numbers render first within a category. */
  displayOrder: number;
  /** Inactive partners are filtered out of all UI. */
  active: boolean;
}

// --- Localized copy -------------------------------------------------------
// A Partner record carries no display copy. These are the shapes a partner
// takes once `utils/localizePartner` has resolved its strings for the active
// language; components render these, never a bare Partner.

/** Copy a program publishes, resolved for the active language. */
export interface PartnerProgramCopy {
  /** Program name, e.g. "MentorConnect". */
  name: string;
  /** One-to-two line summary. */
  description: string;
  /** Who the program is for. Absent unless the partner states it. */
  eligibility?: string;
}

/** Copy an organization publishes, resolved for the active language. */
export interface PartnerCopy {
  /** One-line value prop shown in the list row. */
  tagline: string;
  /** Long-form "About" copy for the detail screen. */
  description: string;
  /** 2–4 "how they help newcomers" bullets. */
  highlights: string[];
  /** Area served, e.g. "Greater Vancouver", "Surrey", "British Columbia". */
  serviceArea: string;
  /**
   * Who qualifies. Many BC settlement services are IRCC-funded and limited to
   * permanent residents and protected persons, which excludes international
   * students and most temporary workers. Routing someone to a service they
   * are ineligible for is this feature's main failure mode, so this is set
   * only from an explicit statement by the partner.
   */
  eligibility?: string;
  /** How to make first contact: walk in, call, email, online form, referral. */
  howToStart?: string;
  /** Opening hours. Numerals stay numeric; only the day names translate. */
  hours?: string;
  /** Languages of service. Absent when unstated; never assumed to be English. */
  languages?: string[];
}

export type LocalizedPartnerProgram = PartnerProgram & PartnerProgramCopy;

export type LocalizedPartner = Omit<Partner, 'programs'> &
  PartnerCopy & {
    programs?: LocalizedPartnerProgram[];
  };
