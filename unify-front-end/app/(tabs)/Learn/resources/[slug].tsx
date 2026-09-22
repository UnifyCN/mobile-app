import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import TabHeader from '@/components/home/HomeHeader';
import { getPartnerBySlug } from '@/constants/Partners';
import { COST_CHIP, RESOURCE_THEME } from '@/constants/ResourceTheme';
import {
  PARTNER_CATEGORY_LABEL_KEYS,
  PARTNER_CATEGORY_ICONS,
  PARTNER_CATEGORY_COLORS,
  PARTNER_CATEGORY_TINTS,
  COST_LABEL_KEYS,
  type LocalizedPartner,
  type LocalizedPartnerProgram,
  type ResourceLinkTarget,
} from '@/types/partner';
import Monogram from '@/components/learn/Resources/Monogram';
import { useAnalytics } from '@/utils/analytics';
import { localizePartner } from '@/utils/localizePartner';
import { buildPartnerUrl } from '@/utils/partners';
import { launchResourceLink } from '@/utils/openResourceLink';

/** Programs listed before the "Show N more" disclosure (Figma 8134:33348). */
const PROGRAMS_COLLAPSED = 3;

function mapsUrl(address: string) {
  const q = encodeURIComponent(address);
  return Platform.select({
    ios: `http://maps.apple.com/?q=${q}`,
    default: `https://www.google.com/maps/search/?api=1&query=${q}`,
  }) as string;
}

/** Builds a dialable phone URI while preserving at most one leading plus. */
function phoneUrl(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `tel:${phone.trim().startsWith('+') ? `+${digits}` : digits}`;
}

/** The small uppercase label that opens each block. */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={styles.sectionLabel} accessibilityRole='header'>
      {children}
    </Text>
  );
}

/** A trailing link inside a contact row — "Map" beside the address. */
function RowLink({
  icon,
  label,
  color,
  onPress,
  a11y,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  a11y: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.rowLink}
      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
      accessibilityRole='button'
      accessibilityLabel={a11y}
    >
      <Feather name={icon} size={15} color={color} />
      <Text style={[styles.rowLinkText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** One labelled line in "Contact". Renders nothing without a value. */
function ContactRow({
  icon,
  label,
  value,
  action,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  action?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <View style={styles.contactRow}>
      <View style={styles.contactBody}>
        <View style={styles.contactLabelRow}>
          <Feather name={icon} size={12} color={RESOURCE_THEME.textCount} />
          <Text style={styles.contactLabel}>{label}</Text>
        </View>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
      {action}
    </View>
  );
}

/**
 * True when any optional "Contact" field is populated.
 *
 * serviceArea is deliberately not counted: it is required on every Partner, so
 * including it made this always true and the guard dead. A partner carrying
 * nothing but its service area shows no Contact block — the value is already on
 * the tag beside the category.
 */
function hasAnyContactField(p: LocalizedPartner) {
  return Boolean(
    p.eligibility ||
      p.howToStart ||
      p.phone ||
      p.email ||
      p.address ||
      p.hours ||
      p.languages?.length ||
      p.cost
  );
}

export default function PartnerDetailScreen() {
  // `from=search` means the person arrived from the landing screen's results
  // rather than from a category, so back names the segment, not the category.
  const { slug, from } = useLocalSearchParams<{
    slug: string;
    from?: string;
  }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [programsExpanded, setProgramsExpanded] = useState(false);
  const {
    trackResourcesPartnerOpened,
    trackResourcesPartnerWebsiteClicked,
    trackResourcesProgramClicked,
    trackResourcesLinkFailed,
  } = useAnalytics();
  const record = slug ? getPartnerBySlug(slug) : undefined;
  // Copy lives in the locale files, so the record is resolved for the active
  // language before anything reads a string off it.
  const partner = useMemo(
    () => (record ? localizePartner(record, t) : undefined),
    [record, t]
  );

  // Keyed on the record, not the localized copy: switching language re-resolves
  // every string and would otherwise report a second "partner opened".
  useEffect(() => {
    if (record) {
      trackResourcesPartnerOpened(
        record.slug,
        record.category,
        record.partnershipType
      );
    }
  }, [record, trackResourcesPartnerOpened]);

  const screenOptions = (
    <Stack.Screen
      options={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
  );

  const backLabel =
    from === 'search' || !partner
      ? t('learn.segment.resources')
      : t(PARTNER_CATEGORY_LABEL_KEYS[partner.category]);

  const backNav = (
    <TouchableOpacity
      onPress={() => router.back()}
      style={styles.backRow}
      activeOpacity={0.7}
      accessibilityRole='button'
      accessibilityLabel={backLabel}
      // Sized to the label and grown to 44pt with hitSlop, the same way the
      // category-detail back nav is. A 44pt minHeight centres the label and
      // leaves dead space above it.
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
    >
      <Feather
        name='chevron-left'
        size={18}
        color={RESOURCE_THEME.textSecondary}
      />
      <Text style={styles.backText}>{backLabel}</Text>
    </TouchableOpacity>
  );

  if (!partner) {
    return (
      <View style={styles.root}>
        {screenOptions}
        <TabHeader variant='minimal' />
        <View style={styles.notFound}>
          {backNav}
          <Text style={styles.notFoundText}>
            {t('learn.resources.notFound')}
          </Text>
        </View>
      </View>
    );
  }

  const color = PARTNER_CATEGORY_COLORS[partner.category];
  const tint = PARTNER_CATEGORY_TINTS[partner.category];
  const categoryLabel = t(PARTNER_CATEGORY_LABEL_KEYS[partner.category]);
  const categoryIcon = PARTNER_CATEGORY_ICONS[partner.category];
  // A ctaOnly partner routes every visit through its tracked website link, so
  // its programs, contact rows and action bar carry no other way out.
  const programs = partner.ctaOnly
    ? (partner.programs ?? []).map(program => ({ ...program, url: undefined }))
    : (partner.programs ?? []);
  const visiblePrograms = programsExpanded
    ? programs
    : programs.slice(0, PROGRAMS_COLLAPSED);
  const hiddenProgramCount = programs.length - PROGRAMS_COLLAPSED;
  // Large agencies run programs under different funding streams with different
  // rules, so there is often no single org-wide answer to "who is this for".
  const eligibility =
    partner.eligibility ??
    (programs.some(p => p.eligibility)
      ? t('learn.resources.variesByProgram')
      : undefined);

  const showOpenError = () =>
    Alert.alert(
      t('learn.resources.openErrorTitle'),
      t('learn.resources.openErrorMessage')
    );

  const handleExternalOpen = async (
    url: string,
    target: ResourceLinkTarget
  ) => {
    const launched = await launchResourceLink({
      buildUrl: () => new URL(url).toString(),
      launch: nextUrl => Linking.openURL(nextUrl),
      onFailure: reason =>
        trackResourcesLinkFailed(partner.slug, target, reason),
    });
    if (!launched) showOpenError();
  };

  const handleVisit = async () => {
    if (!partner.website) return;
    const launched = await launchResourceLink({
      buildUrl: () => buildPartnerUrl(partner, 'learn_resources'),
      onIntent: () =>
        trackResourcesPartnerWebsiteClicked(
          partner.slug,
          partner.partnershipType
        ),
      launch: url =>
        WebBrowser.openBrowserAsync(url, {
          controlsColor: color,
          toolbarColor: '#FFFFFF',
        }),
      onFailure: reason =>
        trackResourcesLinkFailed(partner.slug, 'partner_website', reason),
    });
    if (!launched) showOpenError();
  };

  const handleOpenProgram = async (program: LocalizedPartnerProgram) => {
    if (!program.url) return;
    const launched = await launchResourceLink({
      buildUrl: () => new URL(program.url!).toString(),
      onIntent: () => trackResourcesProgramClicked(partner.slug, program.id),
      launch: url =>
        WebBrowser.openBrowserAsync(url, {
          controlsColor: color,
          toolbarColor: '#FFFFFF',
        }),
      onFailure: reason =>
        trackResourcesLinkFailed(partner.slug, 'program', reason, program.id),
    });
    if (!launched) showOpenError();
  };

  return (
    <View style={styles.root}>
      {screenOptions}
      <TabHeader variant='minimal' />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior='automatic'
        showsVerticalScrollIndicator={false}
      >
        {backNav}

        <View style={styles.identity}>
          <Monogram
            name={partner.name}
            category={partner.category}
            size={54}
            source={partner.logo}
          />
          <View style={styles.identityText}>
            <Text style={styles.name} accessibilityRole='header'>
              {partner.name}
            </Text>
            <Text style={styles.tagline}>{partner.tagline}</Text>
          </View>
        </View>

        <View style={styles.tags}>
          <View style={[styles.tag, { backgroundColor: tint }]}>
            <MaterialCommunityIcons
              name={categoryIcon as any}
              size={13}
              color={color}
            />
            <Text style={[styles.tagText, { color }]}>{categoryLabel}</Text>
          </View>
          <View style={styles.tag}>
            <Feather
              name='map-pin'
              size={13}
              color={RESOURCE_THEME.textSecondary}
            />
            <Text style={styles.tagText}>{partner.serviceArea}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <SectionLabel>{t('learn.resources.about')}</SectionLabel>
          <Text style={styles.about}>{partner.description}</Text>
        </View>

        {programs.length > 0 && (
          <View style={styles.block}>
            <SectionLabel>
              {t('learn.resources.programsCount', { count: programs.length })}
            </SectionLabel>
            {visiblePrograms.map(program => {
              const chip = program.cost ? COST_CHIP[program.cost] : null;
              const body = (
                <>
                  <View style={styles.programTop}>
                    <Text style={styles.programName}>{program.name}</Text>
                    <View style={styles.programMeta}>
                      {chip && program.cost && (
                        <View
                          style={[
                            styles.programCost,
                            { backgroundColor: chip.background },
                          ]}
                        >
                          <Text
                            style={[
                              styles.programCostText,
                              { color: chip.text },
                            ]}
                          >
                            {t(COST_LABEL_KEYS[program.cost])}
                          </Text>
                        </View>
                      )}
                      {program.url && (
                        <Feather name='external-link' size={16} color={color} />
                      )}
                    </View>
                  </View>
                  <Text style={styles.programDesc}>{program.description}</Text>
                  {program.eligibility && (
                    <Text style={styles.programElig}>
                      <Text style={styles.programEligLabel}>
                        {t('learn.resources.whoItsFor')}{' '}
                      </Text>
                      {program.eligibility}
                    </Text>
                  )}
                </>
              );
              // Not every partner publishes a page per program; without a link
              // the card is information, not a tap target.
              return program.url ? (
                <TouchableOpacity
                  key={program.id}
                  onPress={() => handleOpenProgram(program)}
                  activeOpacity={0.75}
                  style={styles.programCard}
                  accessibilityRole='button'
                  accessibilityLabel={t('learn.resources.opensInBrowser', {
                    name: program.name,
                  })}
                >
                  {body}
                </TouchableOpacity>
              ) : (
                <View key={program.id} style={styles.programCard}>
                  {body}
                </View>
              );
            })}

            {hiddenProgramCount > 0 && (
              <TouchableOpacity
                onPress={() => setProgramsExpanded(value => !value)}
                activeOpacity={0.7}
                style={styles.disclosure}
                hitSlop={{ top: 10, bottom: 10 }}
                accessibilityRole='button'
              >
                <Text style={[styles.disclosureText, { color }]}>
                  {programsExpanded
                    ? t('learn.resources.showFewerPrograms')
                    : t('learn.resources.showMorePrograms', {
                        count: hiddenProgramCount,
                      })}
                </Text>
                <Feather
                  name={programsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={color}
                />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Contact — only populated fields render. An absent value means the
            partner does not publish it, so nothing is inferred. */}
        {hasAnyContactField(partner) && (
          <View style={styles.block}>
            <SectionLabel>{t('learn.resources.contact')}</SectionLabel>
            {/* Eligibility leads: routing someone to a service they are not
                eligible for is this feature's main failure mode. */}
            <ContactRow
              icon='users'
              label={t('learn.resources.whoItsFor')}
              value={eligibility}
            />
            <ContactRow
              icon='info'
              label={t('learn.resources.howToGetHelp')}
              value={partner.howToStart}
            />
            <ContactRow
              icon='map-pin'
              label={t('learn.resources.address')}
              value={partner.address}
              action={
                partner.address && !partner.ctaOnly ? (
                  <RowLink
                    icon='map'
                    label={t('learn.resources.map')}
                    color={color}
                    onPress={() =>
                      handleExternalOpen(
                        mapsUrl(partner.address!),
                        'directions'
                      )
                    }
                    a11y={t('learn.resources.directionsA11y', {
                      name: partner.name,
                    })}
                  />
                ) : undefined
              }
            />
            <ContactRow
              icon='mail'
              label={t('learn.resources.email')}
              value={partner.email}
              action={
                partner.email && !partner.ctaOnly ? (
                  <RowLink
                    icon='mail'
                    label={t('learn.resources.email')}
                    color={color}
                    onPress={() =>
                      handleExternalOpen(`mailto:${partner.email}`, 'email')
                    }
                    a11y={t('learn.resources.emailA11y', {
                      name: partner.name,
                    })}
                  />
                ) : undefined
              }
            />
            <ContactRow
              icon='phone'
              label={t('learn.resources.phone')}
              value={partner.phone}
            />
            <ContactRow
              icon='clock'
              label={t('learn.resources.hours')}
              value={partner.hours}
            />
            <ContactRow
              icon='globe'
              label={t('learn.resources.languages')}
              value={partner.languages?.join(', ')}
            />
            <ContactRow
              icon='tag'
              label={t('learn.resources.costLabel')}
              value={partner.cost ? t(COST_LABEL_KEYS[partner.cost]) : undefined}
            />
            <ContactRow
              icon='map'
              label={t('learn.resources.serves')}
              value={partner.serviceArea}
            />
          </View>
        )}
      </ScrollView>

      {/* Pinned above the tab bar. The primary button is whatever the partner
          actually wants you to do — "Get a quote", "Apply online" — falling
          back to "Visit website". Call takes the primary slot only when there
          is no website to send you to. */}
      <View style={styles.actionBar}>
        {partner.website ? (
          <TouchableOpacity
            onPress={handleVisit}
            activeOpacity={0.85}
            style={[styles.actionPrimary, { backgroundColor: color }]}
            accessibilityRole='button'
            accessibilityLabel={t('learn.resources.visitWebsiteA11y', {
              name: partner.name,
            })}
          >
            <Feather name='globe' size={17} color='#FFFFFF' />
            <Text style={styles.actionPrimaryText}>
              {t(partner.ctaLabelKey ?? 'learn.resources.visitWebsite')}
            </Text>
          </TouchableOpacity>
        ) : (
          partner.phone &&
          !partner.ctaOnly && (
            <TouchableOpacity
              onPress={() =>
                handleExternalOpen(phoneUrl(partner.phone!), 'phone')
              }
              activeOpacity={0.85}
              style={[styles.actionPrimary, { backgroundColor: color }]}
              accessibilityRole='button'
              accessibilityLabel={t('learn.resources.callA11y', {
                name: partner.name,
              })}
            >
              <Feather name='phone' size={17} color='#FFFFFF' />
              <Text style={styles.actionPrimaryText}>
                {t('learn.resources.call')}
              </Text>
            </TouchableOpacity>
          )
        )}

        {partner.website && partner.phone && !partner.ctaOnly && (
          <TouchableOpacity
            onPress={() => handleExternalOpen(phoneUrl(partner.phone!), 'phone')}
            activeOpacity={0.85}
            style={styles.actionIcon}
            accessibilityRole='button'
            accessibilityLabel={t('learn.resources.callA11y', {
              name: partner.name,
            })}
          >
            <Feather name='phone' size={19} color={color} />
          </TouchableOpacity>
        )}

        {partner.address && !partner.ctaOnly && (
          <TouchableOpacity
            onPress={() =>
              handleExternalOpen(mapsUrl(partner.address!), 'directions')
            }
            activeOpacity={0.85}
            style={styles.actionIcon}
            accessibilityRole='button'
            accessibilityLabel={t('learn.resources.directionsA11y', {
              name: partner.name,
            })}
          >
            <Feather name='navigation' size={19} color={color} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RESOURCE_THEME.surface },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 2,
    marginBottom: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: RESOURCE_THEME.textSecondary,
    marginLeft: 4,
  },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  identityText: { flex: 1, gap: 3 },
  name: {
    fontSize: 21,
    fontWeight: '800',
    color: RESOURCE_THEME.textHeading,
    letterSpacing: -0.3,
  },
  tagline: { fontSize: 12.5, lineHeight: 17, color: RESOURCE_THEME.textSecondary },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: RESOURCE_THEME.surfaceChipNeutral,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  tagText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: RESOURCE_THEME.textSecondary,
  },

  block: { marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: RESOURCE_THEME.textCount,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  about: {
    fontSize: 13.5,
    lineHeight: 21,
    color: RESOURCE_THEME.textDetailWarm,
  },

  programCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: RESOURCE_THEME.cardBorder,
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginBottom: 8,
  },
  programTop: {
    flexDirection: 'row',
    // Top-aligned: a long program name wraps, and a centred chip would then
    // float away from the first line it belongs to.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  programName: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: RESOURCE_THEME.textCard,
  },
  programMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  programCost: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  programCostText: { fontSize: 10.5, fontWeight: '800' },
  programDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: RESOURCE_THEME.textSecondary,
  },
  programElig: {
    fontSize: 12,
    lineHeight: 17,
    color: RESOURCE_THEME.textSecondary,
  },
  programEligLabel: { fontWeight: '700', color: RESOURCE_THEME.textCount },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  disclosureText: { fontSize: 12.5, fontWeight: '600' },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 9,
  },
  contactBody: { flex: 1 },
  contactLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: RESOURCE_THEME.textCount,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  contactValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: RESOURCE_THEME.textDetailWarm,
    marginTop: 1,
  },
  rowLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowLinkText: { fontSize: 11.5, fontWeight: '800' },

  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: RESOURCE_THEME.actionBarBorder,
    backgroundColor: RESOURCE_THEME.surface,
  },
  actionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  actionPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  actionIcon: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: RESOURCE_THEME.buttonOutline,
    borderRadius: 12,
    minHeight: 44,
  },

  notFound: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  notFoundText: {
    marginTop: 72,
    textAlign: 'center',
    color: RESOURCE_THEME.textMuted,
    fontSize: 14,
  },
});
