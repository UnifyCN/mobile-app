import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Keyboard,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/utils/analytics';
import {
  getActivePartners,
  getCategoriesWithPartners,
} from '@/constants/Partners';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';
import {
  PARTNER_CATEGORY_LABEL_KEYS,
  type PartnerCategory,
} from '@/types/partner';
import { localizePartners } from '@/utils/localizePartner';
import { selectPartnersMatching } from '@/utils/searchPartners';
import CategoryTile from './CategoryTile';
import CategoryDetail from './CategoryDetail';
import HowWeChooseSheet from './HowWeChooseSheet';
import PartnerRow from './PartnerRow';
import ResourcesSearchBar from './ResourcesSearchBar';
import SpotlightRow from '@/components/partners/SpotlightRow';

/** Grid columns in Figma 8129:32595. */
const COLUMNS = 2;

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/**
 * Root view for the Resources tab inside Learn (Figma 8129:32045).
 *
 * Category grid by default; typing in the search field swaps the grid for
 * matching partners across every category, and tapping a category renders its
 * detail in-screen. Tapping a partner pushes app/(tabs)/Learn/resources/[slug].
 */
export default function ResourcesView() {
  const [selectedCategory, setSelectedCategory] =
    useState<PartnerCategory | null>(null);
  const [query, setQuery] = useState('');
  const [howWeChooseVisible, setHowWeChooseVisible] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const { trackResourcesViewed, trackResourcesCategoryOpened } = useAnalytics();
  const categories = getCategoriesWithPartners();

  useEffect(() => {
    trackResourcesViewed();
  }, [trackResourcesViewed]);

  const labelFor = useCallback(
    (category: PartnerCategory) => t(PARTNER_CATEGORY_LABEL_KEYS[category]),
    [t]
  );

  const isSearching = query.trim().length > 0;
  // Search runs over the copy the person is reading, so the whole directory is
  // localized first. `t` is the dependency: react-i18next hands back a new one
  // on languageChanged, which re-resolves every string.
  const partners = useMemo(() => localizePartners(getActivePartners(), t), [t]);
  const results = useMemo(
    () => (isSearching ? selectPartnersMatching(partners, query, labelFor) : []),
    [isSearching, partners, query, labelFor]
  );

  const openPartner = (slug: string) => {
    Keyboard.dismiss();
    // `from=search` so the detail screen's back nav names the segment it
    // returns to rather than the partner's category, which is not where the
    // person came from.
    router.push(`/(tabs)/Learn/resources/${slug}?from=search` as any);
  };

  if (selectedCategory) {
    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior='automatic'
        showsVerticalScrollIndicator={false}
      >
        <CategoryDetail
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
        />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior='automatic'
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='on-drag'
      >
        {/* Heading asks the question rather than repeating the segment label
            above it, which is why the old "Resources" H1 came out. */}
        <Text style={styles.heading} accessibilityRole='header'>
          {t('learn.resources.heading')}
        </Text>
        <Text style={styles.subtitle}>{t('learn.resources.subtitle')}</Text>
        {/* Figma breaks the line before the link; a Touchable rather than a
            nested <Text onPress> so the tap target clears 44pt. */}
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => setHowWeChooseVisible(true)}
          hitSlop={{ top: 10, bottom: 12, left: 8, right: 8 }}
          accessibilityRole='button'
        >
          <Text style={[styles.subtitle, styles.link]}>
            {t('learn.resources.howWeChoose.link')}
          </Text>
        </TouchableOpacity>

        <View style={styles.searchWrapper}>
          <ResourcesSearchBar value={query} onChangeText={setQuery} />
        </View>

        {isSearching ? (
          results.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {t('learn.resources.noSearchResultsTitle')}
              </Text>
              <Text style={styles.emptyText}>
                {t('learn.resources.noSearchResultsText', {
                  query: query.trim(),
                })}
              </Text>
            </View>
          ) : (
            <View>
              <Text style={styles.resultCount}>
                {t('learn.resources.searchResultCount', {
                  count: results.length,
                })}
              </Text>
              {results.map(partner => (
                <PartnerRow
                  key={partner.slug}
                  partner={partner}
                  onPress={() => openPartner(partner.slug)}
                />
              ))}
            </View>
          )
        ) : categories.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {t('learn.resources.emptyTitle')}
            </Text>
            <Text style={styles.emptyText}>
              {t('learn.resources.emptyText')}
            </Text>
          </View>
        ) : (
          <>
            {/* The spotlight partner sits above the grid, not inside it: a
                tile of its own would make one category read as paid-only. */}
            <View style={styles.spotlight}>
              <SpotlightRow variant='card' source='resources_spotlight' />
            </View>
            {chunk(categories, COLUMNS).map(row => (
              <View key={row[0].category} style={styles.gridRow}>
                {row.map(({ category, partnerCount }) => (
                  <CategoryTile
                    key={category}
                    category={category}
                    partnerCount={partnerCount}
                    onPress={() => {
                      trackResourcesCategoryOpened(category);
                      setSelectedCategory(category);
                    }}
                  />
                ))}
                {/* Keeps a lone trailing tile at column width instead of full. */}
                {row.length < COLUMNS && <View style={styles.gridFiller} />}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <HowWeChooseSheet
        visible={howWeChooseVisible}
        onClose={() => setHowWeChooseVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 100 },
  spotlight: { marginBottom: 10 },
  heading: {
    // Same size and weight as the Lessons greeting it sits opposite.
    fontSize: 24,
    fontWeight: '600',
    color: RESOURCE_THEME.textHeading,
    marginBottom: 8,
  },
  subtitle: {
    // Matches the Lessons page subtitle so the two views read as one screen.
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 20,
    color: RESOURCE_THEME.textSubtitle,
  },
  link: {
    color: RESOURCE_THEME.link,
    textDecorationLine: 'underline',
  },
  // Gaps widen as the relationship weakens: 8 holds the heading to its own
  // supporting line, 6 lifts the link clear of the paragraph it explains, 18
  // closes the block before the input.
  linkButton: { marginTop: 6 },
  searchWrapper: { marginTop: 18, marginBottom: 12 },
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  gridFiller: { flex: 1 },
  resultCount: {
    fontWeight: '500',
    fontSize: 12,
    color: RESOURCE_THEME.textCount,
    marginBottom: 4,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
    backgroundColor: RESOURCE_THEME.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: RESOURCE_THEME.textHeading,
    marginBottom: 6,
  },
  emptyText: {
    fontWeight: '400',
    fontSize: 13,
    color: RESOURCE_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
